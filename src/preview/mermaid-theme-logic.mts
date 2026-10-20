/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure decision logic shared by the Mermaid preview renderer and the export
 * renderer. No DOM access, so it is unit-testable in plain Node.
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

export interface ThemeState {
    mode: string;
    hostIsDark: boolean;
}

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
 * Maps the theme attribute of the preview root container onto the inputs of
 * `resolvePreviewBrightness`. `dataset` is the container's `DOMStringMap`;
 * the attribute appears here in camelCase form (`data-theme-mode` reads as
 * `dataset.themeMode`).
 */
export function readThemeState(dataset: { themeMode?: string }, environment: { hostIsDark: boolean }): ThemeState {
    return {
        mode: dataset.themeMode || 'auto',
        hostIsDark: environment.hostIsDark,
    };
}
