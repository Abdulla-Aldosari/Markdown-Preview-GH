/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Copies one block of the live Markdown preview (a table, a code block, a
 * diagram, or a section under a heading) to the clipboard as a PNG image.
 *
 * Two jobs share this file, which is a preview webview script
 * (`markdown.previewScripts`):
 *
 * - It marks every block with a context value (`data-vscode-context`), so the
 *   context menu entries of the extension appear only over the matching kind
 *   and carry the position of the block in their argument.
 * - It listens for the preview's own `copyImage` message. The extension host
 *   sends it through the preview's built-in command with an id that names the
 *   block; the built-in handler ignores that id, and this script draws the
 *   block and writes the image to the clipboard. The page is never rebuilt.
 *
 * The block is cloned with its computed styles inlined, wrapped in an SVG
 * `foreignObject`, and drawn on a canvas. The decisions (sizes, sections,
 * messages) live in the pure `block-image-logic` module.
 */

import { blockContextKey, blockIndexContextKey, blockKinds, blockLabels, decodeCaptureId, type BlockKind, type CaptureTarget } from '../block-image-protocol.mts';
import {
    blockSelectors,
    capturePadding,
    describeFailure,
    describeSuccess,
    isTransparentColor,
    maxCaptureNodes,
    planCapture,
    sectionLength,
    type FailureReason,
} from './block-image-logic.mts';

const updateEvent = 'vscode.markdown.updateContent';
const contentSelector = '.mpgh-content';
const contextAttribute = 'data-vscode-context';
const toastClass = 'mpgh-block-toast';
const xhtmlNamespace = 'http://www.w3.org/1999/xhtml';
const svgNamespace = 'http://www.w3.org/2000/svg';
/** How long the page waits for the focus the clipboard needs after the menu closes. */
const focusWaitMs = 5000;
const infoToastMs = 3000;
const errorToastMs = 6000;

/** A copy that failed for a reason the user is told about. */
class CopyFailure extends Error {
    readonly reason: FailureReason;

    constructor(reason: FailureReason) {
        super(reason);
        this.reason = reason;
    }
}

function blocksOf(kind: BlockKind): Element[] {
    const content = document.querySelector(contentSelector);
    return content ? Array.from(content.querySelectorAll(blockSelectors[kind])) : [];
}

/** Writes the context value of every block; an unchanged value is not written again. */
function tagBlocks(): void {
    for (const kind of blockKinds) {
        blocksOf(kind).forEach((element, index) => {
            const value = JSON.stringify({ [blockContextKey]: kind, [blockIndexContextKey]: index });
            if (element.getAttribute(contextAttribute) !== value) {
                element.setAttribute(contextAttribute, value);
            }
        });
    }
}

let tagFrame = 0;

function scheduleTagging(): void {
    if (tagFrame !== 0) {
        return;
    }
    tagFrame = window.requestAnimationFrame(() => {
        tagFrame = 0;
        tagBlocks();
    });
}

/** The elements a block image shows: the block itself, or a heading with everything of its section. */
function resolveSubject(target: CaptureTarget): Element[] {
    const element = blocksOf(target.kind)[target.index];
    if (!element) {
        throw new CopyFailure('gone');
    }
    if (target.kind !== 'section') {
        return [element];
    }
    const siblings = Array.from(element.parentElement?.children ?? []);
    const start = siblings.indexOf(element);
    const length = sectionLength(
        siblings.map((sibling) => sibling.tagName),
        start
    );
    return length > 0 ? siblings.slice(start, start + length) : [element];
}

/** Whether a diagram inside the subject is still being drawn (it has neither an SVG nor an error). */
function hasPendingDiagram(subject: readonly Element[]): boolean {
    return subject.some((element) => {
        const diagrams = element.matches('.mpgh-mermaid') ? [element] : Array.from(element.querySelectorAll('.mpgh-mermaid'));
        return diagrams.some((diagram) => !diagram.matches('[data-mpgh-rendered="1"], [data-mpgh-error]'));
    });
}

