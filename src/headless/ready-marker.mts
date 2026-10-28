/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The contract between an exported page and the headless engine: a page that
 * draws diagrams sets this attribute on `<html>` once every diagram is drawn
 * (or has failed), and the engine waits for it before it prints or captures.
 */

/** The attribute the export page sets on `<html>` when it is fully drawn. */
export const readyMarkerAttribute = 'data-mpgh-ready';

/** The part of the `Runtime.evaluate` reply the engine reads. */
export interface ReadyReply {
    result?: { value?: unknown };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
}

/**
 * Checks the reply of the readiness expression. The protocol answers a
 * script that threw or whose context was destroyed with a normal reply that
 * carries `exceptionDetails`, so a missing check turns a page that never
 * became ready into a silently incomplete export.
 * @throws When the expression failed or did not resolve to `true`.
 */
export function assertReady(reply: ReadyReply): void {
    if (reply.exceptionDetails) {
        const detail = reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text ?? 'unknown error';
        throw new Error(`The page did not become ready: ${detail}`);
    }
    if (reply.result?.value !== true) {
        throw new Error('The page did not become ready.');
    }
}

/**
 * Builds the expression the engine evaluates in the page. It resolves once
 * the `load` event has fired and, when the page draws diagrams, once the
 * ready marker is set.
 *
 * The marker can be set at any moment, including between the engine's check
 * and its subscription, so the observer is created before the first check:
 * whichever happens first is seen, and the promise can never miss the change.
 * @param waitForMarker Whether the page carries diagrams and sets the marker.
 */
export function buildReadyExpression(waitForMarker: boolean): string {
    return `new Promise((resolve) => {
    const root = document.documentElement;
    const markerSet = () => !${waitForMarker} || root.hasAttribute('${readyMarkerAttribute}');
    const loaded = () => document.readyState === 'complete';
    const check = () => {
        if (loaded() && markerSet()) {
            observer.disconnect();
            window.removeEventListener('load', check);
            resolve(true);
        }
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, attributeFilter: ['${readyMarkerAttribute}'] });
    window.addEventListener('load', check);
    check();
})`;
}
