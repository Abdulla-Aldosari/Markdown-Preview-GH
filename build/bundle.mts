/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Bundles the TypeScript sources into the runtime files under `dist/` and
 * copies the hand-written preview stylesheets next to them.
 *
 * - `dist/extension.js`: the extension entry point (`main` and `browser` in
 *   `package.json`). A single CommonJS file with `vscode` left external,
 *   because the web extension host cannot load any other module.
 * - `dist/mermaid-preview.js`: the preview script, a small classic script
 *   (IIFE) injected into the preview webview. It renders the Mermaid
 *   placeholders the Markdown-it plugin reclassified to `mpgh-mermaid` and
 *   loads the vendor bundle lazily, so the preview content never waits for
 *   the heavy library.
 * - `dist/mermaid-preview-vendor.js`: the whole Mermaid library as a classic
 *   script (IIFE) exposing `window.MermaidVendor`. Loaded on demand by the
 *   preview script, only when diagrams exist.
 * - `dist/mermaid-render.js`: the export renderer (with the whole Mermaid
 *   library bundled in), a classic script (IIFE) loaded by the hidden
 *   renderer webview the export command opens. It never ships with the
 *   exported page.
 *
 * Usage:
 *   node ./build/bundle.mts [--production] [--watch]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Hand-written stylesheets copied verbatim into `dist/`. */
export const STATIC_STYLESHEETS: readonly string[] = ['overrides.css', 'syntax-highlighting.css'];

export interface BundleOptions {
    /** Minify and omit source maps. */
    production: boolean;
    /** Directory the bundles are written to. */
    outDir: string;
}

/**
 * Returns the esbuild configuration of every runtime bundle.
 */
export function createBuildOptions({ production, outDir }: BundleOptions): esbuild.BuildOptions[] {
    const shared: esbuild.BuildOptions = {
        bundle: true,
        target: 'es2022',
        minify: production,
        sourcemap: !production,
        logLevel: 'info',
    };
    return [
        {
            ...shared,
            entryPoints: [path.join(rootDir, 'src', 'extension.mts')],
            outfile: path.join(outDir, 'extension.js'),
            format: 'cjs',
            platform: 'neutral',
            external: ['vscode'],
        },
        {
            ...shared,
            entryPoints: [path.join(rootDir, 'src', 'preview', 'mermaid-preview.mts')],
            outfile: path.join(outDir, 'mermaid-preview.js'),
            format: 'iife',
            platform: 'browser',
        },
        {
            ...shared,
            entryPoints: [path.join(rootDir, 'src', 'preview', 'mermaid-zenuml.mts')],
            outfile: path.join(outDir, 'zenuml.js'),
            format: 'esm',
            platform: 'browser',
        },
        {
            ...shared,
            entryPoints: [path.join(rootDir, 'src', 'preview', 'mermaid-render.mts')],
            outfile: path.join(outDir, 'mermaid-render.js'),
            format: 'iife',
            platform: 'browser',
        },
    ];
}

/**
 * Copies the hand-written stylesheets into the output directory.
 */
const mermaidSourceDir = path.join(rootDir, 'node_modules', 'mermaid', 'dist');

/**
 * Copies the official Mermaid ESM distribution into `dist/mermaid`. The
 * preview script imports `mermaid/mermaid.esm.mjs` at runtime; that entry
 * loads the diagram implementations as small on-demand chunks, exactly
 * like the built-in renderer does. Bundling the whole library into a
 * single file instead makes the webview run out of V8 memory.
 */
export function copyMermaidLibrary(outDir: string): void {
    const targetDir = path.join(outDir, 'mermaid');
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(path.join(mermaidSourceDir, 'mermaid.esm.mjs'), path.join(targetDir, 'mermaid.esm.mjs'));
    const chunksDir = path.join(mermaidSourceDir, 'chunks');
    const copyChunks = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const source = path.join(dir, entry.name);
            const relative = path.relative(chunksDir, source);
            const target = path.join(targetDir, 'chunks', relative);
            if (entry.isDirectory()) {
                copyChunks(source);
            } else if (entry.name.endsWith('.mjs')) {
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.copyFileSync(source, target);
            }
        }
    };
    copyChunks(chunksDir);
}

export function copyStaticStylesheets(outDir: string): void {
    fs.mkdirSync(outDir, { recursive: true });
    for (const name of STATIC_STYLESHEETS) {
        fs.copyFileSync(path.join(rootDir, 'src', 'styles', name), path.join(outDir, name));
    }
}

async function main(argv: string[]): Promise<void> {
    const production = argv.includes('--production');
    const watch = argv.includes('--watch');
    const outDir = path.join(rootDir, 'dist');
    copyStaticStylesheets(outDir);
    copyMermaidLibrary(outDir);
    const configs = createBuildOptions({ production, outDir });
    if (watch) {
        for (const config of configs) {
            const context = await esbuild.context(config);
            await context.watch();
        }
        console.log('[bundle] watching for changes...');
        return;
    }
    await Promise.all(configs.map((config) => esbuild.build(config)));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
