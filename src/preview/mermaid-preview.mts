/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Renders the Mermaid placeholders of the live Markdown preview.
 *
 * The built-in diagram renderer never sees them: the Markdown-it plugin of
 * this extension renames their class to `mpgh-mermaid`, so this script owns
 * the rendering completely. Every diagram is rendered with the website theme
 * for its type and the preview brightness, and the finished SVG is cached
 * per source: a render cycle only redraws diagrams whose source changed, so
 * unrelated edits never touch existing diagrams.
 *
 * This is the preview webview entry point. The build keeps it small on
 * purpose: the Mermaid library lives in `dist/mermaid` (the official ESM
 * distribution with its on-demand chunks), which this script loads lazily
 * after the document is interactive. The zenuml diagram type, which Mermaid
 * itself lacks, comes from a separate standalone bundle loaded only when
 * the document actually contains a zenuml block.
 */

import type { MermaidConfig } from 'mermaid';
import { detectDiagramType, injectThemeDirective } from './mermaid-diagram-theme.mts';
import { readThemeState, resolvePreviewBrightness, type Brightness } from './mermaid-theme-logic.mts';
import { buildMermaidConfig, selectLargestCacheEntries } from './mermaid-render-logic.mts';

const updateEvent = 'vscode.markdown.updateContent';
const blockSelector = '.mpgh-mermaid';
const renderTimeoutMs = 30_000;

/**
 * The persistent cache. VS Code destroys the webview when the preview tab
 * is hidden and rebuilds it on return, which wipes the in-memory caches
 * and re-renders every diagram. localStorage survives the rebuild (the
 * webview origin stays the same), so finished SVGs are restored from it
 * instantly instead of re-rendering.
 */
const storageKey = 'mpgh-mermaid-cache-v1';
const maxPersistedBytes = 2_000_000;

/** The part of the Mermaid API this script uses. */
interface MermaidApi {
    initialize(config: MermaidConfig): void;
    render(id: string, source: string, container?: HTMLElement): Promise<{ svg: string }>;
}

/** The theme names the user chose explicitly in the settings, if any. */
type ThemeName = NonNullable<MermaidConfig['theme']>;

/** The theme names the user chose explicitly in the settings, if any. */
interface ExplicitThemes {
    light: ThemeName;
    dark: ThemeName;
}

/** The URL of this script, captured while it executes. */
const ownScriptSrc = document.currentScript?.getAttribute('src') ?? '';

let mermaidLoad: Promise<MermaidApi> | null = null;

/**
 * Loads the Mermaid library on demand through a dynamic import, exactly
 * like the built-in diagram renderer does: the module inherits the CSP
 * nonce of this script. A failed attempt is not cached, so the next content
 * update retries instead of leaving every diagram unrendered.
 */
function loadMermaid(): Promise<MermaidApi> {
    if (mermaidLoad) {
        return mermaidLoad;
    }
    const attempt = import(new URL('mermaid/mermaid.esm.mjs', ownScriptSrc).href).then((module: { default?: MermaidApi }) => {
        const api = module.default;
        if (!api) {
            throw new Error('The Mermaid library did not load.');
        }
        return api;
    });
    mermaidLoad = attempt.catch((error: unknown) => {
        mermaidLoad = null;
        throw error;
    });
    return mermaidLoad;
}

/** Whether the source is a zenuml diagram, which Mermaid itself lacks.
 * `detectDiagramType` skips frontmatter and directives, so a zenuml block
 * that carries its own config still counts. */
function isZenumlSource(raw: string): boolean {
    return detectDiagramType(raw) === 'zenuml';
}

let zenumlLoad: Promise<MermaidApi> | null = null;

/**
 * Loads the standalone ZenUML bundle on demand, and only when the document
 * actually contains a zenuml block: it carries a second copy of the whole
 * Mermaid library, so it must never load for documents without one.
 */
function loadZenumlApi(): Promise<MermaidApi> {
    if (zenumlLoad) {
        return zenumlLoad;
    }
    const attempt = import(new URL('zenuml.js', ownScriptSrc).href).then((module: { default?: MermaidApi }) => {
        const api = module.default;
        if (!api) {
            throw new Error('The ZenUML bundle did not expose the library.');
        }
        return api;
    });
    zenumlLoad = attempt.catch((error: unknown) => {
        zenumlLoad = null;
        throw error;
    });
    return zenumlLoad;
}

/**
 * Reads the resolved `markdown.mermaid.*` settings from the span the
 * built-in extension embeds. An explicit choice (anything but the built-in
 * `vscode` default) replaces the per-diagram injection entirely.
 */
