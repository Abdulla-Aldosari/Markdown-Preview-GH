/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as esbuild from 'esbuild';
import { createBuildOptions } from '../build/bundle.mts';

const nodeRequire = createRequire(import.meta.url);

/** A URI stand-in backed by `URL`, with the few members the extension uses. */
class FakeUri {
    readonly scheme: string;
    readonly path: string;
    private readonly raw: string;

    private constructor(raw: string) {
        this.raw = raw;
        const url = new URL(raw);
        this.scheme = url.protocol.slice(0, -1);
        this.path = decodeURIComponent(url.pathname);
    }

    static parse(raw: string): FakeUri {
        return new FakeUri(raw);
    }

    static file(fsPath: string): FakeUri {
        return new FakeUri(`file:///${fsPath.replace(/\\/g, '/').replace(/^\/+/, '')}`);
    }

    static joinPath(base: FakeUri, ...segments: string[]): FakeUri {
        const url = new URL(base.raw);
        url.pathname = path.posix.join(url.pathname, ...segments);
        return new FakeUri(url.toString());
    }

    get fsPath(): string {
        return this.path;
    }

    toString(): string {
        return this.raw;
    }
}

interface Harness {
    opened: string[];
    errors: string[];
    warnings: string[];
    infos: string[];
    infoChoice: string | undefined;
    progressTitles: string[];
    mapped: string[];
    written: string[];
    subscriptions: Array<{ dispose(): void }>;
    command(id: string): (args: unknown) => unknown;
}

interface WindowOptions {
    remoteName?: string;
    openResult?: boolean;
    mapFails?: boolean;
}

let desktopBundle: Promise<string> | undefined;

function getDesktopBundle(): Promise<string> {
    desktopBundle ??= (async () => {
        const outDir = path.join(os.tmpdir(), 'mpgh-remote-open-test');
        for (const config of createBuildOptions({ production: false, outDir })) {
            const result = await esbuild.build({ ...config, write: false, sourcemap: false, logLevel: 'silent' });
            for (const file of result.outputFiles) {
                if (path.basename(file.path) === 'extension.js') {
                    return file.text;
                }
            }
        }
        throw new Error('the desktop bundle was not produced');
    })();
    return desktopBundle;
}

const documentUri = 'file:///work/docs/readme.md';
const bodyHtml = '<div class="mpgh-body" data-theme-mode="auto"><p>Hello <a href="other.md">link</a></p><img src="x.png" data-src="missing.png"></div>';

/** Builds the `vscode` stand-in of one window kind and records what the extension does. */
function createVscodeStub(harness: Harness, commands: Map<string, (args: unknown) => unknown>, options: WindowOptions): Record<string, unknown> {
    const document = { languageId: 'markdown', uri: FakeUri.parse(documentUri) };
    const manifest = JSON.stringify({ contributes: { 'markdown.previewStyles': [] } });
    return {
        Uri: FakeUri,
        ColorThemeKind: { Light: 1, Dark: 2 },
        ProgressLocation: { Notification: 15 },
        extensions: { getExtension: () => undefined },
        commands: {
            registerCommand: (id: string, handler: (args: unknown) => unknown) => {
                commands.set(id, handler);
                return { dispose: () => undefined };
            },
            executeCommand: async (id: string) => (id === 'markdown.api.render' ? bodyHtml : undefined),
        },
        window: {
            activeTextEditor: undefined,
            activeColorTheme: { kind: 1 },
            onDidChangeActiveTextEditor: () => ({ dispose: () => undefined }),
            onDidChangeTextEditorSelection: () => ({ dispose: () => undefined }),
            showErrorMessage: (message: string) => {
                harness.errors.push(message);
                return Promise.resolve(undefined);
            },
            withProgress: (progress: { title: string }, task: () => Promise<unknown>) => {
                harness.progressTitles.push(progress.title);
                return task();
            },
            showInformationMessage: (message: string, ...items: string[]) => {
                harness.infos.push(message);
                return Promise.resolve(items.includes(harness.infoChoice ?? '') ? harness.infoChoice : undefined);
            },
            showWarningMessage: (message: string) => {
                harness.warnings.push(message);
                return Promise.resolve(undefined);
            },
            createOutputChannel: () => ({ appendLine: () => undefined }),
        },
        workspace: {
            onDidChangeConfiguration: () => ({ dispose: () => undefined }),
            onDidOpenTextDocument: () => ({ dispose: () => undefined }),
            getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
            openTextDocument: async () => document,
            getWorkspaceFolder: () => undefined,
            fs: {
                readFile: async () => new TextEncoder().encode(manifest),
                writeFile: async (uri: FakeUri) => {
                    harness.written.push(uri.toString());
                },
                createDirectory: async () => undefined,
                stat: async () => {
                    throw new Error('not found');
                },
            },
        },
        env: {
            remoteName: options.remoteName,
            asExternalUri: async (uri: FakeUri) => {
                if (options.mapFails) {
                    throw new Error('port forwarding failed');
                }
                harness.mapped.push(uri.toString());
                return uri;
            },
            openExternal: async (uri: FakeUri) => {
                harness.opened.push(uri.toString());
                return options.openResult ?? true;
            },
        },
    };
}

