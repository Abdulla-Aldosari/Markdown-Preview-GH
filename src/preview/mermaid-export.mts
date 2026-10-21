/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Renders the Mermaid placeholders of an exported page directly inside the
 * browser the page was opened in, so the export command never needs a
 * temporary webview in VS Code. This is a small bootstrap: the page also
 * bakes the official minified UMD builds of the Mermaid library (and the
 * zenuml plugin when needed) inline before this script, and those builds
 * expose themselves on the `window.__esbuild_esm_mermaid_nm` namespace.
 *
 * Each diagram is rendered with the website theme for its type, injected
 * into its source exactly like the live preview does. In addition, when the
 * page is pinned to the dark theme, every diagram is rendered a second time
 * with the light theme; the page shows the dark copy on screen and the light
 * copy is revealed only by the print stylesheet, so printing a dark page
 * produces light diagrams.
 *
 * The pure decision logic lives in `mermaid-render-logic.mts` and
 * `mermaid-diagram-theme.mts`.
 */

import type { MermaidConfig } from 'mermaid';
import { detectDiagramType, injectThemeDirective } from './mermaid-diagram-theme.mts';
import { buildMermaidConfig, resolveExportBrightness } from './mermaid-render-logic.mts';

interface MermaidApi {
    initialize(config: MermaidConfig): void;
    render(id: string, source: string): Promise<{ svg: string }>;
    registerExternalDiagrams(plugins: unknown[], options?: { lazyLoad?: boolean }): void;
}

interface ZenumlPlugin {
    id: string;
    detector: (text: string) => boolean;
    loader: () => Promise<unknown>;
}

/** The namespace the minified UMD builds write their exports to. */
interface ExportNamespace {
    mermaid?: NamespaceEntry<MermaidApi>;
    'mermaid-zenuml'?: NamespaceEntry<ZenumlPlugin>;
}

/** A UMD namespace slot: the library itself or its default-export wrapper. */
type NamespaceEntry<T> = T | { default?: T };

/** Unwraps a UMD namespace slot down to the actual export. */
function unwrapEntry<T>(entry: NamespaceEntry<T> | undefined): T | undefined {
    if (!entry) {
        return undefined;
    }
    if (typeof entry === 'object' && 'default' in entry && entry.default !== undefined) {
        return entry.default;
    }
    return entry as T;
}

interface ExportPageOptions {
    /** The export command was invoked as `Print...`, so print once rendered. */
    print: boolean;
}

declare global {
    interface Window {
        MPGH_EXPORT?: ExportPageOptions;
        __esbuild_esm_mermaid_nm?: ExportNamespace;
    }
}

/** Sources of the zenuml diagram type, which Mermaid itself lacks. */
function isZenumlSource(raw: string): boolean {
    return detectDiagramType(raw) === 'zenuml';
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

/** The raw diagram source of a placeholder block. */
function rawSource(block: HTMLElement): string {
    return (block.dataset.mpghMermaidSource ?? block.textContent ?? '').trim();
}

/**
 * Renders a diagram and returns the finished SVG as a centered, block-level
 * element, or `undefined` when the render fails.
 */
async function renderDiagram(api: MermaidApi, id: string, source: string): Promise<Element | undefined> {
    const { svg } = await api.render(id, source);
    const template = document.createElement('template');
    template.innerHTML = svg;
    const diagram = template.content.firstElementChild;
    if (diagram instanceof SVGElement) {
        diagram.style.display = 'block';
        diagram.style.margin = '0 auto';
    }
    return diagram ?? undefined;
}

/**
 * Replaces every Mermaid placeholder with its rendered SVG. Each diagram is
 * rendered with the website theme for its type; a diagram that fails to
 * render is left as-is, so it degrades to a plain code block instead of
 * breaking the page.
 */
async function renderDiagrams(): Promise<void> {
    const namespace = window.__esbuild_esm_mermaid_nm;
    const mermaid = unwrapEntry(namespace && namespace.mermaid);
    if (!mermaid) {
        throw new Error('The Mermaid library did not load.');
    }
    const brightness = targetBrightness();
    // The zenuml package is a diagram plugin, not a standalone engine:
    // register it on the bundled Mermaid so zenuml renders through the same
    // API as every other diagram type. Its minified UMD build is only baked
    // into the page when the document contains zenuml.
    const zenumlPlugin = unwrapEntry(namespace && namespace['mermaid-zenuml']);
    if (zenumlPlugin) {
        mermaid.registerExternalDiagrams([zenumlPlugin], { lazyLoad: false });
    }
    mermaid.initialize(buildMermaidConfig(brightness));
    // The preview plugin reclassifies its placeholders to mpgh-mermaid, so
    // the export renderer matches both classes.
    const blocks = Array.from(document.querySelectorAll<HTMLElement>('pre.mermaid, div.mermaid, pre.mpgh-mermaid, div.mpgh-mermaid'));
    for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        if (!block.isConnected) {
            continue;
        }
        try {
            const raw = rawSource(block);
            if (!raw) {
                continue;
            }
            const useZenuml = isZenumlSource(raw);
            const source = useZenuml ? raw : injectThemeDirective(raw, brightness);
            const screenDiagram = await renderDiagram(mermaid, `mpgh-export-${index}-screen`, source);
            if (!screenDiagram) {
                continue;
            }
            // A light page needs no second copy: the same diagram serves both
            // screen and print.
            if (brightness === 'light') {
                block.replaceWith(screenDiagram);
                continue;
            }
            const printDiagram = await renderDiagram(mermaid, `mpgh-export-${index}-print`, useZenuml ? raw : injectThemeDirective(raw, 'light'));
            const wrapper = document.createElement('div');
            wrapper.className = 'mpgh-export-diagram';
            const screenSlot = document.createElement('div');
            screenSlot.className = 'mpgh-export-diagram-screen';
            screenSlot.append(screenDiagram);
            wrapper.append(screenSlot);
            if (printDiagram) {
                const printSlot = document.createElement('div');
                printSlot.className = 'mpgh-export-diagram-print';
                printSlot.append(printDiagram);
                wrapper.append(printSlot);
            }
            block.replaceWith(wrapper);
        } catch {
            // Keep the placeholder as a styled code block fallback.
        }
    }
}

/** Removes the waiting overlay the page shows while the diagrams render. */
function finishWaitingOverlay(): void {
    document.querySelector('.mpgh-export-wait')?.remove();
}

async function main(): Promise<void> {
    try {
        await renderDiagrams();
    } catch {
        // A fatal error still reveals the prepared page as code blocks.
    } finally {
        finishWaitingOverlay();
    }
}

void main().then(() => {
    if (window.MPGH_EXPORT?.print) {
        window.print();
    }
});