function readExplicitThemes(): ExplicitThemes | null {
    const span = document.getElementById('markdown-mermaid');
    if (!(span instanceof HTMLElement) || span.dataset.config === undefined) {
        return null;
    }
    try {
        const config = JSON.parse(span.dataset.config) as { lightModeTheme?: unknown; darkModeTheme?: unknown };
        const light = typeof config.lightModeTheme === 'string' && config.lightModeTheme !== 'vscode' ? (config.lightModeTheme as ThemeName) : null;
        const dark = typeof config.darkModeTheme === 'string' && config.darkModeTheme !== 'vscode' ? (config.darkModeTheme as ThemeName) : null;
        return light || dark ? { light: light ?? 'default', dark: dark ?? 'dark' } : null;
    } catch {
        return null;
    }
}

/** Mirrors the host-theme dark detection of the built-in preview. */
function isHostDark(): boolean {
    const classes = document.body.classList;
    return classes.contains('vscode-dark') || (classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light'));
}

/** The brightness the preview displays with, resolved from the wrapper. */
function currentBrightness(): Brightness {
    const container = document.querySelector('.mpgh-body');
    return resolvePreviewBrightness(
        readThemeState(container instanceof HTMLElement ? container.dataset : {}, {
            hostIsDark: isHostDark(),
        })
    );
}

/** Finished SVGs, keyed by brightness and the (possibly themed) source. */
const svgCache = new Map<string, string>();

/**
 * Messages of failed renders, keyed like the SVG cache: a failed diagram is
 * never retried in the same session, so a source the library cannot parse
 * does not spin the render loop (or the CPU) forever.
 */
const errorCache = new Map<string, string>();
/** Whether new SVGs were cached since the last persist pass. */
let cacheDirty = false;

/** Restores finished SVGs the previous webview instance persisted. */
function loadPersistedCache(): void {
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                svgCache.set(key, value);
            }
        }
    } catch {
        // Missing, corrupt, or unavailable storage: start with an empty cache.
    }
}

/**
 * Persists the largest cached SVGs under the byte limit, so the diagrams
 * that are most expensive to redraw survive the webview being rebuilt.
 */
function persistCache(): void {
    try {
        const kept = selectLargestCacheEntries([...svgCache.entries()], maxPersistedBytes);
        localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(kept)));
    } catch {
        // Storage full or unavailable: the in-memory cache still works.
    }
}

let initializedBrightness: Brightness | null = null;
let initializedZenumlBrightness: Brightness | null = null;

/**
 * Initializes mermaid for the given brightness. The fallback theme matters
 * only for sources the per-diagram injection leaves alone (an explicit
 * setting choice): then it picks the real website theme.
 */
function ensureInitialized(api: MermaidApi, brightness: Brightness): void {
    if (initializedBrightness === brightness) {
        return;
    }
    const config = buildMermaidConfig(brightness);
    const explicit = readExplicitThemes();
    if (explicit) {
        config.theme = brightness === 'dark' ? explicit.dark : explicit.light;
    }
    api.initialize(config);
    initializedBrightness = brightness;
}

/**
 * Initializes the standalone ZenUML bundle for the given brightness. Its
 * Mermaid copy is separate, so it keeps its own initialization state.
 */
function ensureZenumlInitialized(api: MermaidApi, brightness: Brightness): void {
    if (initializedZenumlBrightness === brightness) {
        return;
    }
    const config = buildMermaidConfig(brightness);
    const explicit = readExplicitThemes();
    if (explicit) {
        config.theme = brightness === 'dark' ? explicit.dark : explicit.light;
    }
    api.initialize(config);
    initializedZenumlBrightness = brightness;
}

async function renderBlock(api: MermaidApi, index: number, block: HTMLElement, source: string, cacheKey: string): Promise<void> {
    const svgId = `mpgh-mermaid-${Date.now()}-${index}`;
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Mermaid rendering timed out')), renderTimeoutMs);
    });
    try {
        const { svg } = await Promise.race([api.render(svgId, source), timeout]);
        svgCache.set(cacheKey, svg);
        cacheDirty = true;
        block.dataset.mpghCache = cacheKey;
        block.dataset.mpghRendered = '1';
        block.innerHTML = svg;
    } catch (error) {
        const message = String(error);
        errorCache.set(cacheKey, message);
        const errorBlock = document.createElement('pre');
        errorBlock.className = 'mermaid-error';
        errorBlock.textContent = message;
        block.replaceChildren(errorBlock);
        block.dataset.mpghError = cacheKey;
    }
}

