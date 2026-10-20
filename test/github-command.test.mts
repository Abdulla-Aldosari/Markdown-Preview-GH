/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as esbuild from 'esbuild';
import { createBuildOptions } from '../build/bundle.mts';

/** A minimal file-URI stand-in: keeps the raw string and decodes its path. */
class FakeUri {
    private readonly raw: string;

    private constructor(raw: string) {
        this.raw = raw;
    }

    static parse(raw: string): FakeUri {
        return new FakeUri(raw);
    }

    static file(raw: string): FakeUri {
        return new FakeUri(raw);
    }

    toString(): string {
        return this.raw;
    }

    get scheme(): string {
        return 'file';
    }

    get path(): string {
        const schemeEnd = this.raw.indexOf('://');
        const rest = schemeEnd === -1 ? this.raw : this.raw.slice(schemeEnd + 3);
        const slash = rest.indexOf('/');
        const rawPath = slash === -1 ? rest : rest.slice(slash);
        try {
            return decodeURIComponent(rawPath);
        } catch {
            return rawPath;
        }
    }

    get fsPath(): string {
        return this.path;
    }
}

interface FakeChange {
    uri: FakeUri;
    status: number;
}

interface FakeRepo {
    rootUri: FakeUri;
    state: {
        HEAD?: { name?: string; commit?: string };
        remotes: Array<{ name: string; fetchUrl?: string; pushUrl?: string }>;
        indexChanges: FakeChange[];
        workingTreeChanges: FakeChange[];
        untrackedChanges: FakeChange[];
        onDidChange: (listener: () => void) => { dispose: () => void };
    };
    fireStatus: () => void;
    committedPaths: Set<string>;
    getObjectDetails(treeish: string, relPath: string): Promise<{ mode: string; object: string; size: number }>;
}

interface Harness {
    setContext: Map<string, unknown>;
    commands: Map<string, (args: unknown) => unknown>;
    opened: string[];
    errors: string[];
    fireActiveEditor: (editor: unknown) => void;
    fireDocOpen: (document: unknown) => void;
    window: { activeTextEditor: unknown };
    outputLines: string[];
    outputChannelCreated: boolean;
}

const githubContextKey = 'markdownPreviewGh.isGitHubRepo';
const openFileCommand = 'markdown-preview-gh.openFileOnGitHub';
const trackedUri = 'file:///c%3A/work/repo/docs/tracked.md';
const untrackedUri = 'file:///c%3A/work/repo/notes.md';

/** Builds a repository whose status the test can update and fire at will. */
function buildRepo(initial: { workingTree?: FakeChange[]; untracked?: FakeChange[] }, committed: string[] = []): FakeRepo {
    let statusListener: (() => void) | undefined;
    const repo: FakeRepo = {
        rootUri: FakeUri.parse('file:///c%3A/work/repo'),
        state: {
            HEAD: { name: 'main', commit: 'abc123' },
            remotes: [{ name: 'origin', fetchUrl: 'https://github.com/owner/repo.git' }],
            indexChanges: [],
            workingTreeChanges: initial.workingTree ?? [],
            untrackedChanges: initial.untracked ?? [],
            onDidChange: (listener: () => void) => {
                statusListener = listener;
                return { dispose: () => {} };
            },
        },
        fireStatus: () => statusListener?.(),
        committedPaths: new Set(committed),
        getObjectDetails: (treeish, relPath) =>
            treeish === 'HEAD' && repo.committedPaths.has(relPath)
                ? Promise.resolve({ mode: '100644', object: 'abc', size: 1 })
                : Promise.reject(new Error(`path ${relPath} not in ${treeish}`)),
    };
    return repo;
}

/** Builds the extension bundle in memory, once per test run. */
let extensionBundle: Promise<string> | undefined;

