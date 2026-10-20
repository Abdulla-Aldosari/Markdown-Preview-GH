/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import * as esbuild from 'esbuild';
import { STATIC_STYLESHEETS, copyMermaidLibrary, copyStaticStylesheets, createBuildOptions } from '../build/bundle.mts';

/**
 * Builds every runtime bundle in memory and returns the output text keyed
 * by output file name.
 */
async function buildInMemory(production: boolean): Promise<Map<string, string>> {
    const outDir = path.join(os.tmpdir(), 'mpgh-bundle-test');
    const outputs = new Map<string, string>();
    for (const config of createBuildOptions({ production, outDir })) {
        const result = await esbuild.build({ ...config, write: false, sourcemap: false, logLevel: 'silent' });
        for (const file of result.outputFiles) {
            outputs.set(path.basename(file.path), file.text);
        }
    }
    return outputs;
}

/** Collects every module specifier passed to `require(...)` in a bundle. */
function requiredModules(code: string): string[] {
    return [...code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1]);
}

test('the extension bundle is a single CommonJS file that requires only vscode', async () => {
    const code = (await buildInMemory(false)).get('extension.js');
    assert.ok(code);
    assert.deepEqual([...new Set(requiredModules(code))], ['vscode']);
    assert.doesNotMatch(code, /^\s*import\s/m);
    assert.match(code, /module\.exports/);
});

test('the extension bundle exports activate when loaded with a vscode stand-in', async () => {
    const code = (await buildInMemory(true)).get('extension.js');
    assert.ok(code);
    const module = { exports: {} as Record<string, unknown> };
    const sandboxRequire = (specifier: string) => {
        assert.equal(specifier, 'vscode');
        return {};
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: sandboxRequire });
    assert.equal(typeof module.exports.activate, 'function');
});

test('the preview script bundle is a small classic script without the Mermaid library', async () => {
    const code = (await buildInMemory(false)).get('mermaid-preview.js');
    assert.ok(code);
    assert.match(code, /^"use strict";\n\(\(\) => \{\n/);
    assert.match(code, /\n\}\)\(\);\n/);
    assert.doesNotMatch(code, /^\s*(import|export)\s/m);
    assert.match(code, /vscode\.markdown\.updateContent/);
    // The heavy library must not be bundled here: it is loaded lazily from
    // the vendor bundle so the preview content never waits for it.
    assert.ok(code.length < 50_000, 'the preview script must stay small');
});

test('copyMermaidLibrary publishes the official ESM entry with its chunks', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-mermaid-copy-'));
    try {
        copyMermaidLibrary(outDir);
        const entry = fs.readFileSync(path.join(outDir, 'mermaid', 'mermaid.esm.mjs'), 'utf8');
        assert.ok(entry.includes('mermaid_default as default'), 'the ESM entry must be copied');
        const chunks = fs.readdirSync(path.join(outDir, 'mermaid', 'chunks'), { recursive: true }).filter((name) => typeof name === 'string' && name.endsWith('.mjs'));
        assert.ok(chunks.length > 10, 'the diagram chunks must be copied');
        assert.ok(chunks.length > 10, 'the diagram chunks must be copied');
    } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
});

test('the Mermaid renderer bundle is a classic script carrying the renderer logic', async () => {
    const code = (await buildInMemory(false)).get('mermaid-render.js');
    assert.ok(code);
    assert.match(code, /^"use strict";\n\(\(\) => \{\n/);
    // The IIFE closes before the combined legal comment block esbuild appends
    // for the bundled third-party libraries.
    assert.match(code, /\}\)\(\);\n/);
    assert.doesNotMatch(code, /^\s*(import|export)\s/m);
    assert.match(code, /mpgh-mermaid-render/, 'the host message type must survive bundling');
    assert.match(code, /pre\.mermaid, div\.mermaid, pre\.mpgh-mermaid, div\.mpgh-mermaid/, 'the placeholder selector must survive bundling');
});

test('the Mermaid renderer bundle executes in a browser-like sandbox without require', async () => {
    const code = (await buildInMemory(false)).get('mermaid-render.js');
    assert.ok(code);
    const document = {
        currentScript: null,
        readyState: 'complete',
        documentElement: { style: { setProperty: () => {} } },
        body: { classList: { contains: () => false } },
        addEventListener: () => {},
        querySelectorAll: () => [],
        querySelector: () => null,
        createElement: () => ({ style: {}, remove: () => {} }),
    };
    const window: { addEventListener: () => void; matchMedia: () => { matches: boolean }; window?: unknown } = {
        addEventListener: () => {},
        matchMedia: () => ({ matches: false }),
    };
    window.window = window;
    const sandbox = { document, window, console };
    // The bundle may contain dead Node-detection code (UMD shims), but no
    // executed path may touch `require`: the sandbox provides none, so a
    // stray call would throw and fail this test.
    vm.runInNewContext(code, sandbox);
});

test('copyStaticStylesheets copies every hand-written stylesheet byte for byte', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-styles-'));
    try {
        copyStaticStylesheets(outDir);
        for (const name of STATIC_STYLESHEETS) {
            const source = fs.readFileSync(new URL(`../src/styles/${name}`, import.meta.url));
            assert.ok(fs.readFileSync(path.join(outDir, name)).equals(source), name);
        }
    } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
});

test('the ZenUML bundle is a self-contained ES module registering the diagram', async () => {
    const code = (await buildInMemory(false)).get('zenuml.js');
    assert.ok(code);
    assert.match(code, /registerExternalDiagrams/, 'the zenuml diagram must be registered');
    assert.match(code, /export\s*\{/, 'the bundle must be an ES module');
    // The bundle carries its own copy of the whole Mermaid library.
    assert.ok(code.length > 1_000_000, 'the zenuml bundle must carry the library');
});
