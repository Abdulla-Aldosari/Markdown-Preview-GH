/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { composeBaseStylesheet, composeThemeStylesheet } from '../build/theme-compose.mts';
import { THEME_NAMES, validatePalettes } from '../build/theme-extract.mts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '..', 'build');
const palettesDir = path.join(buildDir, 'palettes');

function hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function loadSharedPairs(): [string, string][] {
    return Object.entries(JSON.parse(fs.readFileSync(path.join(palettesDir, 'shared.json'), 'utf8')).variables);
}

function loadTheme(name: string): { colorScheme: string; pairs: [string, string][] } {
    const palette = JSON.parse(fs.readFileSync(path.join(palettesDir, `${name}.json`), 'utf8'));
    return { colorScheme: palette.colorScheme, pairs: Object.entries(palette.variables) };
}

test('composeThemeStylesheet builds the expected layout for a small theme', () => {
    const css = composeThemeStylesheet({
        themeName: 'light',
        colorScheme: 'light',
        sharedPairs: [['--base-size-8', '.5rem']],
        themePairs: [['--fgColor-default', '#1f2328']],
    });
    const expected = `.markdown-body {
  --base-size-8: .5rem;
}

[data-theme-mode=light],
.vscode-body.vscode-light [data-theme-mode=auto] {
  /* light */
  color-scheme: light;
  --fgColor-default: #1f2328;
}
`;
    assert.equal(css, expected);
});

test('composeBaseStylesheet scopes the raw styles to the preview body class', () => {
    assert.equal(composeBaseStylesheet('.markdown-body h1 { color: red; }'), '.mpgh-body h1 { color: red; }');
});

test('the committed snapshot composes deterministically (hash lock)', () => {
    const sharedPairs = loadSharedPairs();
    const palettes = new Map<string, Map<string, string>>();
    for (const name of THEME_NAMES) {
        palettes.set(name, new Map(loadTheme(name).pairs));
    }
    const baseStyles = fs.readFileSync(path.join(buildDir, 'base-styles.css'), 'utf8');
    validatePalettes(new Map(sharedPairs), palettes, baseStyles);

    const hashes = [];
    for (const name of THEME_NAMES) {
        const theme = loadTheme(name);
        hashes.push(hash(composeThemeStylesheet({ themeName: name, colorScheme: theme.colorScheme, sharedPairs, themePairs: theme.pairs })));
    }
    hashes.push(hash(composeBaseStylesheet(baseStyles)));

    assert.deepEqual(hashes, [
        '4737944c170445defc306c22a8869bbdaa4097906e6e670b1e6edb82dec3d65e',
        'aab4ff3d68a891ae622598a5837cfb56d0102b4c57b0fad8da180ab4599a2639',
        '3506e99c8683627232ae9159aa4d8f3fd1b82debc9ef52360e01ab3bbf4fca47',
    ]);
});