/**
 * Renders every diagram whose source is not already in the cache. Cached
 * diagrams are restored from the cache without parsing or rendering, and
 * diagrams that still carry their cached SVG are left untouched entirely,
 * so content updates never flicker unchanged diagrams.
 */
async function renderDiagrams(): Promise<void> {
    const api = await loadMermaid();
    const brightness = currentBrightness();
    ensureInitialized(api, brightness);
    const explicit = readExplicitThemes();
    // The zenuml extension only loads when the document actually uses it.
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(blockSelector));
    const needsZenuml = blocks.some((block) => isZenumlSource((block.dataset.mpghMermaidSource ?? block.textContent ?? '').trim()));
    const zenumlApi = needsZenuml ? await loadZenumlApi() : null;
    if (zenumlApi) {
        ensureZenumlInitialized(zenumlApi, brightness);
    }
    // Renders run strictly one after another: parallel renders race each
    // other on mermaid's module-level state, and the result has been an
    // endless busy loop (100% CPU, no progress, the page never finishes).
    // The cache keeps later updates instant, so the sequential first pass
    // only costs the initial load.
    for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        if (!block.isConnected) {
            continue;
        }
        // After the first render the block contains SVG markup, so the source
        // travels in the data attribute the Markdown-it plugin stored.
        const raw = (block.dataset.mpghMermaidSource ?? block.textContent ?? '').trim();
        if (!raw) {
            continue;
        }
        const useZenuml = isZenumlSource(raw);
        // zenuml carries its own styling and needs no theme directive.
        const source = useZenuml || explicit ? raw : injectThemeDirective(raw, brightness);
        const cacheKey = `${brightness}\n${source}`;
        const failed = errorCache.get(cacheKey);
        if (failed !== undefined) {
            if (block.dataset.mpghError !== cacheKey) {
                const errorBlock = document.createElement('pre');
                errorBlock.className = 'mermaid-error';
                errorBlock.textContent = failed;
                block.replaceChildren(errorBlock);
                block.dataset.mpghError = cacheKey;
            }
            continue;
        }
        const cached = svgCache.get(cacheKey);
        if (cached !== undefined) {
            // Compare keys instead of markup: the browser normalizes innerHTML
            // on read, so a markup comparison would rewrite every cached SVG
            // on every update and destroy the element identity.
            if (block.dataset.mpghCache !== cacheKey || block.dataset.mpghRendered !== '1') {
                block.dataset.mpghCache = cacheKey;
                block.dataset.mpghRendered = '1';
                block.innerHTML = cached;
            }
            continue;
        }
        await renderBlock(useZenuml && zenumlApi ? zenumlApi : api, index, block, source, cacheKey);
    }
}

/**
 * Runs the render once after the current task, coalescing bursts. Only one
 * cycle runs at a time: mermaid keeps module-level state, and a second
 * parallel cycle would re-render the same blocks (flicker), read SVG markup
 * as diagram source ("Syntax error in text"), and stack timed-out renders.
 * A request that arrives while a cycle runs re-runs the cycle once when
 * the current one finishes.
 */
let running = false;
let queued = false;

function scheduleRender(): void {
    if (running) {
        queued = true;
        return;
    }
    running = true;
    void Promise.resolve().then(async () => {
        try {
            await renderDiagrams();
        } catch (error) {
            // Leave the current diagrams (or code blocks) as they are.
            console.error('mpgh-mermaid: render cycle failed', error);
        } finally {
            if (cacheDirty) {
                cacheDirty = false;
                persistCache();
            }
            running = false;
            if (queued) {
                queued = false;
                scheduleRender();
            }
        }
    });
}

/** Whether a mutation happened inside a diagram this script already drew. */
function isInsideRenderedBlock(node: Node): boolean {
    return node instanceof Element && node.closest('.mpgh-mermaid[data-mpgh-rendered="1"]') !== null;
}

function watchContent(): void {
    window.addEventListener(updateEvent, scheduleRender);
    // Content updates and theme switches arrive as DOM changes; the cache
    // makes the repeated runs cheap. Mutations inside blocks this script
    // already rendered are its own writes, so they are ignored: following
    // them up would ping-pong between render and observer.
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && isInsideRenderedBlock(mutation.target)) {
                continue;
            }
            scheduleRender();
            return;
        }
    });
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-theme-mode'],
    });
}

loadPersistedCache();
watchContent();
scheduleRender();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleRender, { once: true });
}
