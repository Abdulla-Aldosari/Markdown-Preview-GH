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
 * - `dist/extension.js`: the desktop entry point (`main` in `package.json`).
 *   A single CommonJS file built for Node with `vscode` left external.
 * - `dist/extension-web.js`: the web entry point (`browser` in
 *   `package.json`). A single CommonJS file built for the browser with
 *   `vscode` left external, because the web extension host cannot load any
 *   other module. Node built-ins can never reach it.
 * - `dist/mermaid-preview.js`: the preview script, a small classic script
 *   (IIFE) injected into the preview webview. It renders the Mermaid
 *   placeholders the Markdown-it plugin reclassified to `mpgh-mermaid` and
 *   loads the vendor bundle lazily, so the preview content never waits for
 *   the heavy library.
 * - `dist/image-viewer.js`: the zoomable viewer script, a small classic script
 *   (IIFE) injected into the preview webview. A click on an image or a
 *   rendered diagram opens it in a modal layer with zoom and pan.
 * - `dist/mermaid-preview-vendor.js`: the whole Mermaid library as a classic
 *   script (IIFE) exposing `window.MermaidVendor`. Loaded on demand by the
 *   preview script, only when diagrams exist.
 * - `dist/mermaid-export.js`: a small classic script (IIFE) the export
 *   command bakes inline into exported pages that contain diagrams. It
 *   reads the libraries from the `window.__esbuild_esm_mermaid_nm`
 *   namespace the minified UMD builds below expose, renders the
 *   placeholders, and prints on demand.
 * - `dist/mermaid.min.js`: the official minified UMD build of the whole
 *   Mermaid library, baked inline into the exported page.
 * - `dist/zenuml.min.js`: the official minified UMD build of the zenuml
 *   plugin (carrying its own copy of Mermaid), baked inline only for
 *   documents that contain zenuml diagrams.
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
export const STATIC_STYLESHEETS: readonly string[] = ['overrides.css', 'syntax-highlighting.css', 'image-viewer.css'];

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
            entryPoints: [path.join(rootDir, 'src', 'extension-desktop.mts')],
            outfile: path.join(outDir, 'extension.js'),
            format: 'cjs',
            platform: 'node',
            external: ['vscode'],
        },
        {
            ...shared,
            entryPoints: [path.join(rootDir, 'src', 'extension-web.mts')],
            outfile: path.join(outDir, 'extension-web.js'),
            format: 'cjs',
            platform: 'browser',
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
            entryPoints: [path.join(rootDir, 'src', 'preview', 'image-viewer.mts')],
            outfile: path.join(outDir, 'image-viewer.js'),
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
            entryPoints: [path.join(rootDir, 'src', 'preview', 'mermaid-export.mts')],
            outfile: path.join(outDir, 'mermaid-export.js'),
            format: 'iife',
            platform: 'browser',
        },
    ];
}

/**
 * Copies the hand-written stylesheets into the output directory.
 */
const mermaidSourceDir = path.join(rootDir, 'node_modules', 'mermaid', 'dist');

/** The one chunk set `mermaid.esm.mjs` loads at runtime. */
const mermaidChunkSet = 'mermaid.esm';

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
    // The entry file imports only the `mermaid.esm` chunk set. The other sets
    // in the distribution (`mermaid.core`, `mermaid.esm.min`) serve other
    // entry files and would only add megabytes nothing loads.
    copyChunks(path.join(chunksDir, mermaidChunkSet));
}

export function copyStaticStylesheets(outDir: string): void {
    fs.mkdirSync(outDir, { recursive: true });
    for (const name of STATIC_STYLESHEETS) {
        fs.copyFileSync(path.join(rootDir, 'src', 'styles', name), path.join(outDir, name));
    }
}

/**
 * Copies the official minified UMD builds of the Mermaid library and the
 * zenuml plugin into the output directory. The export command bakes them
 * inline into exported pages, so bundling them again (which blows the page
 * up to tens of megabytes) is never needed.
 */
export function copyExportLibraries(outDir: string): void {
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(path.join(rootDir, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'), path.join(outDir, 'mermaid.min.js'));
    fs.copyFileSync(path.join(rootDir, 'node_modules', '@mermaid-js', 'mermaid-zenuml', 'dist', 'mermaid-zenuml.min.js'), path.join(outDir, 'zenuml.min.js'));
}

async function main(argv: string[]): Promise<void> {
    const production = argv.includes('--production');
    const watch = argv.includes('--watch');
    const outDir = path.join(rootDir, 'dist');
    copyStaticStylesheets(outDir);
    copyMermaidLibrary(outDir);
    copyExportLibraries(outDir);
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
