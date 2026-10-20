/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThemeDirective, detectDiagramType, injectThemeDirective, selectDiagramTheme, sourceDefinesTheme } from '../src/preview/mermaid-diagram-theme.mts';

test('detectDiagramType reads the first keyword of the source', () => {
    assert.equal(detectDiagramType('flowchart TD\nA --> B'), 'flowchart');
    assert.equal(detectDiagramType('sequenceDiagram\nAlice->>Bob: Hi'), 'sequenceDiagram');
    assert.equal(detectDiagramType('  mindmap\nroot'), 'mindmap');
});

test('detectDiagramType skips an optional frontmatter block', () => {
    assert.equal(detectDiagramType('---\ntitle: Example\n---\ngitGraph\n  commit'), 'gitGraph');
});

test('detectDiagramType skips leading init directives', () => {
    assert.equal(detectDiagramType('%%{init: {"flowchart": {"htmlLabels": false}}}%%\nflowchart TD\nA --> B'), 'flowchart');
});

test('detectDiagramType returns an empty string without content', () => {
    assert.equal(detectDiagramType(''), '');
    assert.equal(detectDiagramType('  \n %%{init: {"theme": "dark"}}%% \n '), '');
});

test('selectDiagramTheme uses the classic default theme in light mode for every type', () => {
    for (const keyword of ['flowchart', 'graph', 'swimlane-beta', 'sequenceDiagram', 'venn-beta', 'mindmap', 'gitGraph', 'pie']) {
        assert.equal(selectDiagramTheme(keyword, 'light'), 'default', keyword);
    }
});

test('selectDiagramTheme assigns the dark color theme to the node-based types in dark mode', () => {
    for (const keyword of [
        'flowchart',
        'graph',
        'flowchart-elk',
        'swimlane-beta',
        'classDiagram',
        'erDiagram',
        'requirement',
        'requirementDiagram',
        'sequenceDiagram',
        'stateDiagram',
        'stateDiagram-v2',
    ]) {
        assert.equal(selectDiagramTheme(keyword, 'dark'), 'redux-dark-color', keyword);
    }
});

test('selectDiagramTheme assigns the classic dark theme to every other type in dark mode', () => {
    for (const keyword of ['mindmap', 'gitGraph', 'pie', 'quadrantChart', 'gantt', 'timeline', 'xychart-beta', 'venn-beta', 'treeView-beta', '']) {
        assert.equal(selectDiagramTheme(keyword, 'dark'), 'dark', keyword);
    }
});

test('sourceDefinesTheme reads a theme from a leading frontmatter config', () => {
    assert.equal(sourceDefinesTheme('---\nconfig:\n  theme: neutral\n---\nvenn-beta'), true);
    assert.equal(sourceDefinesTheme('---\ntitle: Example\n---\ngitGraph'), false);
});

test('sourceDefinesTheme reads a theme from a leading directive', () => {
    assert.equal(sourceDefinesTheme('%%{init: {"theme": "dark"}}%%\nsequenceDiagram'), true);
    assert.equal(sourceDefinesTheme('%%{init: {"flowchart": {"htmlLabels": false}}}%%\nflowchart TD'), false);
});

test('buildThemeDirective names the theme and carries its pure variables', () => {
    const dark = buildThemeDirective('sequenceDiagram', 'dark');
    assert.match(dark, /^%%\{init: /);
    assert.match(dark, /"theme": "redux-dark-color"/);
    assert.match(dark, /"themeVariables": /);
    assert.match(dark, /"nodeBorder":"#FFFFFF"/);
    assert.match(dark, /"noteBkgColor":"#FEF9C3"/);

    const light = buildThemeDirective('flowchart', 'light');
    assert.match(light, /"theme": "default"/);
    assert.match(light, /"primaryColor":"#ECECFF"/);
    assert.match(light, /"cScale0":"hsl\(240, 100%, 76\.2745098039%\)"/);
});

test('buildThemeDirective keeps the classic themes for the remaining types', () => {
    assert.match(buildThemeDirective('venn-beta', 'dark'), /"theme": "dark"/);
    assert.match(buildThemeDirective('mindmap', 'light'), /"theme": "default"/);
});

test('injectThemeDirective prepends the themed directive for the diagram type and brightness', () => {
    const injected = injectThemeDirective('sequenceDiagram\nA->>B: Hi', 'dark');
    assert.ok(injected.startsWith('%%{init: {"theme": "redux-dark-color"'));
    assert.ok(injected.includes('"themeVariables"'));
    assert.ok(injected.endsWith('\nsequenceDiagram\nA->>B: Hi'));
    assert.ok(injectThemeDirective('mindmap\nroot', 'light').startsWith('%%{init: {"theme": "default"'));
    assert.ok(injectThemeDirective('pie\n"a": 1', 'dark').startsWith('%%{init: {"theme": "dark"'));
});

test('injectThemeDirective leaves a source with its own theme untouched', () => {
    const source = '%%{init: {"theme": "neutral"}}%%\nvenn-beta\n  set A';
    assert.equal(injectThemeDirective(source, 'dark'), source);
});
