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

import {
    blockContextKey,
    blockIndexContextKey,
    blockKinds,
    blockLabels,
    decodeCaptureId,
    type BlockImageScale,
    type BlockKind,
    type CaptureCommand,
    type CaptureTarget,
} from '../block-image-protocol.mts';
import {
    blockSelectors,
    canRetryWithCors,
    capturePadding,
    clipsOverflow,
    describeFailure,
    describeProgress,
    describeSuccess,
    isTransparentColor,
    layoutZoom,
    maxCaptureNodes,
    planCapture,
    pngBlobFromDataUrl,
    progressPercent,
    remainingProgressMs,
    sectionLength,
    type FailureReason,
} from './block-image-logic.mts';

const updateEvent = 'vscode.markdown.updateContent';
const contentSelector = '.mpgh-content';
const contextAttribute = 'data-vscode-context';
const toastClass = 'mpgh-block-toast';
const progressClass = 'mpgh-block-progress';
const xhtmlNamespace = 'http://www.w3.org/1999/xhtml';
const svgNamespace = 'http://www.w3.org/2000/svg';
/** How long the page waits for the focus the clipboard needs after the menu closes. */
const focusWaitMs = 5000;
/** How long a picture may take to answer the CORS request before it is left out. */
const corsWaitMs = 5000;
const infoToastMs = 3000;
const errorToastMs = 6000;

/** A copy that failed for a reason the user is told about. */
class CopyFailure extends Error {
    readonly reason: FailureReason;
    /** The addresses of the pictures that could not be fetched (reason `picture`). */
    readonly pictures: readonly string[];

    constructor(reason: FailureReason, pictures: readonly string[] = []) {
        super(reason);
        this.reason = reason;
        this.pictures = pictures;
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
    // The image shows what the preview shows: a box that scrolls on the page is
    // cut at its edge, and never draws a scrollbar of its own.
    if (clipsOverflow(computed.overflowX, computed.overflowY)) {
        declarations.push('overflow:hidden');
    }
    clone.setAttribute('style', declarations.join(';'));
    clone.removeAttribute(contextAttribute);
    const sourceChildren = Array.from(source.children);
    const cloneChildren = Array.from(clone.children);
    for (let index = 0; index < sourceChildren.length; index++) {
        inlineComputedStyles(sourceChildren[index], cloneChildren[index]);
    }
}

/** The pixels of a loaded picture as a PNG data URI, or `null` when the picture locks them (a taint from another origin). */
function readPixels(image: HTMLImageElement): string | null {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d')?.drawImage(image, 0, 0);
        const url = canvas.toDataURL('image/png');
        return url.startsWith('data:image/') ? url : null;
    } catch {
        return null;
    }
}

/**
 * Loads a picture again as a CORS request. Only a server that allows it hands
 * its pixels over; for any other the load simply fails. The load is an image
 * request, which the preview's security policy allows, so a refusal is silent.
 */
function readWithCors(source: string): Promise<string | null> {
    return new Promise((resolve) => {
        const image = new Image();
        const timer = window.setTimeout(() => resolve(null), corsWaitMs);
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            window.clearTimeout(timer);
            resolve(readPixels(image));
        };
        image.onerror = () => {
            window.clearTimeout(timer);
            resolve(null);
        };
        image.src = source;
    });
}

/**
 * The picture as a data URI, because an image drawn from an SVG cannot load
 * anything else. A loaded picture is redrawn on a canvas first; when that is
 * locked, one CORS request may unlock it. Nothing is fetched with a script: the
 * preview forbids it, and every attempt would be reported to the user as
 * blocked content.
 */
function pictureSource(image: HTMLImageElement): string {
    return image.currentSrc || image.src;
}

/** The pixels of a picture the page can already read (an embedded one, or one on a canvas that stays unlocked), or `null`. */
function readDirect(image: HTMLImageElement): string | null {
    const source = pictureSource(image);
    if (source.startsWith('data:')) {
        return source;
    }
    return image.complete && image.naturalWidth > 0 ? readPixels(image) : null;
}

/** The pictures of an element, or the element itself when it is one. */
function picturesOf(element: Element): HTMLImageElement[] {
    const found = element.tagName === 'IMG' ? [element] : Array.from(element.querySelectorAll('img'));
    return found.filter((item): item is HTMLImageElement => item instanceof HTMLImageElement);
}

/** The progress bar of a copy that fetches remote pictures. */
interface ProgressBar {
    /** When the bar was shown, in `performance.now()` milliseconds. */
    shownAt: number;
    update: (done: number) => void;
    remove: () => void;
}

