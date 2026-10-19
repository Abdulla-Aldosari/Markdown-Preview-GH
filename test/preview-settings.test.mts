/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CONFIG_SECTION,
    CONTENT_DIRECTIONS,
    CONTENT_WIDTHS,
    THEME_MODES,
    pick,
    readLayoutSettings,
    readThemeSettings,
    type ConfigurationReader,
} from '../src/preview-settings.mts';

function configurationWith(values: Record<string, unknown>): ConfigurationReader {
    return { get: (key) => values[key] };
}

test('CONFIG_SECTION and the valid value lists are stable', () => {
    assert.equal(CONFIG_SECTION, 'markdown-preview-gh');
    assert.deepEqual(THEME_MODES, ['auto', 'dark', 'light']);
    assert.deepEqual(CONTENT_DIRECTIONS, ['ltr', 'rtl', 'auto']);
    assert.deepEqual(CONTENT_WIDTHS, ['narrow', 'normal', 'wide', 'full']);
});

test('pick accepts only allowed values', () => {
    assert.equal(pick(['a', 'b'], 'a', 'fallback'), 'a');
    assert.equal(pick(['a', 'b'], 'c', 'fallback'), 'fallback');
    assert.equal(pick(['a', 'b'], undefined, 'fallback'), 'fallback');
    assert.equal(pick(['a', 'b'], 5, 'fallback'), 'fallback');
});

test('readThemeSettings reads every valid mode', () => {
    assert.deepEqual(readThemeSettings(configurationWith({ colorTheme: 'auto' })), { mode: 'auto' });
    assert.deepEqual(readThemeSettings(configurationWith({ colorTheme: 'dark' })), { mode: 'dark' });
    assert.deepEqual(readThemeSettings(configurationWith({ colorTheme: 'light' })), { mode: 'light' });
});

test('readThemeSettings falls back to auto for missing or invalid values', () => {
    assert.deepEqual(readThemeSettings(configurationWith({})), { mode: 'auto' });
    assert.deepEqual(readThemeSettings(configurationWith({ colorTheme: 'system' })), { mode: 'auto' });
    assert.deepEqual(readThemeSettings(configurationWith({ colorTheme: undefined })), { mode: 'auto' });
});

test('readLayoutSettings reads and validates direction and width', () => {
    assert.deepEqual(readLayoutSettings(configurationWith({ contentDirection: 'rtl', contentWidth: 'wide' })), {
        direction: 'rtl',
        width: 'wide',
    });
    assert.deepEqual(readLayoutSettings(configurationWith({})), { direction: 'ltr', width: 'normal' });
    assert.deepEqual(readLayoutSettings(configurationWith({ contentDirection: 'x', contentWidth: 'y' })), {
        direction: 'ltr',
        width: 'normal',
    });
});