function getExtensionBundle(): Promise<string> {
    if (!extensionBundle) {
        extensionBundle = (async () => {
            const outDir = path.join(os.tmpdir(), 'mpgh-github-command-test');
            for (const config of createBuildOptions({ production: false, outDir })) {
                const result = await esbuild.build({ ...config, write: false, sourcemap: false, logLevel: 'silent' });
                for (const file of result.outputFiles) {
                    if (path.basename(file.path) === 'extension.js') {
                        return file.text;
                    }
                }
            }
            throw new Error('the extension bundle was not produced');
        })();
    }
    return extensionBundle;
}

/** Loads the real extension bundle with a vscode stand-in and activates it. */
async function activateExtension(vscodeStub: Record<string, unknown>): Promise<void> {
    const code = await getExtensionBundle();
    const module = { exports: {} as Record<string, unknown> };
    vm.runInNewContext(code, {
        module,
        exports: module.exports,
        require: (specifier: string) => {
            assert.equal(specifier, 'vscode');
            return vscodeStub;
        },
        URL,
        console,
        setTimeout,
        clearTimeout,
    });
    const activate = module.exports.activate as (context: unknown) => unknown;
    const context = {
        workspaceState: { get: () => ({}), update: () => undefined },
        subscriptions: [] as unknown[],
    };
    activate(context);
}

/** Builds the vscode stand-in and returns the harness the test drives. */
function createHarness(repo: FakeRepo, options: { diagnosticLogging?: boolean } = {}): { harness: Harness; vscodeStub: Record<string, unknown> } {
    const harness: Harness = {
        setContext: new Map(),
        commands: new Map(),
        opened: [],
        errors: [],
        fireActiveEditor: () => {},
        fireDocOpen: () => {},
        window: { activeTextEditor: undefined },
        outputLines: [],
        outputChannelCreated: false,
    };
    const vscodeStub = {
        Uri: FakeUri,
        extensions: {
            getExtension: (id: string) =>
                id === 'vscode.git'
                    ? {
                          isActive: true,
                          exports: { enabled: true, getAPI: () => ({ getRepository: () => repo }) },
                      }
                    : undefined,
        },
        commands: {
            registerCommand: (id: string, handler: (args: unknown) => unknown) => {
                harness.commands.set(id, handler);
                return { dispose: () => {} };
            },
            executeCommand: async (id: string, ...args: unknown[]) => {
                if (id === 'setContext') {
                    harness.setContext.set(String(args[0]), args[1]);
                }
                return undefined;
            },
        },
        window: {
            get activeTextEditor() {
                return harness.window.activeTextEditor;
            },
            onDidChangeActiveTextEditor: (listener: (editor: unknown) => void) => {
                harness.fireActiveEditor = listener;
                return { dispose: () => {} };
            },
            onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
            showErrorMessage: (message: string) => {
                harness.errors.push(message);
                return Promise.resolve(undefined);
            },
            createOutputChannel: () => {
                harness.outputChannelCreated = true;
                return { appendLine: (line: string) => harness.outputLines.push(line) };
            },
        },
        workspace: {
            onDidChangeConfiguration: () => ({ dispose: () => {} }),
            onDidOpenTextDocument: (listener: (document: unknown) => void) => {
                harness.fireDocOpen = listener;
                return { dispose: () => {} };
            },
            getConfiguration: () => ({
                get: (key: string, fallback: unknown) => (key === 'diagnosticLogging' ? (options.diagnosticLogging ?? false) : fallback),
            }),
        },
        env: {
            openExternal: async (uri: unknown) => {
                harness.opened.push(String(uri));
                return true;
            },
        },
    };
    return { harness, vscodeStub };
}