/** Holds the progress bar of one copy, so the copy itself decides when it goes away. */
interface ProgressSlot {
    current: ProgressBar | null;
}

/**
 * Replaces the pictures of the clone by data URIs. A picture whose pixels are
 * locked (it came from another origin) is requested once more with CORS while a
 * progress bar tells the user the copy is working; the bar stays in `progress`
 * for the copy to remove. One picture that cannot be read fails the whole copy:
 * the image is complete or it is not made.
 */
async function embedPictures(sources: readonly Element[], clones: readonly Element[], progress: ProgressSlot): Promise<void> {
    const pairs: Array<[HTMLImageElement, HTMLImageElement]> = [];
    sources.forEach((source, position) => {
        const cloned = picturesOf(clones[position]);
        picturesOf(source).forEach((image, index) => {
            if (cloned[index]) {
                pairs.push([image, cloned[index]]);
            }
        });
    });
    const unreadable: string[] = [];
    const remote: Array<[HTMLImageElement, HTMLImageElement]> = [];
    for (const [source, clone] of pairs) {
        clone.removeAttribute('srcset');
        clone.removeAttribute('data-src');
        const direct = readDirect(source);
        if (direct) {
            clone.setAttribute('src', direct);
        } else if (canRetryWithCors(source.complete && source.naturalWidth > 0, false)) {
            remote.push([source, clone]);
        } else {
            // A picture that never loaded is not requested again: a second request would only repeat what the preview already reported.
            unreadable.push(pictureSource(source));
        }
    }
    if (remote.length > 0) {
        const bar = showProgress(remote.length);
        progress.current = bar;
        let done = 0;
        await Promise.all(
            remote.map(async ([source, clone]) => {
                const address = pictureSource(source);
                const url = await readWithCors(address);
                if (url) {
                    clone.setAttribute('src', url);
                } else {
                    unreadable.push(address);
                }
                done++;
                bar.update(done);
            })
        );
    }
    if (unreadable.length > 0) {
        throw new CopyFailure('picture', unreadable);
    }
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
}

/**
 * Builds the detached tree the image is made of: the subject, positioned as in
 * the page, on the page background. The tree is laid out at `zoom` (see
 * `layoutZoom`), so its sizes stay in the page's css pixels.
 */
function buildCaptureTree(subject: readonly Element[], rects: readonly DOMRect[], width: number, height: number, zoom: number): { wrapper: Element; clones: Element[] } {
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const wrapper = document.createElementNS(xhtmlNamespace, 'div');
    wrapper.setAttribute(
        'style',
        `zoom:${zoom};position:relative;box-sizing:border-box;width:${width}px;height:${height}px;overflow:hidden;background:${pageBackground(subject[0])};`
    );
    const clones = subject.map((element, position) => {
        const clone = element.cloneNode(true) as Element;
        inlineComputedStyles(element, clone);
        // Each block keeps its offset from the first one; the page margins stay out of the image.
        const x = capturePadding + rects[position].left - left;
        const y = capturePadding + rects[position].top - top;
        // The measured rectangle is the border box, so the box is sized as one: a
        // `content-box` element (a list, a code block, an alert) would otherwise
        // add its padding outside the rectangle and leave the image.
        const box = `box-sizing:border-box;width:${rects[position].width}px;height:${rects[position].height}px`;
        clone.setAttribute('style', `${clone.getAttribute('style') ?? ''};position:absolute;left:${x}px;top:${y}px;${box};margin:0;`);
        wrapper.append(clone);
        return clone;
    });
    return { wrapper, clones };
}

