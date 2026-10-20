/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Applies the themes of the mermaid.js.org website to the preview and keeps
 * Mermaid diagrams consistent with the preview theme chosen by this
 * extension.
 *
 * Every diagram receives the website theme for its type as a `%%{init}%%`
 * directive prepended to its source — the same per-diagram configuration a
 * user can write by hand. Sources that already define a theme of their own,
 * and previews where the user chose an explicit theme in the
 * `markdown.mermaid.*` settings, are left untouched.
 *
 * The built-in diagram renderer also decides between the light and dark
 * theme names by reading the host color theme (the `vscode-dark` /
 * `vscode-light` class on <body> and the `--vscode-*` variables on <html>)
 * once, synchronously, at the start of every render. The preview theme of
 * this extension is independent from the host theme, so the two can
 * disagree.
 *
 * When they disagree, this script temporarily presents the host theme that
 * matches the preview theme for exactly that synchronous read, then restores
 * the original state before the browser can paint. The renderer then
 * generates its own native stylesheet for the selected theme; no diagram
 * styles are authored here.
 *
 * This is the preview webview entry point. The build bundles it into a
 * classic script (IIFE); the pure decision logic lives in
 * `mermaid-theme-logic.mts` and `mermaid-diagram-theme.mts`.
 */

import { injectThemeDirective } from './mermaid-diagram-theme.mts';
import { palettes, readThemeState, resolvePreviewBrightness, resolveTargetBrightness, type Brightness } from './mermaid-theme-logic.mts';

const updateEvent = 'vscode.markdown.updateContent';

/** True once an update event was dispatched with an override in place. */
let overrideStarted = false;

