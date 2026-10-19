/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure CSS composition for the theme pipeline.
 *
 * Turns committed palette data (ordered `[name, value]` variable pairs) and
 * the committed base stylesheet into the final preview stylesheets. No
 * network and no filesystem access; callers read the inputs and write the
 * outputs.
 */

/** The class the raw base artifact scopes itself to. */
export const RAW_BODY_CLASS = '.markdown-body';

/** The class the final preview stylesheets scope themselves to. */
export const PREVIEW_BODY_CLASS = '.mpgh-body';

/** An ordered `[name, value]` custom property pair. */
export type VariablePair = [string, string];

export interface ThemeStylesheetInput {
    themeName: string;
    colorScheme: string;
    sharedPairs: VariablePair[];
    themePairs: VariablePair[];
}

/**
 * Builds the hoisted shared variable block.
 */
function sharedBlock(pairs: VariablePair[]): string {
    return `${RAW_BODY_CLASS} {\n${pairs.map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}\n`;
}

/**
 * Builds one theme variable block under the given activation selectors.
 */
function themeBlock(selectors: string[], themeName: string, colorScheme: string, pairs: VariablePair[]): string {
    return `${selectors.join(',\n')} {\n  /* ${themeName} */\n  color-scheme: ${colorScheme};\n${pairs.map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}\n`;
}

/**
 * Builds one variables stylesheet: the shared block followed by one theme
 * block.
 */
function variablesStylesheet(sharedPairs: VariablePair[], themePairs: VariablePair[], selectors: string[], themeName: string, colorScheme: string): string {
    return `${sharedBlock(sharedPairs)}\n${themeBlock(selectors, themeName, colorScheme, themePairs)}`;
}

/**
 * Composes one theme stylesheet: the shared variables hoisted on the body,
 * followed by the theme variables under the fixed-mode selector and the
 * auto-mode selector that follows the editor theme.
 */
export function composeThemeStylesheet({ themeName, colorScheme, sharedPairs, themePairs }: ThemeStylesheetInput): string {
    const selectors = [`[data-theme-mode=${themeName}]`, `.vscode-body.vscode-${themeName} [data-theme-mode=auto]`];
    return variablesStylesheet(sharedPairs, themePairs, selectors, themeName, colorScheme);
}

/**
 * Scopes the raw base stylesheet to the preview body class.
 */
export function composeBaseStylesheet(baseStylesCss: string): string {
    return baseStylesCss.split(RAW_BODY_CLASS).join(PREVIEW_BODY_CLASS);
}