/** Activates the real desktop bundle against a stand-in for a window of the given kind. */
async function activateWindow(options: WindowOptions): Promise<Harness> {
    const harness: Harness = {
        opened: [],
        errors: [],
        warnings: [],
        infos: [],
        infoChoice: undefined,
        progressTitles: [],
        mapped: [],
        written: [],
        subscriptions: [],
        command: () => () => undefined,
    };
    const commands = new Map<string, (args: unknown) => unknown>();
    const vscodeStub = createVscodeStub(harness, commands, options);
    const module = { exports: {} as Record<string, unknown> };
    vm.runInNewContext(await getDesktopBundle(), {
        module,
        exports: module.exports,
        require: (specifier: string) => (specifier === 'vscode' ? vscodeStub : nodeRequire(specifier)),
        URL,
        console,
        setTimeout,
        clearTimeout,
        TextEncoder,
        TextDecoder,
        Buffer,
        btoa,
    });
    const context = {
        workspaceState: { get: () => ({}), update: () => undefined },
        subscriptions: harness.subscriptions,
        extensionUri: FakeUri.parse('file:///ext'),
        globalStorageUri: FakeUri.parse('file:///storage'),
    };
    (module.exports.activate as (context: unknown) => unknown)(context);
    harness.command = (id) => commands.get(id) as (args: unknown) => unknown;
    return harness;
}

function stopServers(harness: Harness): void {
    for (const subscription of harness.subscriptions) {
        subscription.dispose();
    }
}

test('in a remote window the page is served, mapped, and opened through the forwarded address', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote' });
    try {
        await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
        assert.deepEqual(harness.errors, []);
        assert.equal(harness.mapped.length, 1);
        assert.deepEqual(harness.opened, harness.mapped);
        assert.match(harness.opened[0], /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/index\.html$/);
        assert.deepEqual(harness.written, [], 'nothing is written to the remote disk');

        const reply = await fetch(harness.opened[0]);
        assert.equal(reply.status, 200);
        const html = await reply.text();
        assert.match(html, /Hello/);
        assert.match(html, /<a href="other\.md">/, 'links stay as written');
        assert.doesNotMatch(html, /file:\/\//, 'no local file URL leaks into a served page');
        assert.doesNotMatch(html, /window\.print/);
        assert.deepEqual(harness.warnings, [], 'images that stay links are not reported for a temporary page');
        assert.equal((await fetch(new URL('/other', harness.opened[0]))).status, 404);
    } finally {
        stopServers(harness);
    }
});

test('Print in a remote window asks the served page to print', async () => {
    const harness = await activateWindow({ remoteName: 'wsl' });
    try {
        await harness.command('markdown-preview-gh.print')({ resource: documentUri });
        const html = await (await fetch(harness.opened[0])).text();
        assert.match(html, /window\.print\(\)/);
    } finally {
        stopServers(harness);
    }
});

test('deactivation stops the server', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote' });
    await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
    const url = harness.opened[0];
    stopServers(harness);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await assert.rejects(fetch(url));
});

test('a failing address mapping reports an error and stops the server', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote', mapFails: true });
    await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
    assert.equal(harness.errors.length, 1);
    assert.match(harness.errors[0], /port forwarding failed/);
    assert.deepEqual(harness.opened, []);
    stopServers(harness);
});

test('a browser that refuses to open reports an error', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote', openResult: false });
    await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
    assert.equal(harness.errors.length, 1);
    assert.match(harness.errors[0], /Could not open the page/);
    stopServers(harness);
});

test('a local window never starts the server or maps an address', async () => {
    const harness = await activateWindow({});
    try {
        await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
        assert.deepEqual(harness.mapped, []);
        assert.equal(harness.written.length, 1);
        assert.equal(harness.opened.length, 1);
        assert.match(harness.opened[0], /^file:\/\//);
    } finally {
        stopServers(harness);
    }
});

test('a progress notification covers the preparation and a ready notification names the address', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote' });
    try {
        await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(harness.progressTitles.length, 1);
        assert.match(harness.progressTitles[0], /preparing the page/i);
        assert.deepEqual(harness.infos, [`Page ready: ${harness.opened[0]}`]);
    } finally {
        stopServers(harness);
    }
});

test('the Open in Browser button of the ready notification opens the page again', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote' });
    try {
        harness.infoChoice = 'Open in Browser';
        await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(harness.opened.length, 2);
        assert.equal((await fetch(harness.opened[1])).status, 200);
        assert.deepEqual(harness.errors, []);
    } finally {
        stopServers(harness);
    }
});

test('the ready notification also appears in a local window and reopens the file', async () => {
    const harness = await activateWindow({});
    try {
        harness.infoChoice = 'Open in Browser';
        await harness.command('markdown-preview-gh.openInBrowser')({ resource: documentUri });
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(harness.infos.length, 1);
        assert.match(harness.infos[0], /^Page ready: file:\/\//);
        assert.equal(harness.opened.length, 2);
        assert.equal(harness.opened[1], harness.opened[0]);
    } finally {
        stopServers(harness);
    }
});

test('a repeated click while the page is being prepared opens nothing more', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote' });
    try {
        const command = harness.command('markdown-preview-gh.openInBrowser');
        await Promise.all([command({ resource: documentUri }), command({ resource: documentUri }), command({ resource: documentUri })]);
        assert.equal(harness.opened.length, 1, 'only one browser window opens');
        assert.equal(harness.progressTitles.length, 1);
        assert.equal(harness.infos.filter((message) => message === 'This page is already being prepared.').length, 2);

        await command({ resource: documentUri });
        assert.equal(harness.opened.length, 2, 'the document can be exported again once the first run finished');
    } finally {
        stopServers(harness);
    }
});

test('a failed preparation releases the guard and offers no ready notification', async () => {
    const harness = await activateWindow({ remoteName: 'ssh-remote', mapFails: true });
    const command = harness.command('markdown-preview-gh.openInBrowser');
    await command({ resource: documentUri });
    await command({ resource: documentUri });
    assert.equal(harness.errors.length, 2, 'the second attempt was not blocked');
    assert.deepEqual(harness.infos, []);
    stopServers(harness);
});
