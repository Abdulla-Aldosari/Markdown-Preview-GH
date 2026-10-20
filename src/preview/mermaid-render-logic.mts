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
 * Both use the real mermaid themes the mermaid.js.org website renders its
 * examples with, so an exported diagram matches the live preview and the
 * website.
 */

import { siteThemes, type Brightness } from './mermaid-theme-logic.mts';
import type { MermaidConfig } from 'mermaid';

/** Message type the renderer script sends back to the extension host. */
export const rendererMessageType = 'mpgh-mermaid-render';

/**
 * Decides which theme the exported diagrams must use. `light` and `dark`
 * imply their theme directly; anything else follows the color scheme of the
 * rendering environment.
 */
export function resolveExportBrightness(mode: string, prefersDark: boolean): Brightness {
    if (mode === 'light' || mode === 'dark') {
        return mode;
    }
    return prefersDark ? 'dark' : 'light';
}

/**
 * The mermaid configuration used by the export renderer: the real website
 * theme for the given brightness (`default` in light mode, `dark` in dark
 * mode), no auto-start, and strict sanitization of the produced SVG.
 */
export function buildMermaidConfig(brightness: Brightness): MermaidConfig {
    return {
        startOnLoad: false,
        theme: siteThemes[brightness],
        securityLevel: 'strict',
    };
}
