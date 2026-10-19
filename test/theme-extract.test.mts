/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import assert from 'node:assert/strict';
import test from 'node:test';
import { THEME_NAMES, classifyCssUrl, extractMarkdownRules, extractVariables, findVarReferences, validatePalettes } from '../build/theme-extract.mts';

test('classifyCssUrl recognizes GitHub theme and primer files', () => {
    assert.deepEqual(classifyCssUrl('https://github.githubassets.com/assets/light-abc123.css'), { name: 'light', kind: 'theme' });
    assert.deepEqual(classifyCssUrl('https://github.githubassets.com/assets/dark_dimmed-xyz.css'), { name: 'dark_dimmed', kind: 'theme' });
    assert.deepEqual(classifyCssUrl('https://github.githubassets.com/assets/primer-base-abc.css'), { name: 'primer-base', kind: 'primer' });
    assert.deepEqual(classifyCssUrl('https://github.githubassets.com/assets/app-abc.css'), { name: 'app', kind: 'other' });
});

test('classifyCssUrl ignores URLs without a cache-busting suffix', () => {
    assert.equal(classifyCssUrl('https://example.com/style.css'), null);
    assert.equal(classifyCssUrl('https://example.com/light.css'), null);
});

test('extractVariables keeps custom properties in order with the last value winning', () => {
    const css = `
:root {
  --a: 1;
  color: red;
  --b: 2;
}
:root {
  --a: 3;
}
`;
    assert.deepEqual(
        [...extractVariables(css)],
        [
            ['--a', '3'],
            ['--b', '2'],
        ]
    );
});

test('findVarReferences marks references with a fallback', () => {
    const css = '.x { color: var(--fgColor-default, #000); background: var(--bgColor-default); }';
    assert.deepEqual(findVarReferences(css), [
        { name: '--fgColor-default', hasFallback: true },
        { name: '--bgColor-default', hasFallback: false },
    ]);
});

test('extractMarkdownRules keeps markdown rules and drops page chrome', () => {
    const css = `
.markdown-body h1 { color: var(--fgColor-default, #000); }
.btn { background: red; }
.octicon { fill: currentColor; }
[data-target] a { color: blue; }
table tr:nth-child(2n) { background: #fff; }
html h1 { margin: 0; }
.highlight { color: var(--prettylights-syntax-comment); }
`;
    const result = extractMarkdownRules([css]);
    assert.match(result, /\.markdown-body h1/);
    assert.doesNotMatch(result, /\.btn/);
    assert.match(result, /\.markdown-body \.octicon/);
    assert.doesNotMatch(result, /\[data-target\]/);
    assert.match(result, /\.markdown-body table tr:nth-child\(2n\)/);
    assert.match(result, /\.markdown-body h1/);
    assert.doesNotMatch(result, /html /);
    assert.match(result, /\.highlight/);
    assert.match(result, /\.markdown-body \.octicon \{\n  display: inline-block;/);
});

test('validatePalettes accepts consistent palettes with resolvable references', () => {
    const shared = new Map([['--base-size-8', '.5rem']]);
    const palettes = new Map([
        [
            'light',
            new Map([
                ['--fgColor-default', '#000'],
                ['--bgColor-default', '#fff'],
            ]),
        ],
        [
            'dark',
            new Map([
                ['--fgColor-default', '#fff'],
                ['--bgColor-default', '#000'],
            ]),
        ],
    ]);
    assert.doesNotThrow(() => validatePalettes(shared, palettes, '.x { color: var(--fgColor-default); padding: var(--base-size-8, 8px); }'));
});

test('validatePalettes rejects theme palettes with different key sets', () => {
    const shared = new Map();
    const palettes = new Map([
        ['light', new Map([['--fgColor-default', '#000']])],
        [
            'dark',
            new Map([
                ['--fgColor-default', '#fff'],
                ['--extra', '#123'],
            ]),
        ],
    ]);
    assert.throws(() => validatePalettes(shared, palettes, ''), /does not match/);
});

test('validatePalettes rejects unresolved references without a fallback', () => {
    const shared = new Map();
    const palettes = new Map([['light', new Map([['--fgColor-default', '#000']])]]);
    assert.throws(() => validatePalettes(shared, palettes, '.x { color: var(--missingColor); }'), /missing from the palettes: --missingColor/);
});

test('THEME_NAMES lists the two supported themes', () => {
    assert.deepEqual(THEME_NAMES, ['light', 'dark']);
});
