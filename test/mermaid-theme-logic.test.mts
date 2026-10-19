import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palettes, readThemeState, resolveTargetBrightness } from '../src/preview/mermaid-theme-logic.mts';

const base = {
    mode: 'auto',
    hostIsDark: true,
};

test('resolveTargetBrightness needs no override when the preview follows the host', () => {
    assert.equal(resolveTargetBrightness({ ...base, hostIsDark: true }), null);
    assert.equal(resolveTargetBrightness({ ...base, hostIsDark: false }), null);
});

test('resolveTargetBrightness overrides when a pinned mode differs from the host', () => {
    assert.equal(resolveTargetBrightness({ ...base, mode: 'light', hostIsDark: true }), 'light');
    assert.equal(resolveTargetBrightness({ ...base, mode: 'dark', hostIsDark: false }), 'dark');
    assert.equal(resolveTargetBrightness({ ...base, mode: 'light', hostIsDark: false }), null);
    assert.equal(resolveTargetBrightness({ ...base, mode: 'dark', hostIsDark: true }), null);
});

test('resolveTargetBrightness treats unknown modes like auto', () => {
    assert.equal(resolveTargetBrightness({ ...base, mode: 'unexpected', hostIsDark: true }), null);
});

test('light and dark palettes define the same complete set of variables', () => {
    const lightKeys = Object.keys(palettes.light).sort();
    const darkKeys = Object.keys(palettes.dark).sort();
    assert.deepEqual(lightKeys, darkKeys);

    const required = [
        '--vscode-editor-background',
        '--vscode-charts-foreground',
        '--vscode-chart-line',
        '--vscode-editorWidget-background',
        '--vscode-editorWidget-border',
        '--vscode-input-background',
        '--vscode-textBlockQuote-background',
        '--vscode-textBlockQuote-border',
        '--vscode-inputValidation-errorBackground',
        '--vscode-editorError-foreground',
        '--vscode-charts-blue',
        '--vscode-charts-green',
        '--vscode-charts-orange',
        '--vscode-charts-red',
        '--vscode-charts-purple',
        '--vscode-charts-yellow',
    ];
    for (const key of required) {
        assert.ok(lightKeys.includes(key), key);
    }

    const hex = /^#[0-9A-F]{6}([0-9A-F]{2})?$/;
    for (const mode of ['light', 'dark'] as const) {
        for (const [key, value] of Object.entries(palettes[mode])) {
            assert.match(value, hex, `${mode} ${key}`);
        }
    }
});

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
