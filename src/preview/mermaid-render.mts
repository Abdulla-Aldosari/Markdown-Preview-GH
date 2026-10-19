/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Renders the Mermaid placeholders of an exported document into finished SVG
 * diagrams and reports the completed body HTML back to the extension host.
 *
 * This script only ever runs inside a hidden, temporary webview the export
 * command opens. It never ships with the exported page: the export bakes the
 * returned static SVG markup into the file, so the final page needs no
 * JavaScript at all.
 *
 * The pure decision logic lives in `mermaid-render-logic.mts`; the shared
 * color palettes live in `mermaid-theme-logic.mts`. The build bundles this
 * file (with the whole mermaid library) into a classic script.
 */

import mermaid from 'mermaid';
import { palettes } from './mermaid-theme-logic.mts';
import { buildMermaidConfig, rendererMessageType, resolveExportBrightness } from './mermaid-render-logic.mts';

interface RendererVscodeApi {
    postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): RendererVscodeApi;

/** Captured synchronously: only valid during the script's own evaluation. */
const ownScript = document.currentScript;

function prefersDarkColorScheme(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Resolves the brightness the diagrams must be rendered with, from the theme
 * pinned on the document's root container.
 */
function targetBrightness(): 'light' | 'dark' {
    const container = document.querySelector('.mpgh-body');
    const mode = container instanceof HTMLElement ? container.dataset.themeMode || 'light' : 'light';
    return resolveExportBrightness(mode, prefersDarkColorScheme());
}

/**
 * Replaces every mermaid placeholder with its rendered SVG. A diagram that
 * fails to render is left as-is, so it degrades to a plain code block instead
 * of breaking the page.
 */
async function renderDiagrams(): Promise<void> {
    const brightness = targetBrightness();
    const root = document.documentElement;
    for (const [name, value] of Object.entries(palettes[brightness])) {
        root.style.setProperty(name, value);
    }
    mermaid.initialize(buildMermaidConfig(brightness));
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('pre.mermaid, div.mermaid'));
    for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        if (!block.isConnected) {
            continue;
        }
        try {
            const source = (block.textContent ?? '').trim();
            if (!source) {
                continue;
            }
            const { svg } = await mermaid.render(`mpgh-mermaid-${index}`, source);
            const template = document.createElement('template');
            template.innerHTML = svg;
            const diagram = template.content.firstElementChild;
            // Mermaid sizes the SVG with width="100%" and a natural-size
            // max-width. The live preview centers it through its own
            // translated wrapper; the exported page has no such wrapper, so
            // the diagram is centered directly with block layout.
            if (diagram instanceof SVGElement) {
                diagram.style.display = 'block';
                diagram.style.margin = '0 auto';
            }
            block.replaceWith(diagram ?? template.content);
        } catch {
            // Keep the placeholder as a styled code block fallback.
        }
    }
}

/**
 * Serializes the document content the host must bake into the export: the
 * `.mpgh-body` wrapper, now carrying finished SVGs.
 */
function finishedBodyHtml(): string {
    const wrapper = document.querySelector('.mpgh-body');
    if (wrapper) {
        return wrapper.outerHTML;
    }
    ownScript?.remove();
    return document.body.innerHTML;
}

async function run(): Promise<void> {
    try {
        await renderDiagrams();
    } catch {
        // Report whatever is available; the host falls back to the prepared
        // (unrendered) body when the message cannot be validated.
    }
    const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined;
    api?.postMessage({ type: rendererMessageType, bodyHtml: finishedBodyHtml() });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void run(), { once: true });
} else {
    void run();
}
