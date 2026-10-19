/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildMermaidConfig,
    buildMermaidThemeVariables,
    rendererFontFamily,
    rendererFontSize,
    rendererMessageType,
    resolveExportBrightness,
} from '../src/preview/mermaid-render-logic.mts';

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

test('buildMermaidThemeVariables matches the preview colors for the light theme', () => {
    assert.deepEqual(buildMermaidThemeVariables('light'), {
        darkMode: false,
        background: '#FFFFFF',
        textColor: '#202020',
        lineColor: '#236B8E',
        primaryColor: '#FAFAFD',
        primaryTextColor: '#202020',
        primaryBorderColor: '#236B8E',
        mainBkg: '#FAFAFD',
        nodeBorder: '#236B8E',
        secondaryColor: '#FFFFFF',
        secondaryTextColor: '#202020',
        secondaryBorderColor: '#D8D8D866',
        tertiaryColor: '#EAEAEA',
        tertiaryTextColor: '#202020',
        tertiaryBorderColor: '#F0F1F2',
        clusterBkg: '#EAEAEA',
        clusterBorder: '#F0F1F2',
        noteBkgColor: '#EAEAEA',
        noteTextColor: '#202020',
        noteBorderColor: '#F0F1F2',
        errorBkgColor: '#FDEDED',
        errorTextColor: '#E51400',
        titleColor: '#202020',
        edgeLabelBackground: '#FFFFFF',
        pie1: '#1A5CFF',
        pie2: '#388A34',
        pie3: '#D18616',
        pie4: '#AD0707',
        pie5: '#652D90',
        pie6: '#667309',
        cScale0: '#1A5CFF',
        cScale1: '#388A34',
        cScale2: '#D18616',
        cScale3: '#AD0707',
        cScale4: '#652D90',
        cScale5: '#667309',
        fontFamily: rendererFontFamily,
        fontSize: rendererFontSize,
    });
});

test('buildMermaidThemeVariables matches the preview colors for the dark theme', () => {
    assert.deepEqual(buildMermaidThemeVariables('dark'), {
        darkMode: true,
        background: '#121314',
        textColor: '#CCCCCC',
        lineColor: '#236B8E',
        primaryColor: '#202122',
        primaryTextColor: '#CCCCCC',
        primaryBorderColor: '#236B8E',
        mainBkg: '#202122',
        nodeBorder: '#236B8E',
        secondaryColor: '#191A1B',
        secondaryTextColor: '#BFBFBF',
        secondaryBorderColor: '#333536',
        tertiaryColor: '#242526',
        tertiaryTextColor: '#BFBFBF',
        tertiaryBorderColor: '#2A2B2C',
        clusterBkg: '#242526',
        clusterBorder: '#2A2B2C',
        noteBkgColor: '#242526',
        noteTextColor: '#BFBFBF',
        noteBorderColor: '#2A2B2C',
        errorBkgColor: '#3A1D1D',
        errorTextColor: '#F14C4C',
        titleColor: '#CCCCCC',
        edgeLabelBackground: '#121314',
        pie1: '#57A3F8',
        pie2: '#86CF86',
        pie3: '#CD861A',
        pie4: '#EF8773',
        pie5: '#AD80D7',
        pie6: '#E0B97F',
        cScale0: '#57A3F8',
        cScale1: '#86CF86',
        cScale2: '#CD861A',
        cScale3: '#EF8773',
        cScale4: '#AD80D7',
        cScale5: '#E0B97F',
        fontFamily: rendererFontFamily,
        fontSize: rendererFontSize,
    });
});

test('buildMermaidConfig disables auto start and renders with the pinned palette', () => {
    const config = buildMermaidConfig('dark');
    assert.equal(config.startOnLoad, false);
    assert.equal(config.theme, 'base');
    assert.equal(config.securityLevel, 'strict');
    assert.deepEqual(config.themeVariables, buildMermaidThemeVariables('dark'));
});

test('the renderer message type is stable', () => {
    assert.equal(rendererMessageType, 'mpgh-mermaid-render');
});
