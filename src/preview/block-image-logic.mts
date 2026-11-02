/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure decision logic of the block-to-image copy in the preview: which
 * elements are blocks, where a section ends, how large the image may be, and
 * what the user is told. No DOM access, so it is unit-testable in plain Node.
 */

import { blockImageScales, type BlockImageScale, type BlockKind } from '../block-image-protocol.mts';

/** The elements that count as a block of each kind, relative to the preview content. */
export const blockSelectors: Readonly<Record<BlockKind, string>> = {
    table: 'table',
    code: 'pre:not(.mpgh-mermaid)',
    diagram: '.mpgh-mermaid',
    section: 'h1, h2, h3, h4, h5, h6',
};

/** The space kept around the copied block, in CSS pixels. */
export const capturePadding = 16;

/** The most elements one image may hold: every element carries its computed styles. */
export const maxCaptureNodes = 1500;

/** The largest canvas the copy draws; larger blocks are refused instead of cut. */
export const canvasLimits = { maxSide: 16384, maxArea: 100_000_000 } as const;

/**
 * The zoom the image document is laid out at: the device pixel ratio of the
 * page. The page snaps every thin border to whole device pixels, so at a
 * fractional ratio a `1px` border is computed as `1 / ratio` css pixels (for
 * example `0.8px` at 125%). An image document has a ratio of 1 and would draw
 * that border a whole pixel wide again; every cell, whose size is copied from
 * the page, would then lose that fraction to its border, break its text onto a
 * second line, and push the bottom of the block out of the image. Laid out at
 * the page's ratio, the document snaps and measures exactly as the page did.
 * An unusable ratio falls back to 1.
 */
export function layoutZoom(devicePixelRatio: number): number {
    return Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
}

/** The level (1 to 6) of a heading tag name, or `null` for any other tag. */
export function headingLevel(tagName: string): number | null {
    const match = /^H([1-6])$/i.exec(tagName);
    return match ? Number(match[1]) : null;
}

/**
 * How many consecutive siblings, starting at the heading `tagNames[start]`,
 * belong to its section: everything up to the next heading of the same or a
 * higher rank. Returns 0 when the starting tag is not a heading.
 */
export function sectionLength(tagNames: readonly string[], start: number): number {
    const level = start >= 0 && start < tagNames.length ? headingLevel(tagNames[start]) : null;
    if (level === null) {
        return 0;
    }
    let end = start + 1;
    while (end < tagNames.length) {
        const next = headingLevel(tagNames[end]);
        if (next !== null && next <= level) {
            break;
        }
        end++;
    }
    return end - start;
}

/**
 * Whether an element with these computed overflow values scrolls. The image
 * shows what the preview shows, so such an element is clipped at its box and
 * never draws a scrollbar: the bars belong to the live page, not to the picture.
 */
export function clipsOverflow(overflowX: string, overflowY: string): boolean {
    return [overflowX, overflowY].some((value) => value === 'auto' || value === 'scroll');
}

/**
 * Whether a picture that is already loaded in the page can still be read from
 * a canvas by loading it again with CORS. A picture that failed to load (the
 * page blocked it or the network did) is never requested again: a second
 * request would only repeat the violation the preview reports to the user.
 */
export function canRetryWithCors(loaded: boolean, readable: boolean): boolean {
    return loaded && !readable;
}

/**
 * Whether a computed CSS color paints nothing (`transparent`, or an `rgba`
 * value with a zero alpha). Used to look past layers without a background
 * when the image needs the color of the page behind a block.
 */
export function isTransparentColor(color: string): boolean {
    const value = color.trim().toLowerCase();
    if (value === '' || value === 'transparent') {
        return true;
    }
    const match = /^rgba?\(([^)]*)\)$/.exec(value);
    if (!match) {
        return false;
    }
    const parts = match[1].split(/[\s,/]+/).filter((part) => part !== '');
    if (parts.length < 4) {
        return false;
    }
    const alpha = parts[3];
    return alpha.endsWith('%') ? Number.parseFloat(alpha) === 0 : Number(alpha) === 0;
}

/** How a block is drawn: the density and the canvas size it leads to. */
export interface CapturePlan {
    scale: number;
    canvasWidth: number;
    canvasHeight: number;
}

export type PlanResult = { ok: true; plan: CapturePlan } | { ok: false; reason: 'empty' | 'tooLarge' };

/**
 * Picks the density of the image: the requested scale when its canvas stays
 * within the limits, otherwise the next smaller scale that does. A block that
 * does not fit even at the actual size (1) is refused.
 */
