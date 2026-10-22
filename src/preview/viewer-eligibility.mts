/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure decision logic of the zoomable viewer: whether a click on an image or
 * a diagram opens it. No DOM access, so it is unit-testable in plain Node.
 */

import type { Size } from './viewer-geometry.mts';

/** Content displayed smaller than this on both sides is an icon, not worth zooming. */
export const minDisplaySize = 48;

/** What is known about the element under the pointer. */
export interface ViewerSubject {
    /** The natural size of the content (`0` when unknown). */
    natural: Size;
    /** The size the content is displayed at in the document. */
    display: Size;
    /** Whether the content sits inside a link, which must keep its own behavior. */
    insideLink: boolean;
}

/** A click on a subject, as far as the decision is concerned. */
export interface ViewerClick extends ViewerSubject {
    button: number;
    defaultPrevented: boolean;
    /** Whether ctrl, meta, shift, or alt was held. */
    hasModifier: boolean;
    /** Whether the user has a text selection (the click then belongs to selecting). */
    hasSelection: boolean;
}

/** Whether an image source is a vector format, which stays sharp when it is enlarged. */
export function isVectorImageSource(source: string): boolean {
    return /^data:image\/svg\+xml[;,]/i.test(source) || /\.svg(?:[?#]|$)/i.test(source);
}

/** Whether the content is worth showing in the viewer, regardless of how it was clicked. */
export function isZoomableSubject({ natural, display, insideLink }: ViewerSubject): boolean {
    if (insideLink) {
        return false;
    }
    if (!(natural.width > 0 && natural.height > 0)) {
        return false;
    }
    return display.width >= minDisplaySize || display.height >= minDisplaySize;
}

/** Whether the click opens the viewer. */
export function canOpenViewer(click: ViewerClick): boolean {
    if (click.button !== 0 || click.defaultPrevented || click.hasModifier || click.hasSelection) {
        return false;
    }
    return isZoomableSubject(click);
}
