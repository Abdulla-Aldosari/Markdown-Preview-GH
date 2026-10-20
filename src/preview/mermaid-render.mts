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
 * The pure decision logic lives in `mermaid-render-logic.mts` and
 * `mermaid-diagram-theme.mts`. The build keeps this file small: it loads
 * the mermaid library lazily from `dist/mermaid` (the official ESM
 * distribution with its on-demand chunks), because bundling the whole
 * library into one script crashes the webview with a V8 out-of-memory.
 */

import type { MermaidConfig } from 'mermaid';
import { injectThemeDirective } from './mermaid-diagram-theme.mts';
import { buildMermaidConfig, rendererMessageType, resolveExportBrightness } from './mermaid-render-logic.mts';

interface MermaidApi {
    initialize(config: MermaidConfig): void;
    render(id: string, source: string): Promise<{ svg: string }>;
}

interface RendererVscodeApi {
    postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): RendererVscodeApi;

/** Captured synchronously: only valid during the script's own evaluation. */
const ownScript = document.currentScript;

function loadMermaid(): Promise<MermaidApi> {
    return import(new URL('mermaid/mermaid.esm.mjs', ownScript?.getAttribute('src') ?? document.baseURI).href).then((module: { default?: MermaidApi }) => {
        if (!module.default) {
            throw new Error('The Mermaid library did not load.');
        }
        return module.default;
    });
}

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
 * Replaces every mermaid placeholder with its rendered SVG. Each diagram is
 * rendered with the website theme for its type, injected into its source
 * exactly like the live preview does. A diagram that fails to render is
 * left as-is, so it degrades to a plain code block instead of breaking the
 * page.
 */
async function renderDiagrams(): Promise<void> {
    const api = await loadMermaid();
    const brightness = targetBrightness();
    api.initialize(buildMermaidConfig(brightness));
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
            const { svg } = await api.render(`mpgh-mermaid-${index}`, injectThemeDirective(source, brightness));
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
