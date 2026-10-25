/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Test support: loads the real desktop bundle with a `vscode` stand-in whose
 * file system is the real disk, so a command can be driven end to end against
 * the browser installed on the machine. Not a test file itself.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as esbuild from 'esbuild';
import { createBuildOptions } from '../build/bundle.mts';
import { DiskUri, diskFileSystem } from './disk-uri.mts';

const nodeRequire = createRequire(import.meta.url);
const projectRoot = path.join(import.meta.dirname, '..');

export interface DesktopHarnessOptions {
    /** The value of `markdown-preview-gh.export.browserPath`. */
    browserPath: string;
    /** What `markdown.api.render` returns. */
    markdown: string;
    /** The button the user picks in an error notification. */
    choice?: string;
    /** Cancels the progress notification shortly after it starts. */
    cancelOnProgress?: boolean;
    /** The theme kind of the editor: 1 light, 2 dark. */
    themeKind?: number;
    /** `vscode.env.remoteName`; omit for a local window. */
    remoteName?: string;
    /** Commands of other extensions that are registered in the window, besides this extension's own. */
    otherCommands?: readonly string[];
}

export interface DesktopHarness {
    errors: string[];
    errorActions: string[][];
    infos: string[];
    executed: Array<{ id: string; args: unknown[] }>;
    storage: string;
    command(id: string): (args: unknown) => Promise<void>;
}

let bundleText: Promise<string> | undefined;

function getBundle(): Promise<string> {
    bundleText ??= (async () => {
        for (const config of createBuildOptions({ production: false, outDir: path.join(os.tmpdir(), 'mpgh-desktop-harness') })) {
            const result = await esbuild.build({ ...config, write: false, sourcemap: false, logLevel: 'silent' });
            const file = result.outputFiles.find((item) => path.basename(item.path) === 'extension.js');
            if (file) {
                return file.text;
            }
        }
        throw new Error('the desktop bundle was not produced');
    })();
    return bundleText;
}

type Task = (progress: unknown, token: unknown) => Promise<unknown>;
type Handler = (args: unknown) => Promise<void>;
const none = { dispose: () => undefined };

/** The `vscode.window` stand-in; every notification is recorded on the harness. */
function createWindow(harness: DesktopHarness, options: DesktopHarnessOptions): Record<string, unknown> {
    const listeners: Array<() => void> = [];
    return {
        activeTextEditor: undefined,
        activeColorTheme: { kind: options.themeKind ?? 2 },
        onDidChangeActiveTextEditor: () => none,
        onDidChangeTextEditorSelection: () => none,
        showErrorMessage: (message: string, ...actions: string[]) => {
            harness.errors.push(message);
            harness.errorActions.push(actions);
            return Promise.resolve(options.choice);
        },
        showInformationMessage: (message: string) => {
            harness.infos.push(message);
            return Promise.resolve(undefined);
        },
        showWarningMessage: () => Promise.resolve(undefined),
        createOutputChannel: () => ({ appendLine: () => undefined }),
        withProgress: (_progress: unknown, task: Task) => {
            const token = {
                onCancellationRequested: (listener: () => void) => {
                    listeners.push(listener);
                    return none;
                },
            };
            const running = task({}, token);
            if (options.cancelOnProgress) {
                setTimeout(() => listeners.forEach((listener) => listener()), 50);
            }
            return running;
        },
    };
}

/** Activates the real desktop bundle against a stand-in for a local desktop window. */
export async function activateDesktop(options: DesktopHarnessOptions): Promise<DesktopHarness> {
    const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-harness-'));
    const commands = new Map<string, Handler>();
    const harness: DesktopHarness = { errors: [], errorActions: [], infos: [], executed: [], storage, command: (id) => commands.get(id) as Handler };
    const document = { languageId: 'markdown', uri: DiskUri.file(path.join(storage, 'doc.md')) };
    const stub = {
        Uri: DiskUri,
        ColorThemeKind: { Light: 1, Dark: 2 },
        ProgressLocation: { Notification: 15 },
        extensions: { getExtension: () => undefined, onDidChange: () => none },
        commands: {
            getCommands: async () => [...commands.keys(), ...(options.otherCommands ?? [])],
            registerCommand: (id: string, handler: Handler) => {
                commands.set(id, handler);
                return none;
            },
            executeCommand: async (id: string, ...args: unknown[]) => {
                if (id === 'markdown.api.render') {
                    return options.markdown;
                }
                harness.executed.push({ id, args });
                return undefined;
            },
        },
        window: createWindow(harness, options),
        workspace: {
            onDidChangeConfiguration: () => none,
            onDidOpenTextDocument: () => none,
            getConfiguration: () => ({ get: (key: string, fallback: unknown) => (key === 'export.browserPath' ? options.browserPath : fallback) }),
            openTextDocument: async () => document,
            getWorkspaceFolder: () => undefined,
            fs: diskFileSystem,
        },
        env: { remoteName: options.remoteName, openExternal: async () => true },
    };
    const module = { exports: {} as Record<string, unknown> };
    const sandbox = {
        module,
        exports: module.exports,
        require: (name: string) => (name === 'vscode' ? stub : nodeRequire(name)),
        URL,
        console,
        setTimeout,
        clearTimeout,
        TextEncoder,
        TextDecoder,
        Buffer,
        btoa,
        atob,
        AbortController,
        process,
        setImmediate,
        clearImmediate,
    };
    vm.runInNewContext(await getBundle(), sandbox);
    (module.exports.activate as (context: unknown) => unknown)({
        workspaceState: { get: () => ({}), update: () => undefined },
        subscriptions: [],
        extensionUri: DiskUri.file(projectRoot),
        globalStorageUri: DiskUri.file(path.join(storage, 'global')),
    });
    return harness;
}
