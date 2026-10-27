/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreferenceContext, checkMark, preferenceOptions } from '../src/preferences-menu.mts';
import { validColorModes } from '../src/color-mode.mts';
import { CONTENT_DIRECTIONS, CONTENT_WIDTHS } from '../src/preview-settings.mts';

test('the options list every width, direction, and theme the settings accept, grouped in order', () => {
    const valuesOf = (group: string): string[] => preferenceOptions.filter((option) => option.group === group).map((option) => option.value);
    assert.deepEqual(valuesOf('width').sort(), [...CONTENT_WIDTHS].sort());
    assert.deepEqual(valuesOf('direction').sort(), [...CONTENT_DIRECTIONS].sort());
    assert.deepEqual(valuesOf('theme').sort(), [...validColorModes].sort());
    assert.deepEqual(
        preferenceOptions.map((option) => option.label),
        ['Width Narrow', 'Width Normal', 'Width Wide', 'Width Full', 'Direction Auto', 'Direction LTR', 'Direction RTL', 'Theme Auto', 'Theme Dark', 'Theme Light']
    );
});

test('each option has a plain and a checked command with opposite conditions', () => {
    for (const option of preferenceOptions) {
        assert.equal(option.checkedLabel, `${option.label} ${checkMark}`);
        assert.equal(option.checkedCommand, `${option.command}.checked`);
        assert.equal(option.whenChecked, `${option.contextKey} == '${option.value}'`);
        assert.equal(option.whenUnchecked, `${option.contextKey} != '${option.value}'`);
    }
    const commands = preferenceOptions.flatMap((option) => [option.command, option.checkedCommand]);
    assert.equal(new Set(commands).size, commands.length, 'every command id is unique');
});

test('the groups sort by their number so separators fall between width, direction, and theme', () => {
    const groups = preferenceOptions.map((option) => option.menuGroup);
    assert.deepEqual(groups, ['1_width@1', '1_width@2', '1_width@3', '1_width@4', '2_direction@1', '2_direction@2', '2_direction@3', '3_theme@1', '3_theme@2', '3_theme@3']);
});

test('the context carries the effective value of each preference', () => {
    assert.deepEqual(buildPreferenceContext({ direction: 'ltr', width: 'normal', themeMode: 'auto' }), {
        mpghWidth: 'normal',
        mpghDirection: 'ltr',
        mpghTheme: 'auto',
    });
});

test('exactly one command of every group is checked for any effective value', () => {
    const context = buildPreferenceContext({ direction: 'rtl', width: 'full', themeMode: 'dark' });
    for (const group of ['width', 'direction', 'theme']) {
        const options = preferenceOptions.filter((option) => option.group === group);
        const checked = options.filter((option) => context[option.contextKey] === option.value);
        assert.equal(checked.length, 1, `${group} has one checked option`);
    }
});
