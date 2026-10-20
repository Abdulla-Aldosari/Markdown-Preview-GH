import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThemeState, resolvePreviewBrightness, siteThemes } from '../src/preview/mermaid-theme-logic.mts';

test('readThemeState maps the container dataset attribute in camelCase', () => {
    assert.deepEqual(readThemeState({ themeMode: 'dark' }, { hostIsDark: true }), { mode: 'dark', hostIsDark: true });
});

test('readThemeState falls back to the defaults for missing attributes', () => {
    assert.deepEqual(readThemeState({}, { hostIsDark: false }), {
        mode: 'auto',
        hostIsDark: false,
    });
});

test('readThemeState passes the environment through unchanged', () => {
    const state = readThemeState({ themeMode: 'light' }, { hostIsDark: true });
    assert.equal(state.hostIsDark, true);
    assert.equal(state.mode, 'light');
});

test('siteThemes maps each brightness to the website theme', () => {
    assert.equal(siteThemes.light, 'default');
    assert.equal(siteThemes.dark, 'dark');
});

test('resolvePreviewBrightness maps pinned modes directly', () => {
    assert.equal(resolvePreviewBrightness({ mode: 'light', hostIsDark: true }), 'light');
    assert.equal(resolvePreviewBrightness({ mode: 'light', hostIsDark: false }), 'light');
    assert.equal(resolvePreviewBrightness({ mode: 'dark', hostIsDark: true }), 'dark');
    assert.equal(resolvePreviewBrightness({ mode: 'dark', hostIsDark: false }), 'dark');
});

test('resolvePreviewBrightness follows the host for any other mode', () => {
    assert.equal(resolvePreviewBrightness({ mode: 'auto', hostIsDark: true }), 'dark');
    assert.equal(resolvePreviewBrightness({ mode: 'auto', hostIsDark: false }), 'light');
    assert.equal(resolvePreviewBrightness({ mode: 'unexpected', hostIsDark: true }), 'dark');
    assert.equal(resolvePreviewBrightness({ mode: '', hostIsDark: false }), 'light');
});
