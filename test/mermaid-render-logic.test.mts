/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMermaidConfig, rendererMessageType, resolveExportBrightness } from '../src/preview/mermaid-render-logic.mts';

test('resolveExportBrightness maps pinned modes directly', () => {
    assert.equal(resolveExportBrightness('light', true), 'light');
    assert.equal(resolveExportBrightness('light', false), 'light');
    assert.equal(resolveExportBrightness('dark', true), 'dark');
    assert.equal(resolveExportBrightness('dark', false), 'dark');
});

test('resolveExportBrightness follows the color scheme for any other mode', () => {
    assert.equal(resolveExportBrightness('auto', false), 'light');
    assert.equal(resolveExportBrightness('auto', true), 'dark');
    assert.equal(resolveExportBrightness('', true), 'dark');
});

test('buildMermaidConfig renders light diagrams with the website light theme', () => {
    const config = buildMermaidConfig('light');
    assert.equal(config.startOnLoad, false);
    assert.equal(config.theme, 'default');
    assert.equal(config.securityLevel, 'strict');
    assert.equal('themeVariables' in config, false);
});

test('buildMermaidConfig renders dark diagrams with the website dark theme', () => {
    const config = buildMermaidConfig('dark');
    assert.equal(config.startOnLoad, false);
    assert.equal(config.theme, 'dark');
    assert.equal(config.securityLevel, 'strict');
    assert.equal('themeVariables' in config, false);
});

test('the renderer message type is stable', () => {
    assert.equal(rendererMessageType, 'mpgh-mermaid-render');
});
