/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildMarkdownItSurface, extractHtmlSurface, isStale, parseManualSurface, writeManualSurfaceDate } from '../build/theme-audit/markdown-surface.mts';
import { diffStyles, diffVariables, selectorAffects, stripBodyScope, variableAffects } from '../build/theme-audit/audit.mts';

test('extractHtmlSurface collects tags, classes and attributes', () => {
    const surface = extractHtmlSurface('<div class="a b"><span data-x="1" id="y">t</span><h1>Hi</h1></div>');
    assert.deepEqual([...surface.tags].sort(), ['div', 'h1', 'span']);
    assert.deepEqual([...surface.classes].sort(), ['a', 'b']);
    assert.ok(surface.attributes.has('data-x'));
    assert.ok(surface.attributes.has('id'));
});

test('buildMarkdownItSurface renders markdown and finds GFM classes', () => {
    const surface = buildMarkdownItSurface('# Title\n\n- [x] done\n\n> [!NOTE]\n> hi\n\n```js\nx\n```\n');
    for (const tag of ['h1', 'ul', 'li', 'input', 'div', 'p', 'code']) {
        assert.ok(surface.tags.has(tag), `missing tag ${tag}`);
    }
    for (const cls of [
        'contains-task-list',
        'task-list-item',
        'task-list-item-checkbox',
        'markdown-alert',
        'markdown-alert-note',
        'markdown-alert-title',
        'octicon',
        'mpgh-body',
        'mpgh-content',
        'language-js',
    ]) {
        assert.ok(surface.classes.has(cls), `missing class ${cls}`);
    }
    assert.ok(surface.attributes.has('disabled'));
    assert.ok(surface.attributes.has('class'));
});

test('surface.md covers GitHub markdown and raw HTML elements', () => {
    const markdown = fs.readFileSync(new URL('../build/theme-audit/surface.md', import.meta.url), 'utf8');
    const surface = buildMarkdownItSurface(markdown);
    for (const tag of [
        'abbr',
        'b',
        'br',
        'cite',
        'dd',
        'dfn',
        'dl',
        'dt',
        'em',
        'figcaption',
        'figure',
        'g-emoji',
        'i',
        'img',
        'input',
        'li',
        'ol',
        'q',
        'samp',
        'small',
        'strong',
        'table',
        'tbody',
        'td',
        'th',
        'thead',
        'tr',
        'tt',
        'u',
        'ul',
        'var',
        'wbr',
    ]) {
        assert.ok(surface.tags.has(tag), `missing tag ${tag}`);
    }
    for (const cls of ['align-center', 'align-right', 'blob-num', 'csv-data', 'emoji', 'float-left', 'float-right', 'frame', 'g-emoji', 'language-c++', 'language-c#']) {
        assert.ok(surface.classes.has(cls), `missing class ${cls}`);
    }
    for (const attr of ['align', 'alias', 'name', 'title', 'type', 'value']) {
        assert.ok(surface.attributes.has(attr), `missing attribute ${attr}`);
    }
});

test('diffStyles reports new, deleted and modified rules', () => {
    const rows = diffStyles('.a { color: red; }', '.a { color: blue; margin: 0; }\n.b { color: red; }');
    const byName = new Map(rows.map((row) => [row.name, row]));
    assert.equal(byName.get('.a')?.status, 'modified');
    assert.deepEqual(
        byName
            .get('.a')
            ?.changes.map((c) => `${c.name}:${c.kind}`)
            .sort(),
        ['color:modified', 'margin:added']
    );
    assert.equal(byName.get('.b')?.status, 'new');
});

test('diffStyles ignores property reordering', () => {
    const rows = diffStyles('.a { color: red; margin: 0; }', '.a { margin: 0; color: red; }');
    assert.equal(rows.length, 0);
});

test('diffStyles reports a removed rule', () => {
    const rows = diffStyles('.a { color: red; }', '');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'deleted');
    assert.deepEqual(rows[0].changes, [{ name: 'color', kind: 'removed' }]);
});

test('diffVariables reports added, removed and modified variables', () => {
    const rows = diffVariables({ '--a': '1', '--b': '2' }, { '--a': '1', '--c': '3' }, 'light.json');
    const byName = new Map(rows.map((row) => [row.name, row]));
    assert.equal(byName.get('--c')?.status, 'new');
    assert.equal(byName.get('--b')?.status, 'deleted');
    assert.equal(byName.size, 2);
    const modified = diffVariables({ '--a': '1' }, { '--a': '2' }, 'light.json');
    assert.equal(modified[0].status, 'modified');
    assert.deepEqual(modified[0].changes, [{ name: 'value', kind: 'modified' }]);
});

test('stripBodyScope removes the raw and preview body scopes', () => {
    assert.equal(stripBodyScope('.markdown-body h1'), 'h1');
    assert.equal(stripBodyScope('.mpgh-body p'), 'p');
});

test('selectorAffects flags known selectors and rejects unknown classes and attributes', () => {
    const surface = buildMarkdownItSurface('# T\n\nplain **bold** text\n\n> [!NOTE]\n> hi\n');
    assert.equal(selectorAffects('.markdown-body h1', surface), true);
    assert.equal(selectorAffects('.markdown-body strong', surface), true);
    assert.equal(selectorAffects('.markdown-body .markdown-alert-note', surface), true);
    assert.equal(selectorAffects('.markdown-body .blob-code', surface), false);
    assert.equal(selectorAffects('.markdown-body .Box .section-focus', surface), false);
    assert.equal(selectorAffects('.markdown-body [data-color-mode=light][data-light-theme*=light]', surface), false);
    assert.equal(selectorAffects('.markdown-body [data-color-mode=dark][data-dark-theme*=dark]', surface), false);
});

test('variableAffects detects references in base styles and source', () => {
    assert.equal(variableAffects('--fgColor-default', '.x { color: var(--fgColor-default); }', []), true);
    assert.equal(variableAffects('--unused', '.x { color: red; }', []), false);
    assert.equal(variableAffects('--fgColor-muted', '', ['body { color: var(--fgColor-muted); }']), true);
});

test('parseManualSurface extracts the date and detects content', () => {
    const state = parseManualSurface('<!-- manual-surface-date: "2026-10-17T12:00:00" --><div>hi</div>');
    assert.equal(state.hasContent, true);
    assert.ok(state.date instanceof Date);
    assert.equal(state.content, '<div>hi</div>');
    const empty = parseManualSurface('<!-- manual-surface-date: "" -->');
    assert.equal(empty.hasContent, false);
    assert.equal(empty.date, null);
});

test('isStale compares the age against the TTL', () => {
    const now = Date.parse('2026-10-17T12:05:00');
    assert.equal(isStale(new Date('2026-10-17T12:04:00'), now, 5 * 60 * 1000), false);
    assert.equal(isStale(new Date('2026-10-17T11:00:00'), now, 5 * 60 * 1000), true);
    assert.equal(isStale(null, now, 5 * 60 * 1000), false);
});

test('writeManualSurfaceDate updates the date line and keeps the content', () => {
    const out = writeManualSurfaceDate('<!-- manual-surface-date: "" -->\n<div>x</div>', '2026-10-17T12:00:00');
    assert.match(out, /manual-surface-date: "2026-10-17T12:00:00"/);
    assert.match(out, /<div>x<\/div>/);
});
