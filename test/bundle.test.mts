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
import { STATIC_STYLESHEETS, copyExportLibraries, copyMermaidLibrary, copyStaticStylesheets, createBuildOptions } from '../build/bundle.mts';

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

test('the image viewer bundle is a small classic script that owns the click and the layer', async () => {
    const code = (await buildInMemory(false)).get('image-viewer.js');
    assert.ok(code);
    assert.match(code, /^"use strict";\n\(\(\) => \{\n/);
    assert.match(code, /\n\}\)\(\);\n/);
    assert.doesNotMatch(code, /^\s*(import|export)\s/m);
    assert.match(code, /mpgh-viewer/, 'the layer class must survive bundling');
    assert.match(code, /mpghViewer/, 'the context key of the preview menu must survive bundling');
    assert.match(code, /\.mpgh-mermaid\[data-mpgh-rendered=/, 'the rendered diagram selector must survive bundling');
    assert.ok(code.length < 60_000, 'the viewer script must stay small');
});

test('copyMermaidLibrary publishes the official ESM entry with its chunks', async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-mermaid-copy-'));
    try {
        copyMermaidLibrary(outDir);
        const entry = fs.readFileSync(path.join(outDir, 'mermaid', 'mermaid.esm.mjs'), 'utf8');
        assert.ok(entry.includes('mermaid_default as default'), 'the ESM entry must be copied');
        const chunks = fs.readdirSync(path.join(outDir, 'mermaid', 'chunks'), { recursive: true }).filter((name) => typeof name === 'string' && name.endsWith('.mjs'));
        assert.ok(chunks.length > 10, 'the diagram chunks must be copied');
        const chunkSets = fs
            .readdirSync(path.join(outDir, 'mermaid', 'chunks'), { withFileTypes: true })
            .filter((item) => item.isDirectory())
            .map((item) => item.name);
        assert.deepEqual(chunkSets, ['mermaid.esm'], 'only the chunk set the entry file loads may be copied');
        assert.ok(entry.includes('chunks/mermaid.esm/'), 'the entry file must load the copied chunk set');
    } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
});

test('the Mermaid export bootstrap is a small classic script reading the UMD namespace', async () => {
    const code = (await buildInMemory(false)).get('mermaid-export.js');
    assert.ok(code);
    assert.match(code, /^"use strict";\n\(\(\) => \{\n/);
    assert.match(code, /\}\)\(\);\n/);
    assert.doesNotMatch(code, /^\s*(import|export)\s/m);
    assert.match(code, /MPGH_EXPORT/, 'the export page options must survive bundling');
    assert.match(code, /__esbuild_esm_mermaid_nm/, 'the bootstrap must read the UMD namespace');
    assert.match(code, /pre\.mermaid, div\.mermaid, pre\.mpgh-mermaid, div\.mpgh-mermaid/, 'the placeholder selector must survive bundling');
    assert.match(code, /mpgh-export-diagram-print/, 'the print copy wrapper must survive bundling');
    assert.ok(code.length < 100_000, 'the bootstrap must not bundle the libraries');
});

test('copyExportLibraries copies the official minified UMD builds verbatim', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-export-libs-'));
    try {
        copyExportLibraries(outDir);
        const mermaidSource = fs.readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js', import.meta.url));
        assert.ok(fs.readFileSync(path.join(outDir, 'mermaid.min.js')).equals(mermaidSource), 'mermaid.min.js');
        const zenumlSource = fs.readFileSync(new URL('../node_modules/@mermaid-js/mermaid-zenuml/dist/mermaid-zenuml.min.js', import.meta.url));
        assert.ok(fs.readFileSync(path.join(outDir, 'zenuml.min.js')).equals(zenumlSource), 'zenuml.min.js');
        assert.ok(mermaidSource.length > 3_000_000, 'the minified Mermaid build must be the full library');
        assert.ok(zenumlSource.length > 3_000_000, 'the minified zenuml build must carry its own library copy');
    } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
    }
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
