/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Reads this extension's global configuration. Pure: the configuration is
 * injected through its `get(key)` method, so the module is unit-testable
 * without the `vscode` API.
 */

/** The minimal configuration surface the readers depend on. */
export interface ConfigurationReader {
    get(key: string): unknown;
}

/** The configuration section every setting of this extension lives under. */
export const CONFIG_SECTION = 'markdown-preview-gh';

/** Valid color theme modes; the active theme is implied by the mode. */
export const THEME_MODES: readonly string[] = ['auto', 'dark', 'light'];

/** Valid content directions and widths. */
export const CONTENT_DIRECTIONS: readonly string[] = ['ltr', 'rtl', 'auto'];
export const CONTENT_WIDTHS: readonly string[] = ['narrow', 'normal', 'wide', 'full'];

/**
 * Picks `value` when it is one of `allowed`, otherwise returns `fallback`.
 */
export function pick(allowed: readonly string[], value: unknown, fallback: string): string {
    return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

/**
 * Reads the color theme mode (`auto`, `dark`, or `light`).
 */
export function readThemeSettings(configuration: ConfigurationReader): { mode: string } {
    return { mode: pick(THEME_MODES, configuration.get('colorTheme'), 'auto') };
}

/**
 * Reads the content direction and width defaults.
 */
export function readLayoutSettings(configuration: ConfigurationReader): { direction: string; width: string } {
    return {
        direction: pick(CONTENT_DIRECTIONS, configuration.get('contentDirection'), 'ltr'),
        width: pick(CONTENT_WIDTHS, configuration.get('contentWidth'), 'normal'),
    };
}
