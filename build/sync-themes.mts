/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Online theme sync.
 *
 * Run manually and rarely: fetches GitHub's live stylesheets, extracts the
 * theme palettes and the Markdown-scoped base stylesheet, validates them,
 * and writes the committed snapshot files. The offline build
 * (`generate-theme-css.mts`) never performs network access; this script is
 * the only place that does.
 *
 * Usage:
 *   node ./build/sync-themes.mts [--page <url>] [--out <dir>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { THEME_NAMES, classifyCssUrl, collectUsedVariables, extractMarkdownRules, extractVariables, validatePalettes } from './theme-extract.mts';

/** Any public GitHub repository page works; its stylesheet links are what
 * matter. */
const DEFAULT_DISCOVERY_PAGE = 'https://github.com/github/markup';

interface SyncOptions {
    discoveryPage?: string;
    outDir: string;
}

async function fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }
    return response.text();
}

/**
 * Collects the unique stylesheet URLs linked from a GitHub page.
 */
function discoverCssUrls(html: string): string[] {
    const urls = [...html.matchAll(/(?<=href=")[^"]+?\.css/g)].map((match) => match[0]);
    return [...new Set(urls)];
}

/**
 * Fetches GitHub's stylesheets and writes the committed snapshot.
 */
export async function syncThemes({ discoveryPage = DEFAULT_DISCOVERY_PAGE, outDir }: SyncOptions): Promise<void> {
    const pageHtml = await fetchText(discoveryPage);
    const themeCss = new Map<string, string[]>();
    const primerCss: string[] = [];
    const otherCss: string[] = [];
    for (const url of discoverCssUrls(pageHtml)) {
        const info = classifyCssUrl(url);
        if (!info) {
            continue;
        }
        if (info.kind === 'theme' && THEME_NAMES.includes(info.name)) {
            const list = themeCss.get(info.name) || [];
            list.push(await fetchText(url));
            themeCss.set(info.name, list);
        } else if (info.kind === 'primer') {
            primerCss.push(await fetchText(url));
        } else {
            otherCss.push(await fetchText(url));
        }
    }
    const missing = THEME_NAMES.filter((name) => !themeCss.has(name));
    if (missing.length > 0) {
        throw new Error(`The GitHub page did not serve every theme file. Missing: ${missing.join(', ')}`);
    }

    const palettes = new Map<string, Map<string, string>>();
    for (const name of THEME_NAMES) {
        const pairs = new Map<string, string>();
        const sheets = themeCss.get(name);
        if (!sheets) {
            throw new Error(`Missing stylesheets for theme "${name}"`);
        }
        for (const css of sheets) {
            for (const [key, value] of extractVariables(css)) {
                pairs.set(key, value);
            }
        }
        palettes.set(name, pairs);
    }
    const sharedPairs = new Map<string, string>();
    for (const css of primerCss) {
        for (const [key, value] of extractVariables(css)) {
            sharedPairs.set(key, value);
        }
    }

    const baseStyles = extractMarkdownRules([...primerCss, ...otherCss]);
    const used = collectUsedVariables(baseStyles);
    const shared = new Map([...sharedPairs].filter(([key]) => used.has(key)));
    const filteredPalettes = new Map([...palettes].map(([name, pairs]) => [name, new Map([...pairs].filter(([key]) => used.has(key)))]));
    validatePalettes(shared, filteredPalettes, baseStyles);

    fs.mkdirSync(path.join(outDir, 'palettes'), { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(
        path.join(outDir, 'palettes', 'shared.json'),
        `${JSON.stringify({ source: discoveryPage, fetchedAt: today, variables: Object.fromEntries(shared) }, null, 4)}\n`
    );
    for (const name of THEME_NAMES) {
        const pairs = filteredPalettes.get(name);
        if (!pairs) {
            throw new Error(`Missing filtered palette for theme "${name}"`);
        }
        const palette = {
            name,
            colorScheme: name.startsWith('dark') ? 'dark' : 'light',
            source: discoveryPage,
            fetchedAt: today,
            variables: Object.fromEntries(pairs),
        };
        fs.writeFileSync(path.join(outDir, 'palettes', `${name}.json`), `${JSON.stringify(palette, null, 4)}\n`);
    }
    fs.writeFileSync(path.join(outDir, 'base-styles.css'), baseStyles);

    const firstPalette = filteredPalettes.get(THEME_NAMES[0]);
    if (!firstPalette) {
        throw new Error('Missing filtered palette');
    }
    console.log(`Synced ${THEME_NAMES.length} themes from ${discoveryPage}`);
    console.log(`Shared variables: ${shared.size}; variables per theme: ${firstPalette.size}`);
}

function parseArgs(argv: string[]): SyncOptions {
    const options: SyncOptions = { outDir: 'build' };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--out') {
            options.outDir = argv[++i];
        } else if (argv[i] === '--page') {
            options.discoveryPage = argv[++i];
        }
    }
    return options;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const options = parseArgs(process.argv.slice(2));
    const outDir = path.resolve(process.cwd(), options.outDir);
    syncThemes({ discoveryPage: options.discoveryPage, outDir }).catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
