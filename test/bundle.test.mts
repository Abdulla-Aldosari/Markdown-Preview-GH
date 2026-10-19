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
import { STATIC_STYLESHEETS, copyStaticStylesheets, createBuildOptions } from '../build/bundle.mts';

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

test('the preview script bundle is a classic script without module syntax', async () => {
    const code = (await buildInMemory(false)).get('mermaid-theme-sync.js');
    assert.ok(code);
    assert.match(code, /^"use strict";\n\(\(\) => \{\n/);
    assert.match(code, /\n\}\)\(\);\n$/);
    assert.deepEqual(requiredModules(code), []);
    assert.doesNotMatch(code, /^\s*(import|export)\s/m);
    assert.match(code, /vscode\.markdown\.updateContent/);
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
