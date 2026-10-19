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
 * - `dist/mermaid-theme-sync.js`: the preview script, a classic script (IIFE)
 *   injected into the preview webview.
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
            entryPoints: [path.join(rootDir, 'src', 'preview', 'mermaid-theme-sync.mts')],
            outfile: path.join(outDir, 'mermaid-theme-sync.js'),
            format: 'iife',
            platform: 'browser',
        },
    ];
}

/**
 * Copies the hand-written stylesheets into the output directory.
 */
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
