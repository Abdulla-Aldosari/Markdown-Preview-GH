/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Keeps Mermaid diagrams in the Markdown preview consistent with the preview
 * theme chosen by this extension.
 *
 * The built-in diagram renderer decides between its light and dark palettes
 * by reading the host color theme (the `vscode-dark` / `vscode-light` class
 * on <body> and the `--vscode-*` variables on <html>) once, synchronously, at
 * the start of every render. The preview theme of this extension is
 * independent from the host theme, so the two can disagree.
 *
 * When they disagree, this script temporarily presents the host theme that
 * matches the preview theme for exactly that synchronous read, then restores
 * the original state before the browser can paint. The renderer then
 * generates its own native stylesheet for the requested theme; no diagram
 * styles are authored here.
 *
 * This is the preview webview entry point. The build bundles it into a
 * classic script (IIFE); the pure decision logic lives in
 * `mermaid-theme-logic.mts`.
 */

import { palettes, readThemeState, resolveTargetBrightness, type Brightness } from './mermaid-theme-logic.mts';

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
 * the dispatch itself is independent of that order: the override is in
 * place before any listener runs and removed as soon as the dispatch
 * returns. The renderer reads the host theme synchronously inside its
 * listener, so it sees the override, and the page is never painted with it.
 */
function installDispatchGuard(): void {
    const originalDispatch = window.dispatchEvent;
    window.dispatchEvent = function (this: Window, event: Event): boolean {
        if (!event || event.type !== updateEvent) {
            return originalDispatch.call(this, event);
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
 * The renderer empties each diagram element when it starts and keeps the
 * diagram source only in the element's context data. A new render reads
 * the source from the element's text, so the text must be put back first,
 * together with the leftovers of a render that already finished.
 */
function restoreDiagramSources(): void {
    for (const block of document.querySelectorAll('.mermaid')) {
        if (!(block instanceof HTMLElement) || block.dataset.vscodeContext === undefined) {
            continue;
        }
        let source: unknown;
        try {
            source = JSON.parse(block.dataset.vscodeContext).mermaidSource;
        } catch {
            continue;
        }
        if (typeof source !== 'string') {
            continue;
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
 * time. Once it is seen starting with the wrong host theme, the diagram
 * sources are restored and a regular update event is requested. The
 * renderer aborts the superseded render before it writes any output, so
 * the wrong palette is never displayed.
 */
function watchInitialRender(): void {
    const requestRerender = () => {
        if (!overrideStarted && currentTarget()) {
            restoreDiagramSources();
            window.dispatchEvent(new CustomEvent(updateEvent));
        }
    };

    if (diagramRenderHasStarted()) {
        requestRerender();
        return;
    }

    const observer = new MutationObserver(() => {
        if (!diagramRenderHasStarted()) {
            return;
        }
        observer.disconnect();
        requestRerender();
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