/** Copies the computed style of every element of the source tree onto the matching element of its clone. */
function inlineComputedStyles(source: Element, clone: Element): void {
    const computed = getComputedStyle(source);
    const declarations: string[] = [];
    for (const property of Array.from(computed)) {
        declarations.push(`${property}:${computed.getPropertyValue(property)}`);
    }
    clone.setAttribute('style', declarations.join(';'));
    clone.removeAttribute(contextAttribute);
    const sourceChildren = Array.from(source.children);
    const cloneChildren = Array.from(clone.children);
    for (let index = 0; index < sourceChildren.length; index++) {
        inlineComputedStyles(sourceChildren[index], cloneChildren[index]);
    }
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('the picture could not be read'));
        reader.readAsDataURL(blob);
    });
}

/**
 * The picture as a data URI, because an image drawn from an SVG cannot load
 * anything else. A loaded picture is redrawn on a canvas first; a picture from
 * another origin taints the canvas and is then fetched instead.
 */
async function imageToDataUrl(image: HTMLImageElement): Promise<string | null> {
    const source = image.currentSrc || image.src;
    if (source.startsWith('data:')) {
        return source;
    }
    if (image.complete && image.naturalWidth > 0) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            canvas.getContext('2d')?.drawImage(image, 0, 0);
            const url = canvas.toDataURL('image/png');
            if (url.startsWith('data:image/')) {
                return url;
            }
        } catch {
            // The canvas is tainted: fall through to fetching the picture.
        }
    }
    try {
        const response = await fetch(source);
        return response.ok ? await blobToDataUrl(await response.blob()) : null;
    } catch {
        return null;
    }
}

/** The pictures of an element, or the element itself when it is one. */
function picturesOf(element: Element): HTMLImageElement[] {
    const found = element.tagName === 'IMG' ? [element] : Array.from(element.querySelectorAll('img'));
    return found.filter((item): item is HTMLImageElement => item instanceof HTMLImageElement);
}

/**
 * Replaces the pictures of the clone by data URIs and returns how many could
 * not be read; those are left out of the image instead of showing a broken one.
 */
async function embedPictures(sources: readonly Element[], clones: readonly Element[]): Promise<number> {
    const pairs: Array<[HTMLImageElement, HTMLImageElement]> = [];
    sources.forEach((source, position) => {
        const cloned = picturesOf(clones[position]);
        picturesOf(source).forEach((image, index) => {
            if (cloned[index]) {
                pairs.push([image, cloned[index]]);
            }
        });
    });
    let missing = 0;
    await Promise.all(
        pairs.map(async ([source, clone]) => {
            const url = await imageToDataUrl(source);
            clone.removeAttribute('srcset');
            clone.removeAttribute('data-src');
            if (url) {
                clone.setAttribute('src', url);
            } else {
                clone.removeAttribute('src');
                clone.style.visibility = 'hidden';
                missing++;
            }
        })
    );
    return missing;
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('the image could not be drawn'));
        image.src = url;
    });
}

interface DrawnBlock {
    blob: Blob;
    missingPictures: number;
}

/** Builds the detached tree the image is made of: the subject, positioned as in the page, on the page background. */
function buildCaptureTree(subject: readonly Element[], rects: readonly DOMRect[], width: number, height: number): { wrapper: Element; clones: Element[] } {
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const wrapper = document.createElementNS(xhtmlNamespace, 'div');
    wrapper.setAttribute('style', `position:relative;box-sizing:border-box;width:${width}px;height:${height}px;overflow:hidden;background:${pageBackground(subject[0])};`);
    const clones = subject.map((element, position) => {
        const clone = element.cloneNode(true) as Element;
        inlineComputedStyles(element, clone);
        // Each block keeps its offset from the first one; the page margins stay out of the image.
        const x = capturePadding + rects[position].left - left;
        const y = capturePadding + rects[position].top - top;
        clone.setAttribute('style', `${clone.getAttribute('style') ?? ''};position:absolute;left:${x}px;top:${y}px;width:${rects[position].width}px;margin:0;`);
        wrapper.append(clone);
        return clone;
    });
    return { wrapper, clones };
}

