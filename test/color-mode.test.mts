/*-------------------------------------------------
 * Markdown Preview GH - VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveColorMode, validColorModes } from '../src/color-mode.mts';

test('validColorModes lists only the two per-file modes', () => {
    assert.deepEqual(validColorModes, ['light', 'dark']);
});

test('resolveColorMode prefers a valid per-file override', () => {
    assert.equal(resolveColorMode('auto', 'light'), 'light');
    assert.equal(resolveColorMode('system', 'dark'), 'dark');
    assert.equal(resolveColorMode('light', 'dark'), 'dark');
    assert.equal(resolveColorMode('dark', 'light'), 'light');
});

test('resolveColorMode falls back to the global mode without a valid override', () => {
    assert.equal(resolveColorMode('auto', undefined), 'auto');
    assert.equal(resolveColorMode('system', null), 'system');
    assert.equal(resolveColorMode('light', 'unexpected'), 'light');
});
