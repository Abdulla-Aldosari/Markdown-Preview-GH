/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure decision logic for the Mermaid export renderer. No DOM access, so it
 * is unit-testable in plain Node.
 *
 * The exported page carries a single pinned theme on its root container
 * (`data-theme-mode`). The diagrams baked into the export must follow that
 * theme: a light page gets light diagrams, a dark page gets dark diagrams.
 * The colors are derived from the same palettes the live preview uses, so an
 * exported diagram matches the preview exactly for the same theme.
 */

import { palettes, type Brightness } from './mermaid-theme-logic.mts';
import type { MermaidConfig } from 'mermaid';

/** Message type the renderer script sends back to the extension host. */
export const rendererMessageType = 'mpgh-mermaid-render';

/**
 * Fonts matching the preview webview, so exported diagram text is measured
 * with the same metrics the live preview uses.
 */
export const rendererFontFamily = '"Segoe WPC", "Segoe UI", sans-serif';
export const rendererFontSize = '13px';

/**
 * Decides which palette the exported diagrams must use. `light` and `dark`
 * imply their brightness directly; anything else follows the color scheme of
 * the rendering environment.
 */
export function resolveExportBrightness(mode: string, prefersDark: boolean): Brightness {
    if (mode === 'light' || mode === 'dark') {
        return mode;
    }
    return prefersDark ? 'dark' : 'light';
}

/**
 * Each entry maps one mermaid theme variable to the CSS variables that supply
 * it, in priority order. The chain follows the same fallback order the built-in
 * preview renderer uses; a missing variable is skipped, exactly as the preview
 * skips a variable the host theme does not define.
 */
const themeVariableChains: readonly (readonly [string, ...string[]])[] = [
    ['background', '--vscode-editor-background'],
    ['textColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground'],
    ['lineColor', '--vscode-chart-line', '--vscode-charts-lines', '--vscode-editor-foreground', '--vscode-foreground'],
    ['primaryColor', '--vscode-editorWidget-background'],
    ['primaryTextColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground'],
    ['primaryBorderColor', '--vscode-chart-line', '--vscode-editorWidget-border', '--vscode-focusBorder'],
    ['mainBkg', '--vscode-editorWidget-background'],
    ['nodeBorder', '--vscode-chart-line', '--vscode-editorWidget-border', '--vscode-focusBorder'],
    ['secondaryColor', '--vscode-input-background', '--vscode-editorWidget-background'],
    ['secondaryTextColor', '--vscode-input-foreground', '--vscode-foreground'],
    ['secondaryBorderColor', '--vscode-input-border', '--vscode-editorWidget-border'],
    ['tertiaryColor', '--vscode-textBlockQuote-background', '--vscode-input-background'],
    ['tertiaryTextColor', '--vscode-foreground'],
    ['tertiaryBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border'],
    ['clusterBkg', '--vscode-textBlockQuote-background', '--vscode-input-background'],
    ['clusterBorder', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border'],
    ['noteBkgColor', '--vscode-textBlockQuote-background', '--vscode-editorWidget-background'],
    ['noteTextColor', '--vscode-foreground'],
    ['noteBorderColor', '--vscode-textBlockQuote-border', '--vscode-editorWidget-border'],
    ['errorBkgColor', '--vscode-inputValidation-errorBackground', '--vscode-editorError-background'],
    ['errorTextColor', '--vscode-editorError-foreground', '--vscode-foreground'],
    ['titleColor', '--vscode-charts-foreground', '--vscode-editor-foreground', '--vscode-foreground'],
    ['edgeLabelBackground', '--vscode-editor-background'],
];

/**
 * The accent palette used for pie chart slices and the generic color scale,
 * mirroring the chart colors of the preview's host theme.
 */
const chartPalette: readonly string[] = [
    '--vscode-charts-blue',
    '--vscode-charts-green',
    '--vscode-charts-orange',
    '--vscode-charts-red',
    '--vscode-charts-purple',
    '--vscode-charts-yellow',
];

/**
 * Builds the mermaid `themeVariables` for the given brightness from the
 * shared preview palettes, so the exported diagrams use the exact colors the
 * live preview uses for that theme.
 */
export function buildMermaidThemeVariables(brightness: Brightness): Record<string, string | boolean> {
    const palette = palettes[brightness];
    const variables: Record<string, string | boolean> = {
        darkMode: brightness === 'dark',
    };
    const set = (key: string, ...variableNames: string[]): void => {
        for (const name of variableNames) {
            const value = palette[name];
            if (value) {
                variables[key] = value;
                return;
            }
        }
    };
    for (const [key, ...variableNames] of themeVariableChains) {
        set(key, ...variableNames);
    }
    chartPalette.forEach((name, index) => {
        const value = palette[name];
        if (value) {
            variables[`pie${index + 1}`] = value;
            variables[`cScale${index}`] = value;
        }
    });
    variables.fontFamily = rendererFontFamily;
    variables.fontSize = rendererFontSize;
    return variables;
}

/**
 * The mermaid configuration used by the export renderer: the `base` theme
 * recolored with the theme variables above, no auto-start, and strict
 * sanitization of the produced SVG.
 */
export function buildMermaidConfig(brightness: Brightness): MermaidConfig {
    return {
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        themeVariables: buildMermaidThemeVariables(brightness),
    };
}
