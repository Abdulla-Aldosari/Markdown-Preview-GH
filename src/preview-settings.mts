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

import { defaultBlockImageRadius, defaultBlockImageScale, isBlockImageRadius, isBlockImageScale, type BlockImageScale } from './block-image-protocol.mts';

/** The minimal configuration surface the readers depend on. */
export interface ConfigurationReader {
    get(key: string): unknown;
}

/** A configuration that can also tell where a value was set. */
export interface InspectableConfiguration extends ConfigurationReader {
    inspect(key: string): { globalValue?: unknown; workspaceValue?: unknown; workspaceFolderValue?: unknown } | undefined;
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

/** The key of the setting that holds the scale of the copied block images. */
export const BLOCK_IMAGE_SCALE_KEY = 'blockImageScale';

/** The key of the setting that holds the corner radius of the copied block images. */
export const BLOCK_IMAGE_RADIUS_KEY = 'blockImageRadius';

/**
 * Reads the scale and corner radius of the copied block images. The scale is
 * one of the allowed scales, the actual size (1) for anything else, a number
 * written as text included. The radius is a whole number from 0 to the
 * padding around the block, the default for anything else.
 */
export function readImageSettings(configuration: ConfigurationReader): { scale: BlockImageScale; radius: number } {
    const scale = configuration.get(BLOCK_IMAGE_SCALE_KEY);
    const radius = configuration.get(BLOCK_IMAGE_RADIUS_KEY);
    return {
        scale: isBlockImageScale(scale) ? scale : defaultBlockImageScale,
        radius: isBlockImageRadius(radius) ? radius : defaultBlockImageRadius,
    };
}

/** Whether the user wrote a value for the setting (in the user, workspace, or folder settings), even one equal to the default. */
export function isSettingExplicit(configuration: InspectableConfiguration, key: string): boolean {
    const found = configuration.inspect(key);
    return found !== undefined && [found.globalValue, found.workspaceValue, found.workspaceFolderValue].some((value) => value !== undefined);
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
