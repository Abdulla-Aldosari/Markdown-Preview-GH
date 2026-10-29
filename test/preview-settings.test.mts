/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockImageScales } from '../src/block-image-protocol.mts';
import {
    BLOCK_IMAGE_RADIUS_KEY,
    BLOCK_IMAGE_SCALE_KEY,
    CONFIG_SECTION,
    CONTENT_DIRECTIONS,
    CONTENT_WIDTHS,
    THEME_MODES,
    isSettingExplicit,
    pick,
    readImageSettings,
    readLayoutSettings,
    readThemeSettings,
    type ConfigurationReader,
    type InspectableConfiguration,
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

test('readImageSettings reads every allowed scale with the default radius', () => {
    for (const scale of blockImageScales) {
        assert.deepEqual(readImageSettings(configurationWith({ blockImageScale: scale })), { scale, radius: 10 });
    }
});

test('readImageSettings falls back to the actual size for a missing or invalid scale', () => {
    for (const value of [undefined, null, 0, 4, 1.25, -2, '2', '1', Number.NaN, {}, true]) {
        assert.deepEqual(readImageSettings(configurationWith({ blockImageScale: value })), { scale: 1, radius: 10 }, String(value));
    }
    assert.deepEqual(readImageSettings(configurationWith({})), { scale: 1, radius: 10 });
    assert.equal(BLOCK_IMAGE_SCALE_KEY, 'blockImageScale');
    assert.equal(BLOCK_IMAGE_RADIUS_KEY, 'blockImageRadius');
});

test('readImageSettings reads a valid corner radius and falls back to 10 otherwise', () => {
    for (const radius of [0, 1, 10, 16]) {
        assert.deepEqual(readImageSettings(configurationWith({ blockImageRadius: radius })), { scale: 1, radius }, String(radius));
    }
    for (const value of [undefined, null, -1, 17, 1.5, '10', Number.NaN, {}, true]) {
        assert.deepEqual(readImageSettings(configurationWith({ blockImageRadius: value })), { scale: 1, radius: 10 }, String(value));
    }
});

function inspectable(found: { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown } | undefined): InspectableConfiguration {
    return { get: () => undefined, inspect: () => found };
}

test('isSettingExplicit is true for a value written at any level, the default value included', () => {
    assert.equal(isSettingExplicit(inspectable({ globalValue: 1 }), 'blockImageScale'), true);
    assert.equal(isSettingExplicit(inspectable({ workspaceValue: 1 }), 'blockImageScale'), true);
    assert.equal(isSettingExplicit(inspectable({ workspaceFolderValue: 3 }), 'blockImageScale'), true);
});

test('isSettingExplicit is false when nothing was written', () => {
    assert.equal(isSettingExplicit(inspectable(undefined), 'blockImageScale'), false);
    assert.equal(isSettingExplicit(inspectable({}), 'blockImageScale'), false);
    assert.equal(isSettingExplicit(inspectable({ globalValue: undefined }), 'blockImageScale'), false);
});