export function planCapture(width: number, height: number, requested: BlockImageScale, limits: { maxSide: number; maxArea: number } = canvasLimits): PlanResult {
    if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) {
        return { ok: false, reason: 'empty' };
    }
    const candidates = [...blockImageScales].filter((scale) => scale <= requested).reverse();
    for (const scale of candidates.length > 0 ? candidates : [1]) {
        const canvasWidth = Math.ceil(width * scale);
        const canvasHeight = Math.ceil(height * scale);
        if (canvasWidth <= limits.maxSide && canvasHeight <= limits.maxSide && canvasWidth * canvasHeight <= limits.maxArea) {
            return { ok: true, plan: { scale, canvasWidth, canvasHeight } };
        }
    }
    return { ok: false, reason: 'tooLarge' };
}

/** Why a block could not be copied. */
export type FailureReason = 'gone' | 'rendering' | 'empty' | 'tooLarge' | 'tooManyNodes' | 'focus' | 'draw' | 'clipboard' | 'picture';

const failureText: Readonly<Record<FailureReason, string>> = {
    gone: 'it changed before it could be copied. Try again.',
    rendering: 'it is still being drawn. Try again in a moment.',
    empty: 'it has nothing to draw.',
    tooLarge: 'it is too large to copy as one image.',
    tooManyNodes: 'it is too large to copy as an image. Pick a smaller block.',
    focus: 'the preview lost the focus while the image was being prepared. Keep the preview in front until the copy finishes, then try again.',
    draw: 'the image could not be drawn.',
    clipboard: 'the clipboard refused the image.',
    picture: 'a remote picture could not be fetched.',
};

/** The host of a picture address, or the address itself when it cannot be parsed. */
export function pictureHost(address: string): string {
    try {
        return new URL(address).host || address;
    } catch {
        return address;
    }
}

/**
 * The message shown when the copy failed. `pictures` lists the addresses of the
 * remote pictures that could not be fetched; for that reason the message names
 * how many and from which hosts, so the user knows what to look at.
 */
export function describeFailure(label: string, reason: FailureReason, pictures: readonly string[] = []): string {
    if (reason === 'picture' && pictures.length > 0) {
        const noun = pictures.length === 1 ? 'picture' : 'pictures';
        const hosts = [...new Set(pictures.map(pictureHost))].join(', ');
        return `Could not copy the ${label} as an image: ${pictures.length} remote ${noun} could not be fetched (${hosts}).`;
    }
    return `Could not copy the ${label} as an image: ${failureText[reason]}`;
}

/** The message shown when the copy worked. */
export function describeSuccess(label: string): string {
    return `Copied the ${label} as an image.`;
}

/**
 * The PNG a `data:image/png;base64,...` address holds, or `null` when the
 * address is not a base64 PNG. A canvas that holds a drawn SVG hands its
 * pixels over at once as an address, while `toBlob` waits for an idle period
 * of the page that can take seconds.
 */
export function pngBlobFromDataUrl(url: string): Blob | null {
    const prefix = 'data:image/png;base64,';
    if (!url.startsWith(prefix)) {
        return null;
    }
    try {
        const binary = atob(url.slice(prefix.length));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
            bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: 'image/png' });
    } catch {
        return null;
    }
}

/** How long the progress bar and the working message stay visible at least, so a fast copy does not make them flash. */
export const progressMinMs = 500;

/** How much longer the progress bar must stay up to reach its minimum, never below 0. */
export function remainingProgressMs(shownAt: number, now: number, minMs: number = progressMinMs): number {
    const elapsed = now - shownAt;
    return Number.isFinite(elapsed) ? Math.max(0, Math.ceil(minMs - elapsed)) : 0;
}

/** How long the copy waits for the preview to get the focus back once the image is ready. */
export const focusWaitMs = 15000;

/** The message shown while the image is being prepared. */
export function describeBusy(label: string): string {
    return `Copying the ${label} as an image. Keep the preview in front until it finishes.`;
}

/** The message shown when the image is ready but the preview has no focus, which the clipboard requires. */
export function describeFocusWait(label: string): string {
    return `The ${label} image is ready. Click the preview to finish copying.`;
}

/** The text of the progress shown while remote pictures are fetched. */
export function describeProgress(done: number, total: number): string {
    return `Fetching remote pictures: ${done} of ${total}`;
}

/** The share of the fetches that are finished, as a whole percentage from 0 to 100. */
export function progressPercent(done: number, total: number): number {
    if (!(total > 0) || !Number.isFinite(done)) {
        return 0;
    }
    return Math.round(Math.min(Math.max(done / total, 0), 1) * 100);
}