/** Draws the subject on a canvas and returns it as a PNG. */
async function drawSubject(subject: readonly Element[], scale: BlockImageScale, progress: ProgressSlot): Promise<DrawnBlock> {
    if (hasPendingDiagram(subject)) {
        throw new CopyFailure('rendering');
    }
    const rects = subject.map((element) => element.getBoundingClientRect());
    const contentWidth = Math.max(...rects.map((rect) => rect.right)) - Math.min(...rects.map((rect) => rect.left));
    const contentHeight = Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top));
    const width = Math.ceil(contentWidth + capturePadding * 2);
    const height = Math.ceil(contentHeight + capturePadding * 2);
    const planned = planCapture(width, height, scale);
    if (!planned.ok) {
        throw new CopyFailure(planned.reason);
    }
    const nodeCount = subject.reduce((sum, element) => sum + 1 + element.querySelectorAll('*').length, 0);
    if (nodeCount > maxCaptureNodes) {
        throw new CopyFailure('tooManyNodes');
    }
    const zoom = layoutZoom(window.devicePixelRatio);
    const { wrapper, clones } = buildCaptureTree(subject, rects, width, height, zoom);
    await embedPictures(subject, clones, progress);
    const markup = new XMLSerializer().serializeToString(wrapper);
    // The document is `zoom` times larger than the block; it is drawn back at the block's css size.
    const svgWidth = Math.ceil(width * zoom);
    const svgHeight = Math.ceil(height * zoom);
    const svg = `<svg xmlns="${svgNamespace}" width="${svgWidth}" height="${svgHeight}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
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
    context.drawImage(image, 0, 0, svgWidth / zoom, svgHeight / zoom);
    const blob = pngBlobFromDataUrl(canvas.toDataURL('image/png'));
    canvas.remove();
    if (!blob) {
        throw new CopyFailure('draw');
    }
    return { blob };
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

/**
 * The theme mode of the preview wrapper. The messages carry it, so they are
 * colored by the theme of the preview (its own light or dark setting) and not
 * by the theme of the VS Code window around it.
 */
function readThemeMode(): string {
    const container = document.querySelector('.mpgh-body');
    return (container instanceof HTMLElement && container.dataset.themeMode) || 'auto';
}

/** The check mark that ends the message of a successful copy; it carries no meaning of its own, the text does. */
function createCheckIcon(): SVGElement {
    const icon = document.createElementNS(svgNamespace, 'svg');
    icon.setAttribute('class', `${toastClass}-icon`);
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    const stroke = document.createElementNS(svgNamespace, 'path');
    stroke.setAttribute('d', 'M3 8.5 6.5 12 13 4.5');
    icon.append(stroke);
    return icon;
}

/** A short message over the preview, announced to screen readers; it replaces the previous one. */
function showToast(message: string, failed: boolean): void {
    document.querySelector(`.${toastClass}`)?.remove();
    const toast = document.createElement('div');
    toast.className = `${toastClass}${failed ? ' is-error' : ''}`;
    toast.dataset.themeMode = readThemeMode();
    toast.setAttribute('role', failed ? 'alert' : 'status');
    toast.textContent = message;
    if (!failed) {
        toast.append(createCheckIcon());
    }
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), failed ? errorToastMs : infoToastMs);
}

/**
 * A bar at the bottom of the preview while remote pictures are fetched, so the
 * user can tell the copy is working. It is a progress bar for assistive
 * technology too (`role="progressbar"`), and a new one replaces the old.
 */
function showProgress(total: number): ProgressBar {
    document.querySelector(`.${progressClass}`)?.remove();
    const root = document.createElement('div');
    root.className = progressClass;
    root.dataset.themeMode = readThemeMode();
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', String(total));
    const label = document.createElement('div');
    label.className = `${progressClass}-label`;
    const track = document.createElement('div');
    track.className = `${progressClass}-track`;
    const fill = document.createElement('div');
    fill.className = `${progressClass}-fill`;
    track.append(fill);
    root.append(label, track);
    const update = (done: number): void => {
        const text = describeProgress(done, total);
        label.textContent = text;
        root.setAttribute('aria-valuenow', String(done));
        root.setAttribute('aria-valuetext', text);
        root.setAttribute('data-done', String(done));
        fill.style.width = `${progressPercent(done, total)}%`;
    };
    update(0);
    document.body.append(root);
    return { shownAt: performance.now(), update, remove: () => root.remove() };
}

/** Keeps the progress bar of a copy up until it has been visible for its minimum time. */
async function holdProgress(progress: ProgressSlot): Promise<void> {
    if (!progress.current) {
        return;
    }
    const wait = remainingProgressMs(progress.current.shownAt, performance.now());
    if (wait > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, wait));
    }
}

let copying = false;

async function copyBlock(target: CaptureCommand): Promise<void> {
    const label = blockLabels[target.kind];
    if (copying) {
        return;
    }
    copying = true;
    // The bar of a copy with remote pictures stays until the message takes its
    // place, so the wait for the drawing and the clipboard is not left silent.
    const progress: ProgressSlot = { current: null };
    try {
        const drawn = await drawSubject(resolveSubject(target), target.scale, progress);
        if (!(await waitForFocus())) {
            throw new CopyFailure('focus');
        }
        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': drawn.blob })]);
        } catch {
            throw new CopyFailure('clipboard');
        }
        await holdProgress(progress);
        progress.current?.remove();
        showToast(describeSuccess(label), false);
    } catch (error) {
        const failure = error instanceof CopyFailure ? error : new CopyFailure('draw');
        await holdProgress(progress);
        progress.current?.remove();
        showToast(describeFailure(label, failure.reason, failure.pictures), true);
    } finally {
        progress.current?.remove();
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