/** Mirrors the renderer's own dark-theme detection. */
function isHostDark(): boolean {
    const classes = document.body.classList;
    return classes.contains('vscode-dark') || (classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light'));
}

function currentTarget(): Brightness | null {
    const container = document.querySelector('.mpgh-body');
    if (!(container instanceof HTMLElement)) {
        return null;
    }
    return resolveTargetBrightness(
        readThemeState(container.dataset, {
            hostIsDark: isHostDark(),
        })
    );
}

/**
 * Presents the given host theme and returns a function that restores the
 * previous state exactly.
 */
function begin(brightness: Brightness): () => void {
    const root = document.documentElement;
    const body = document.body;
    const savedClassName = body.className;
    const palette = palettes[brightness];
    const saved = Object.keys(palette).map((name) => ({
        name,
        value: root.style.getPropertyValue(name),
        priority: root.style.getPropertyPriority(name),
    }));

    for (const [name, value] of Object.entries(palette)) {
        root.style.setProperty(name, value);
    }
    body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light');
    body.classList.add(brightness === 'dark' ? 'vscode-dark' : 'vscode-light');

    let released = false;
    return () => {
        if (released) {
            return;
        }
        released = true;
        body.className = savedClassName;
        for (const { name, value, priority } of saved) {
            if (value) {
                root.style.setProperty(name, value, priority);
            } else {
                root.style.removeProperty(name);
            }
        }
    };
}

/**
 * Wraps the dispatch of the update event. Listeners of one event run in
 * registration order, and the load order of preview scripts is not
 * defined, so a listener of our own cannot reliably run first. Wrapping
 * the dispatch itself is independent of that order: the diagram sources
 * are themed and the override is in place before any listener runs and
 * removed as soon as the dispatch returns. The renderer reads the host
 * theme synchronously inside its listener, so it sees the override, and
 * the page is never painted with it.
 */
function installDispatchGuard(): void {
    const originalDispatch = window.dispatchEvent;
    window.dispatchEvent = function (this: Window, event: Event): boolean {
        if (!event || event.type !== updateEvent) {
            return originalDispatch.call(this, event);
        }
        if (!skipThemeInjection()) {
            injectDiagramThemes(previewBrightness());
        }
        const target = currentTarget();
        if (!target) {
            return originalDispatch.call(this, event);
        }
        overrideStarted = true;
        const restore = begin(target);
        try {
            return originalDispatch.call(this, event);
        } finally {
            restore();
        }
    };
}

function diagramRenderHasStarted(): boolean {
    return Array.from(document.querySelectorAll('.mermaid')).some(
        (block) => block instanceof HTMLElement && (block.dataset.vscodeContext !== undefined || block.querySelector('svg') !== null)
    );
}

/**
 * Whether the sources the renderer already read carry the theme directive.
 * The preview content can arrive after this script evaluated; a render that
 * read original sources must be redone once the injection has happened.
 */
function injectedSourcesPresent(): boolean {
    return Array.from(document.querySelectorAll('.mermaid')).some((block) => {
        if (!(block instanceof HTMLElement) || block.dataset.vscodeContext === undefined) {
            return false;
        }
        try {
            const parsed = JSON.parse(block.dataset.vscodeContext) as { mermaidSource?: unknown };
            return typeof parsed.mermaidSource === 'string' && parsed.mermaidSource.includes('%%{init');
        } catch {
            return false;
        }
    });
}

/**
 * Whether the user chose an explicit theme in the `markdown.mermaid.*`
 * settings. The renderer embeds the resolved settings in the
 * `#markdown-mermaid` span; an explicit choice (anything but the built-in
 * `vscode` default) turns the per-diagram injection off entirely.
 */
function userPickedExplicitThemes(): boolean {
    const span = document.getElementById('markdown-mermaid');
    if (!(span instanceof HTMLElement) || span.dataset.config === undefined) {
        return false;
    }
    let config: unknown;
    try {
        config = JSON.parse(span.dataset.config);
    } catch {
        return false;
    }
    if (typeof config !== 'object' || config === null) {
        return false;
    }
    const { lightModeTheme, darkModeTheme } = config as { lightModeTheme?: unknown; darkModeTheme?: unknown };
    const isExplicit = (value: unknown): boolean => typeof value === 'string' && value !== 'vscode';
    return isExplicit(lightModeTheme) || isExplicit(darkModeTheme);
}

/** Cached result of the check above; the span is static per page. */
let userExplicitThemes: boolean | null = null;

function skipThemeInjection(): boolean {
    if (userExplicitThemes === null) {
        userExplicitThemes = userPickedExplicitThemes();
    }
    return userExplicitThemes;
}

/** The brightness the preview displays with, resolved from the wrapper. */
function previewBrightness(): Brightness {
    const container = document.querySelector('.mpgh-body');
    const state = readThemeState(container instanceof HTMLElement ? container.dataset : {}, {
        hostIsDark: isHostDark(),
    });
    return resolvePreviewBrightness(state);
}

/**
 * Prepends the website theme directive to every diagram source that does not
 * define a theme of its own. The original source is kept in a data attribute
 * so a later re-render for another brightness can restore and re-theme it.
 */
function injectDiagramThemes(brightness: Brightness): void {
    for (const block of document.querySelectorAll('.mermaid')) {
        if (!(block instanceof HTMLElement)) {
            continue;
        }
        let original = block.dataset.mpghMermaidSource ?? null;
        if (original === null) {
            original = (block.textContent ?? '').trim();
            if (original === '') {
                continue;
            }
            block.dataset.mpghMermaidSource = original;
        }
        block.textContent = injectThemeDirective(original, brightness);
    }
}

/**
 * The renderer empties each diagram element when it starts and keeps the
 * diagram source only in the element's context data. A new render reads
 * the source from the element's text, so the text must be put back first,
 * together with the leftovers of a render that already finished. The
 * original (unthemed) source this script stored wins over the renderer's
 * copy, which carries the injected theme directive.
 */
function restoreDiagramSources(): void {
    for (const block of document.querySelectorAll('.mermaid')) {
        if (!(block instanceof HTMLElement) || block.dataset.vscodeContext === undefined) {
            continue;
        }
        let source: string;
        const stored = block.dataset.mpghMermaidSource;
        if (stored !== undefined) {
            source = stored;
        } else {
            try {
                const parsed = JSON.parse(block.dataset.vscodeContext) as { mermaidSource?: unknown };
                if (typeof parsed.mermaidSource !== 'string') {
                    continue;
                }
                source = parsed.mermaidSource;
            } catch {
                continue;
            }
        }
        const wrapper = block.closest('.mermaid-wrapper');
        if (wrapper && wrapper.parentNode) {
            wrapper.parentNode.replaceChild(block, wrapper);
        }
        block.textContent = source;
    }
}

/**
 * The renderer starts its first render when its own script is evaluated,
 * without an update event, so that render cannot be intercepted ahead of
 * time. The diagram sources are themed before it can read them; a render
 * that already started with the original sources is redone through a
 * regular update event. The brightness override keeps its own rule: a
 * render that starts with the wrong host theme is redone with the override
 * in place, so the wrong theme is never displayed.
 */
function watchInitialRender(): void {
    const injecting = !skipThemeInjection();
    if (injecting) {
        injectDiagramThemes(previewBrightness());
    }
    const requestRerender = (needed: boolean) => {
        if (!overrideStarted && needed) {
            restoreDiagramSources();
            window.dispatchEvent(new CustomEvent(updateEvent));
        }
    };

    if (diagramRenderHasStarted()) {
        // Started before this script themed the sources, or before the
        // preview theme was known: redo it through the guarded dispatch.
        requestRerender(injecting || currentTarget() !== null);
        return;
    }

    const observer = new MutationObserver(() => {
        if (!diagramRenderHasStarted()) {
            return;
        }
        observer.disconnect();
        // A render that starts now normally reads the themed sources; redo
        // it when the sources were not themed in time or when the host
        // theme disagrees with the preview theme.
        requestRerender(currentTarget() !== null || (injecting && !injectedSourcesPresent()));
    });
    observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-vscode-context'],
    });
}

installDispatchGuard();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchInitialRender, { once: true });
} else {
    watchInitialRender();
}
