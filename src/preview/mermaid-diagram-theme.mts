/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure decision logic that assigns every Mermaid diagram the theme the
 * mermaid.js.org website would render it with. No DOM access, so it is
 * unit-testable in plain Node.
 *
 * The theme travels as a `%%{init}%%` directive prepended to the diagram
 * source — the same per-diagram configuration a user can write by hand, so
 * the live preview, the export, and the website all resolve it identically.
 * A source that already carries its own theme configuration is left alone.
 */

import { themeVariablePalettes } from './mermaid-theme-palettes.mts';
import type { Brightness } from './mermaid-theme-logic.mts';

/**
 * Source keywords of the node-based diagram types whose renderers carry a
 * dark color theme of their own. They get `redux-dark-color` in dark mode;
 * every type uses the classic `default` theme in light mode and the classic
 * `dark` theme in dark mode otherwise.
 */
const DARK_COLOR_THEME_KEYWORDS = new Set([
    'flowchart',
    'flowchart-elk',
    'graph',
    'swimlane-beta',
    'classDiagram',
    'erDiagram',
    'requirement',
    'requirementDiagram',
    'sequenceDiagram',
    'stateDiagram',
    'stateDiagram-v2',
]);

/**
 * The first word of a diagram source, after skipping an optional YAML
 * frontmatter block and `%%{init: ...}%%` directives.
 */
export function detectDiagramType(source: string): string {
    const withoutFrontmatter = source.replace(/^\s*---[\S\s]*?---\s*/, '');
    const withoutDirectives = withoutFrontmatter.replace(/^\s*(?:%%\{[\S\s]*?\}%%\s*)*/, '');
    return withoutDirectives.trimStart().split(/\s|\n/, 1)[0] ?? '';
}

/**
 * The theme the given diagram type renders with for the given brightness.
 */
export function selectDiagramTheme(diagramType: string, brightness: Brightness): string {
    if (brightness === 'dark' && DARK_COLOR_THEME_KEYWORDS.has(diagramType)) {
        return 'redux-dark-color';
    }
    return brightness === 'dark' ? 'dark' : 'default';
}

/**
 * Whether the source already defines a theme of its own, either through a
 * leading YAML frontmatter config block or a leading directive. Such a
 * source is the user's explicit choice and is never rewritten.
 */
export function sourceDefinesTheme(source: string): boolean {
    const frontmatter = /^\s*---[\S\s]*?---/.exec(source)?.[0];
    if (frontmatter && /\btheme\s*:/.test(frontmatter)) {
        return true;
    }
    const directive = /^\s*%%\{[\S\s]*?\}%%/.exec(source)?.[0];
    if (directive && /\btheme\b/.test(directive)) {
        return true;
    }
    return false;
}

/**
 * The `%%{init}%%` directive that renders the given diagram type with the
 * website theme for the given brightness: the theme name plus the theme's
 * own values for every variable the built-in renderer recolors with gray
 * editor colors, so the pure theme reaches the diagram.
 */
export function buildThemeDirective(diagramType: string, brightness: Brightness): string {
    const theme = selectDiagramTheme(diagramType, brightness);
    const variables = themeVariablePalettes[theme];
    const config = variables ? `{"theme": "${theme}", "themeVariables": ${JSON.stringify(variables)}}` : `{"theme": "${theme}"}`;
    return `%%{init: ${config}}%%`;
}

/**
 * Prepends the theme directive for the given brightness to a diagram source,
 * unless the source already defines a theme of its own.
 */
export function injectThemeDirective(source: string, brightness: Brightness): string {
    if (sourceDefinesTheme(source)) {
        return source;
    }
    return `${buildThemeDirective(detectDiagramType(source), brightness)}\n${source}`;
}
