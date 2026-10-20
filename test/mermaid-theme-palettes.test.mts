/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeVariablePalettes } from '../src/preview/mermaid-theme-palettes.mts';

test('the default theme palette is locked to the pinned mermaid version', () => {
    assert.deepEqual(themeVariablePalettes.default, {
        background: 'white',
        textColor: '#333',
        lineColor: '#333333',
        primaryColor: '#ECECFF',
        primaryTextColor: '#131300',
        primaryBorderColor: 'hsl(240, 60%, 86.2745098039%)',
        mainBkg: '#ECECFF',
        nodeBorder: '#9370DB',
        secondaryColor: '#ffffde',
        secondaryTextColor: '#000021',
        secondaryBorderColor: 'hsl(60, 60%, 83.5294117647%)',
        tertiaryColor: 'hsl(80, 100%, 96.2745098039%)',
        tertiaryTextColor: 'rgb(6.3333333334, 0, 19.0000000001)',
        tertiaryBorderColor: 'hsl(80, 60%, 86.2745098039%)',
        clusterBkg: '#ffffde',
        clusterBorder: '#aaaa33',
        noteBkgColor: '#fff5ad',
        noteTextColor: 'black',
        noteBorderColor: '#aaaa33',
        errorBkgColor: '#552222',
        errorTextColor: '#552222',
        titleColor: '#333',
        edgeLabelBackground: 'rgba(232,232,232, 0.8)',
        pie1: '#ECECFF',
        pie2: '#ffffde',
        pie3: 'hsl(80, 100%, 56.2745098039%)',
        pie4: 'hsl(240, 100%, 86.2745098039%)',
        pie5: 'hsl(60, 100%, 63.5294117647%)',
        pie6: 'hsl(80, 100%, 76.2745098039%)',
        cScale0: 'hsl(240, 100%, 76.2745098039%)',
        cScale1: 'hsl(60, 100%, 73.5294117647%)',
        cScale2: 'hsl(80, 100%, 76.2745098039%)',
        cScale3: 'hsl(270, 100%, 76.2745098039%)',
        cScale4: 'hsl(300, 100%, 76.2745098039%)',
        cScale5: 'hsl(330, 100%, 76.2745098039%)',
    });
});

test('the dark theme palette is locked to the pinned mermaid version', () => {
    assert.deepEqual(themeVariablePalettes.dark, {
        background: '#333',
        textColor: '#ccc',
        lineColor: 'lightgrey',
        primaryColor: '#1f2020',
        primaryTextColor: '#e0dfdf',
        primaryBorderColor: '#cccccc',
        mainBkg: '#1f2020',
        nodeBorder: '#ccc',
        secondaryColor: 'hsl(180, 1.5873015873%, 28.3529411765%)',
        secondaryTextColor: 'rgb(183.8476190475, 181.5523809523, 181.5523809523)',
        secondaryBorderColor: 'hsl(180, 0%, 18.3529411765%)',
        tertiaryColor: 'hsl(20, 1.5873015873%, 12.3529411765%)',
        tertiaryTextColor: 'rgb(222.9999999999, 223.6666666666, 223.9999999999)',
        tertiaryBorderColor: 'hsl(20, 0%, 2.3529411765%)',
        clusterBkg: 'hsl(180, 1.5873015873%, 28.3529411765%)',
        clusterBorder: 'rgba(255, 255, 255, 0.25)',
        noteBkgColor: 'hsl(180, 1.5873015873%, 28.3529411765%)',
        noteTextColor: 'rgb(183.8476190475, 181.5523809523, 181.5523809523)',
        noteBorderColor: 'hsl(180, 0%, 18.3529411765%)',
        errorBkgColor: '#a44141',
        errorTextColor: '#ddd',
        titleColor: '#F9FFFE',
        edgeLabelBackground: 'hsl(0, 0%, 34.4117647059%)',
        pie1: '#0b0000',
        pie2: '#4d1037',
        pie3: '#3f5258',
        pie4: '#4f2f1b',
        pie5: '#6e0a0a',
        pie6: '#3b0048',
        cScale0: '#1f2020',
        cScale1: '#0b0000',
        cScale2: '#4d1037',
        cScale3: '#3f5258',
        cScale4: '#4f2f1b',
        cScale5: '#6e0a0a',
    });
});

test('the redux-dark-color theme palette is locked to the pinned mermaid version', () => {
    assert.deepEqual(themeVariablePalettes['redux-dark-color'], {
        background: '#333',
        textColor: '#ccc',
        lineColor: '#cccccc',
        primaryColor: '#1f2020',
        primaryTextColor: '#e0dfdf',
        primaryBorderColor: '#cccccc',
        mainBkg: '#111113',
        nodeBorder: '#FFFFFF',
        secondaryColor: 'hsl(180, 1.5873015873%, 28.3529411765%)',
        secondaryTextColor: 'rgb(183.8476190475, 181.5523809523, 181.5523809523)',
        secondaryBorderColor: 'hsl(180, 0%, 18.3529411765%)',
        tertiaryColor: 'hsl(20, 1.5873015873%, 12.3529411765%)',
        tertiaryTextColor: 'rgb(222.9999999999, 223.6666666666, 223.9999999999)',
        tertiaryBorderColor: 'hsl(20, 0%, 2.3529411765%)',
        clusterBkg: '#1E1A2E',
        clusterBorder: '#BDBCCC',
        noteBkgColor: '#FEF9C3',
        noteTextColor: '#28253D',
        noteBorderColor: '#FACC15',
        errorBkgColor: 'hsl(20, 1.5873015873%, 12.3529411765%)',
        errorTextColor: 'rgb(222.9999999999, 223.6666666666, 223.9999999999)',
        titleColor: 'rgb(222.9999999999, 223.6666666666, 223.9999999999)',
        edgeLabelBackground: 'hsl(180, 1.5873015873%, 28.3529411765%)',
        pie1: '#1f2020',
        pie2: 'hsl(180, 1.5873015873%, 28.3529411765%)',
        pie3: 'hsl(20, 1.5873015873%, 12.3529411765%)',
        pie4: 'hsl(180, 1.5873015873%, 2.3529411765%)',
        pie5: 'hsl(180, 1.5873015873%, 18.3529411765%)',
        pie6: 'hsl(20, 1.5873015873%, 2.3529411765%)',
        cScale0: '#f4a8ff',
        cScale1: '#46ecd5',
        cScale2: '#ffb86a',
        cScale3: '#dab2ff',
        cScale4: '#7bf1a8',
        cScale5: '#c4b4ff',
    });
});

test('every palette covers the keys the built-in renderer recolors', () => {
    const required = [
        'background',
        'textColor',
        'lineColor',
        'primaryColor',
        'primaryTextColor',
        'primaryBorderColor',
        'mainBkg',
        'nodeBorder',
        'secondaryColor',
        'secondaryTextColor',
        'secondaryBorderColor',
        'tertiaryColor',
        'tertiaryTextColor',
        'tertiaryBorderColor',
        'clusterBkg',
        'clusterBorder',
        'noteBkgColor',
        'noteTextColor',
        'noteBorderColor',
        'errorBkgColor',
        'errorTextColor',
        'titleColor',
        'edgeLabelBackground',
        'pie1',
        'pie2',
        'pie3',
        'pie4',
        'pie5',
        'pie6',
        'cScale0',
        'cScale1',
        'cScale2',
        'cScale3',
        'cScale4',
        'cScale5',
    ];
    for (const [name, palette] of Object.entries(themeVariablePalettes)) {
        for (const key of required) {
            assert.ok(palette[key], `${name} ${key}`);
        }
    }
});