/** Draws the subject on a canvas and returns it as a PNG. */
async function drawSubject(subject: readonly Element[]): Promise<DrawnBlock> {
    if (hasPendingDiagram(subject)) {
        throw new CopyFailure('rendering');
    }
    const rects = subject.map((element) => element.getBoundingClientRect());
    const contentWidth = Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left));
    const contentHeight = Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top));
    const width = Math.ceil(contentWidth + capturePadding * 2);
    const height = Math.ceil(contentHeight + capturePadding * 2);
    const planned = planCapture(width, height);
    if (!planned.ok) {
        throw new CopyFailure(planned.reason);
    }
    const nodeCount = subject.reduce((sum, element) => sum + 1 + element.querySelectorAll('*').length, 0);
    if (nodeCount > maxCaptureNodes) {
        throw new CopyFailure('tooManyNodes');
    }
    const { wrapper, clones } = buildCaptureTree(subject, rects, width, height);
    const missingPictures = await embedPictures(subject, clones);
    const markup = new XMLSerializer().serializeToString(wrapper);
    const svg = `<svg xmlns="${svgNamespace}" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
    let image: HTMLImageElement;
    try {
        image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    } catch {
        throw new CopyFailure('draw');
    }
    const canvas = document.createElement('canvas');
    canvas.width = planned.plan.canvasWidth;
    canvas.height = planned.plan.canvasHeight;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new CopyFailure('draw');
    }
    context.scale(planned.plan.scale, planned.plan.scale);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    canvas.remove();
    if (!blob) {
        throw new CopyFailure('draw');
    }
    return { blob, missingPictures };
}

/** The color painted behind the subject: the first background found going up from its parent. */
function pageBackground(subject: Element): string {
    for (let node = subject.parentElement; node; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor;
        if (!isTransparentColor(color)) {
            return color;
        }
    }
    return 'rgb(255, 255, 255)';
}

/** Resolves when the document has the focus, which the clipboard requires; the menu hands it back a moment after it closes. */
function waitForFocus(): Promise<boolean> {
    if (document.hasFocus()) {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        const finish = (focused: boolean): void => {
            window.removeEventListener('focus', onFocus);
            window.clearTimeout(timer);
            resolve(focused);
        };
        const onFocus = (): void => finish(true);
        const timer = window.setTimeout(() => finish(document.hasFocus()), focusWaitMs);
        window.addEventListener('focus', onFocus);
    });
}

/** A short message over the preview, announced to screen readers; it replaces the previous one. */
function showToast(message: string, failed: boolean): void {
    document.querySelector(`.${toastClass}`)?.remove();
    const toast = document.createElement('div');
    toast.className = `${toastClass}${failed ? ' is-error' : ''}`;
    toast.setAttribute('role', failed ? 'alert' : 'status');
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), failed ? errorToastMs : infoToastMs);
}

let copying = false;

async function copyBlock(target: CaptureTarget): Promise<void> {
    const label = blockLabels[target.kind];
    if (copying) {
        return;
    }
    copying = true;
    try {
        const drawn = await drawSubject(resolveSubject(target));
        if (!(await waitForFocus())) {
            throw new CopyFailure('focus');
        }
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': drawn.blob })]);
        } catch {
            throw new CopyFailure('clipboard');
        }
        showToast(describeSuccess(label, drawn.missingPictures), false);
    } catch (error) {
        showToast(describeFailure(label, error instanceof CopyFailure ? error.reason : 'draw'), true);
    } finally {
        copying = false;
    }
}

function onHostMessage(event: MessageEvent): void {
    const data = event.data as { type?: unknown; id?: unknown } | null;
    if (!data || data.type !== 'copyImage') {
        return;
    }
    const target = decodeCaptureId(data.id);
    if (target) {
        void copyBlock(target);
    }
}

window.addEventListener('message', onHostMessage);
window.addEventListener(updateEvent, scheduleTagging);
new MutationObserver(scheduleTagging).observe(document.body, { childList: true, subtree: true });
tagBlocks();
