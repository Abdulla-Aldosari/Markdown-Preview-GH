/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure decision logic for the Mermaid theme sync preview script. No DOM
 * access, so it is unit-testable in plain Node.
 */

export type Brightness = 'light' | 'dark';

/**
 * The mermaid theme names the diagrams render with per brightness: mermaid's
 * `default` theme in light mode and its `dark` theme in dark mode — the same
 * themes the mermaid.js.org website shows its examples with.
 */
export const siteThemes: Readonly<Record<Brightness, 'default' | 'dark'>> = {
    light: 'default',
    dark: 'dark',
};

/**
 * Decides the brightness the diagrams must render with. `light` and `dark`
 * imply their brightness directly; anything else follows the host.
 */
export function resolvePreviewBrightness({ mode, hostIsDark }: ThemeState): Brightness {
    if (mode === 'light') {
        return 'light';
    }
    if (mode === 'dark') {
        return 'dark';
    }
    return hostIsDark ? 'dark' : 'light';
}

/**
 * Host theme variables read by the diagram renderer, resolved from the
 * default light and dark themes.
 */
export const palettes: Readonly<Record<Brightness, Readonly<Record<string, string>>>> = {
    light: {
        '--vscode-editor-background': '#FFFFFF',
        '--vscode-editor-foreground': '#202020',
        '--vscode-foreground': '#202020',
        '--vscode-charts-foreground': '#202020',
        '--vscode-chart-line': '#236B8E',
        '--vscode-charts-lines': '#20202066',
        '--vscode-editorWidget-background': '#FAFAFD',
        '--vscode-editorWidget-border': '#E4E5E6',
        '--vscode-focusBorder': '#0069CC',
        '--vscode-input-background': '#FFFFFF',
        '--vscode-input-foreground': '#202020',
        '--vscode-input-border': '#D8D8D866',
        '--vscode-textBlockQuote-background': '#EAEAEA',
        '--vscode-textBlockQuote-border': '#F0F1F2',
        '--vscode-inputValidation-errorBackground': '#FDEDED',
        '--vscode-editorError-foreground': '#E51400',
        '--vscode-charts-blue': '#1A5CFF',
        '--vscode-charts-green': '#388A34',
        '--vscode-charts-orange': '#D18616',
        '--vscode-charts-red': '#AD0707',
        '--vscode-charts-purple': '#652D90',
        '--vscode-charts-yellow': '#667309',
    },
    dark: {
        '--vscode-editor-background': '#121314',
        '--vscode-editor-foreground': '#BBBEBF',
        '--vscode-foreground': '#BFBFBF',
        '--vscode-charts-foreground': '#CCCCCC',
        '--vscode-chart-line': '#236B8E',
        '--vscode-charts-lines': '#C8CACC80',
        '--vscode-editorWidget-background': '#202122',
        '--vscode-editorWidget-border': '#2A2B2C',
        '--vscode-focusBorder': '#3994BCB3',
        '--vscode-input-background': '#191A1B',
        '--vscode-input-foreground': '#BFBFBF',
        '--vscode-input-border': '#333536',
        '--vscode-textBlockQuote-background': '#242526',
        '--vscode-textBlockQuote-border': '#2A2B2C',
        '--vscode-inputValidation-errorBackground': '#3A1D1D',
        '--vscode-editorError-foreground': '#F14C4C',
        '--vscode-charts-blue': '#57A3F8',
        '--vscode-charts-green': '#86CF86',
        '--vscode-charts-orange': '#CD861A',
        '--vscode-charts-red': '#EF8773',
        '--vscode-charts-purple': '#AD80D7',
        '--vscode-charts-yellow': '#E0B97F',
    },
};

export interface ThemeState {
    mode: string;
    hostIsDark: boolean;
}

/**
 * Decides which host theme the diagrams must be rendered with. The
 * preview has a single theme per mode: `light` and `dark` imply their
 * brightness directly, and anything else follows the host.
 * @returns `null` when the host theme already matches.
 */
export function resolveTargetBrightness({ mode, hostIsDark }: ThemeState): Brightness | null {
    if (mode === 'light') {
        return hostIsDark ? 'light' : null;
    }
    if (mode === 'dark') {
        return hostIsDark ? null : 'dark';
    }
    return null;
}

/**
 * Maps the theme attribute of the preview root container onto the
 * inputs of `resolveTargetBrightness`. `dataset` is the container's
 * `DOMStringMap`; the attribute appears here in camelCase form
 * (`data-theme-mode` reads as `dataset.themeMode`).
 */
export function readThemeState(dataset: { themeMode?: string }, environment: { hostIsDark: boolean }): ThemeState {
    return {
        mode: dataset.themeMode || 'auto',
        hostIsDark: environment.hostIsDark,
    };
}