/** Lets the asynchronous context-key updates settle. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

test('the context key hides an untracked document under the mixed setting', async () => {
    const repo = buildRepo({ workingTree: [{ uri: FakeUri.parse(untrackedUri), status: 7 }] });
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(untrackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.setContext.get(githubContextKey), false);
});

test('the context key hides an untracked document under the separate setting', async () => {
    const repo = buildRepo({ untracked: [{ uri: FakeUri.parse(untrackedUri), status: 7 }] });
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(untrackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.setContext.get(githubContextKey), false);
});

test('the context key hides an ignored document', async () => {
    const repo = buildRepo({ workingTree: [{ uri: FakeUri.parse(untrackedUri), status: 8 }] });
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(untrackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.setContext.get(githubContextKey), false);
});

test('a tracked document sets the key and the command opens the GitHub URL', async () => {
    const repo = buildRepo({}, ['docs/tracked.md']);
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(trackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.setContext.get(githubContextKey), true);

    await harness.commands.get(openFileCommand)!({ resource: trackedUri });
    await flush();
    assert.deepEqual(harness.opened, ['https://github.com/owner/repo/blob/main/docs/tracked.md']);
    assert.equal(harness.errors.length, 0);
});

test('the untracked command refuses to open and reports an error', async () => {
    const repo = buildRepo({ untracked: [{ uri: FakeUri.parse(untrackedUri), status: 7 }] });
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    await harness.commands.get(openFileCommand)!({ resource: untrackedUri });
    await flush();
    assert.equal(harness.opened.length, 0);
    assert.equal(harness.errors.length, 1);
});

test('an untracked document in a remote workspace is hidden although its URI scheme differs', async () => {
    const repo = buildRepo({ workingTree: [{ uri: FakeUri.parse('file:///home/user/work/repo/notes.md'), status: 7 }] });
    repo.rootUri = FakeUri.parse('file:///home/user/work/repo');
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = {
        document: { languageId: 'markdown', uri: FakeUri.parse('vscode-remote://wsl+ubuntu/home/user/work/repo/notes.md') },
    };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.setContext.get(githubContextKey), false);
});

test('a new uncommitted file is hidden even before git status reports it', async () => {
    const repo = buildRepo({});
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(untrackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    // Not in the change lists and not in HEAD: hidden immediately, with no
    // brief window where the item shows.
    assert.equal(harness.setContext.get(githubContextKey), false);

    // git status later reports the file as untracked: still hidden.
    repo.state.workingTreeChanges.push({ uri: FakeUri.parse(untrackedUri), status: 7 });
    repo.fireStatus();
    await flush();

    assert.equal(harness.setContext.get(githubContextKey), false);
});

test('a gitignored document is hidden although the change lists never report it', async () => {
    // The user's scenario: `.vsenv/` is ignored, git status omits ignored
    // files, so every change list stays empty and only the HEAD check can
    // tell the document is not on github.com.
    const repo = buildRepo({});
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(untrackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.setContext.get(githubContextKey), false);
});

test('switching to a non-markdown editor keeps the key for the open previews', async () => {
    const repo = buildRepo({}, ['docs/tracked.md']);
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(trackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();
    assert.equal(harness.setContext.get(githubContextKey), true);

    // The user clicks the Output panel: a non-markdown editor becomes
    // active. The previews are still on screen, so the key must stay.
    harness.window.activeTextEditor = { document: { languageId: 'log', uri: FakeUri.parse('output:extension-output') } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();
    assert.equal(harness.setContext.get(githubContextKey), true);
});

test('diagnostic logging stays off by default', async () => {
    const repo = buildRepo({}, ['docs/tracked.md']);
    const { harness, vscodeStub } = createHarness(repo);
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(trackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.outputChannelCreated, false);
    assert.equal(harness.outputLines.length, 0);
});

test('enabling diagnostic logging writes the checks to the output channel', async () => {
    const repo = buildRepo({}, ['docs/tracked.md']);
    const { harness, vscodeStub } = createHarness(repo, { diagnosticLogging: true });
    await activateExtension(vscodeStub);
    await flush();

    harness.window.activeTextEditor = { document: { languageId: 'markdown', uri: FakeUri.parse(trackedUri) } };
    harness.fireActiveEditor(harness.window.activeTextEditor);
    await flush();

    assert.equal(harness.outputChannelCreated, true);
    assert.ok(harness.outputLines.length > 0);
    assert.match(harness.outputLines.join('\n'), /check: resolved owner\/repo@main\/docs\/tracked\.md/);
});
