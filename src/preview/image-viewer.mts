/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The zoomable viewer of the live Markdown preview.
 *
 * A click on an image or on a rendered Mermaid diagram opens it in a modal
 * layer that animates out of the clicked element. Inside the layer the
 * content can be zoomed (wheel, trackpad pinch, two-finger pinch, buttons,
 * keys, double click) and panned (drag, arrow keys). Nothing is added to the
 * document content: the layer is created on demand, appended to the body
 * (outside the content the preview rewrites on every update), and removed
 * when it closes.
 *
 * This is the preview webview entry point (`markdown.previewScripts`). The
 * decisions live in the pure `viewer-eligibility` and `viewer-geometry`
 * modules; this file only reads the DOM and applies their results.
 */

import { canOpenViewer, isVectorImageSource, type ViewerSubject } from './viewer-eligibility.mts';
import {
    centeredTransform,
    clampTransform,
    fitScale,
    isRectVisible,
    panBy,
    pinchTransform,
    scaleEpsilon,
    stepScale,
    toggleScale,
    transformFromRect,
    wheelZoomFactor,
    zoomAt,
    type Margin,
    type Point,
    type ScaleLimits,
    type Size,
    type Transform,
} from './viewer-geometry.mts';

const contentSelector = '.mpgh-content';
const diagramSelector = '.mpgh-mermaid[data-mpgh-rendered="1"]';
const sourceHiddenClass = 'mpgh-viewer-source';
const readyClass = 'mpgh-viewer-ready';
/** The context key the layer sets for the preview's context menu; `package.json` tests it as `!mpghViewer`. */
const viewerContextKey = 'mpghViewer';

/** Must match `--mpgh-viewer-ms` in the stylesheet. */
const animationMs = 220;
/** Pointer events that arrive right after opening belong to the opening gesture. */
const openGuardMs = 350;
const dragThreshold = 4;
const keyPanStep = 64;
const maxScale = 8;
/** The largest scale the fitted view may use: raster images are never enlarged past their pixels. */
const maxRasterFit = 1;
const maxVectorFit = 4;
const fitMargin: Margin = { horizontal: 32, vertical: 56 };

const iconZoomOut = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 7.75A.75.75 0 0 1 2.75 7h10a.75.75 0 0 1 0 1.5h-10A.75.75 0 0 1 2 7.75Z"/></svg>`;
const iconZoomIn = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"/></svg>`;
const iconClose = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`;

/** What the user clicked: the visible element plus the facts the decisions need. */
interface ResolvedSubject extends ViewerSubject {
    element: HTMLImageElement | SVGSVGElement;
    /** Whether the content scales without losing sharpness. */
    vector: boolean;
}

interface Toolbar {
    zoomOut: HTMLButtonElement;
    zoomIn: HTMLButtonElement;
    reset: HTMLButtonElement;
    close: HTMLButtonElement;
}

/** The state of a single-pointer gesture that started on the stage. */
interface Gesture {
    moved: number;
    onContent: boolean;
    multi: boolean;
}

interface Session {
    subject: ResolvedSubject;
    overlay: HTMLElement;
    stage: HTMLElement;
    content: HTMLElement;
    toolbar: Toolbar;
    natural: Size;
    viewport: Size;
    transform: Transform;
    openedAt: number;
    closing: boolean;
    previousFocus: Element | null;
    pointers: Map<number, Point>;
    gesture: Gesture | null;
    pinch: { start: Transform; startPoints: readonly [Point, Point]; ids: readonly [number, number] } | null;
    animationTimer: number;
    /** Removes the document and window listeners the open viewer registered. */
    controller: AbortController;
}

let session: Session | null = null;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * The natural size of the content: the pixel size of an image, or the
 * `viewBox` of a diagram (the displayed size when the diagram has none).
 */
function readNaturalSize(element: HTMLImageElement | SVGSVGElement, display: DOMRect): Size {
    if (element instanceof HTMLImageElement) {
        return { width: element.naturalWidth, height: element.naturalHeight };
    }
    const box = element.viewBox.baseVal;
    return box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : { width: display.width, height: display.height };
}

/** Finds out what a click landed on, or `null` when it landed on neither an image nor a rendered diagram. */
function resolveSubject(target: EventTarget | null): ResolvedSubject | null {
    if (!(target instanceof Element) || !target.closest(contentSelector)) {
        return null;
    }
    const block = target.closest(diagramSelector);
    // A diagram opens only when the click landed on its drawing, not on the
    // empty space of the block around it.
    const element = block ? (target.closest('svg') ? block.querySelector('svg') : null) : target.closest('img');
    if (!(element instanceof HTMLImageElement) && !(element instanceof SVGSVGElement)) {
        return null;
    }
    const rect = element.getBoundingClientRect();
    return {
        element,
        vector: element instanceof SVGSVGElement || isVectorImageSource(element.currentSrc || element.src),
        natural: readNaturalSize(element, rect),
        display: { width: rect.width, height: rect.height },
        insideLink: target.closest('a') !== null,
    };
}

function fitScaleOf(s: Session): number {
    return fitScale(s.natural, s.viewport, fitMargin, s.subject.vector ? maxVectorFit : maxRasterFit);
}

function limitsOf(s: Session): ScaleLimits {
    const fit = fitScaleOf(s);
    return { min: fit, max: Math.max(maxScale, fit) };
}

function stopAnimation(s: Session): void {
    window.clearTimeout(s.animationTimer);
    s.content.classList.remove('is-animating');
}

function setButtonAvailable(button: HTMLButtonElement, available: boolean): void {
    button.setAttribute('aria-disabled', String(!available));
}

/** Applies a transform to the content and refreshes the zoom label and the button states. */
function setTransform(s: Session, transform: Transform): void {
    s.transform = transform;
    s.content.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
    // An attribute instead of text: the Mermaid script observes `childList`
    // changes on the body, and a text update on every wheel tick would wake
    // its render loop for nothing. The stylesheet prints the label.
    s.toolbar.reset.dataset.label = `${Math.round(transform.scale * 100)}%`;
    const limits = limitsOf(s);
    setButtonAvailable(s.toolbar.zoomOut, transform.scale > limits.min + scaleEpsilon);
    setButtonAvailable(s.toolbar.zoomIn, transform.scale < limits.max - scaleEpsilon);
}

/** Moves to the transform with the stylesheet's transition (at once under reduced motion). */
function animateTo(s: Session, transform: Transform): void {
    stopAnimation(s);
    if (reducedMotion.matches) {
        setTransform(s, transform);
        return;
    }
    s.content.classList.add('is-animating');
    setTransform(s, transform);
    s.animationTimer = window.setTimeout(() => s.content.classList.remove('is-animating'), animationMs + 40);
}

function zoomTo(s: Session, targetScale: number, anchor: Point, animate: boolean): void {
    const next = zoomAt(s.transform, targetScale, anchor, s.natural, s.viewport, limitsOf(s));
    if (animate) {
        animateTo(s, next);
    } else {
        stopAnimation(s);
        setTransform(s, next);
    }
}

function viewportCenter(s: Session): Point {
    return { x: s.viewport.width / 2, y: s.viewport.height / 2 };
}

function resetToFit(s: Session): void {
    animateTo(s, centeredTransform(s.natural, s.viewport, fitScaleOf(s)));
}

function isAtFit(s: Session): boolean {
    return Math.abs(s.transform.scale - fitScaleOf(s)) < scaleEpsilon * 5;
}

function windowSize(): Size {
    return { width: window.innerWidth, height: window.innerHeight };
}

function readThemeMode(): string {
    const container = document.querySelector('.mpgh-body');
    return (container instanceof HTMLElement && container.dataset.themeMode) || 'auto';
}

/**
 * A copy of the diagram that can live next to the original in the same
 * document: every id (and so every `url(#...)` reference Mermaid generates
 * from it) gets a suffix, so the copy never resolves markers or gradients
 * through the hidden original.
 */
function createDiagramCopy(svg: SVGSVGElement): SVGSVGElement | null {
    const markup = svg.id ? svg.outerHTML.split(svg.id).join(`${svg.id}-viewer`) : svg.outerHTML;
    const template = document.createElement('template');
    template.innerHTML = markup;
    const copy = template.content.firstElementChild;
    return copy instanceof SVGSVGElement ? copy : null;
}

function createImageCopy(image: HTMLImageElement): HTMLImageElement {
    const copy = document.createElement('img');
    copy.src = image.currentSrc || image.src;
    copy.alt = image.alt;
    copy.draggable = false;
    return copy;
}

function createOverlay(subject: ResolvedSubject): { overlay: HTMLElement; content: HTMLElement; toolbar: Toolbar } | null {
    const media = subject.element instanceof SVGSVGElement ? createDiagramCopy(subject.element) : createImageCopy(subject.element);
    if (!media) {
        return null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'mpgh-viewer';
    overlay.dataset.themeMode = readThemeMode();
    // The stylesheet dresses the two kinds differently: a diagram sits on a
    // themed card, an image has no card at all (its own transparent pixels
    // must stay transparent).
    overlay.dataset.kind = subject.element instanceof SVGSVGElement ? 'diagram' : 'image';
    // The context menu of the preview reads this attribute: the commands of
    // this extension act on a document, and none of them applies to a zoomed
    // image, so their menu entries are hidden while the layer is under the
    // pointer (`!mpghViewer` in their `when` clauses). The built-in
    // entries (cut, copy, paste) are unaffected.
    overlay.dataset.vscodeContext = JSON.stringify({ [viewerContextKey]: true });
    overlay.tabIndex = -1;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', subject.element instanceof SVGSVGElement ? 'Diagram viewer' : 'Image viewer');
    overlay.innerHTML = `
        <div class="mpgh-viewer-stage">
            <div class="mpgh-viewer-content"></div>
        </div>
        <div class="mpgh-viewer-toolbar" role="toolbar" aria-label="Viewer controls">
            <button type="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out (-)">${iconZoomOut}</button>
            <button type="button" data-action="reset" class="mpgh-viewer-zoom" aria-label="Fit to screen" title="Fit to screen (0)"></button>
            <button type="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in (+)">${iconZoomIn}</button>
            <span class="mpgh-viewer-separator" aria-hidden="true"></span>
            <button type="button" data-action="close" aria-label="Close" title="Close (Esc)">${iconClose}</button>
        </div>`;
    const content = overlay.querySelector<HTMLElement>('.mpgh-viewer-content');
    const zoomOut = overlay.querySelector<HTMLButtonElement>('[data-action="zoom-out"]');
    const reset = overlay.querySelector<HTMLButtonElement>('[data-action="reset"]');
    const zoomIn = overlay.querySelector<HTMLButtonElement>('[data-action="zoom-in"]');
    const close = overlay.querySelector<HTMLButtonElement>('[data-action="close"]');
    if (!content || !zoomOut || !reset || !zoomIn || !close) {
        return null;
    }
    content.style.width = `${subject.natural.width}px`;
    content.style.height = `${subject.natural.height}px`;
    content.append(media);
    return { overlay, content, toolbar: { zoomOut, reset, zoomIn, close } };
}

function finishClose(s: Session): void {
    window.clearTimeout(s.animationTimer);
    s.controller.abort();
    s.overlay.remove();
    s.subject.element.classList.remove(sourceHiddenClass);
    if (s.previousFocus instanceof HTMLElement && s.previousFocus.isConnected) {
        s.previousFocus.focus({ preventScroll: true });
    }
    if (session === s) {
        session = null;
    }
}

/** Animates the content back into the element it came from, then removes the viewer. */
function closeViewer(): void {
    const s = session;
    if (!s || s.closing) {
        return;
    }
    s.closing = true;
    s.pinch = null;
    s.pointers.clear();
    stopAnimation(s);
    const source = s.subject.element;
    const rect = source.isConnected ? source.getBoundingClientRect() : null;
    s.overlay.classList.remove('is-open');
    if (reducedMotion.matches) {
        finishClose(s);
        return;
    }
    // Back into the source when it is on screen; otherwise the content fades.
    if (rect && isRectVisible(rect, windowSize())) {
        animateTo(s, transformFromRect(s.natural, rect));
    } else {
        s.overlay.classList.add('is-fade');
    }
    s.animationTimer = window.setTimeout(() => finishClose(s), animationMs + 40);
}

function handleToolbarClick(s: Session, event: MouseEvent): void {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button || button.getAttribute('aria-disabled') === 'true') {
        return;
    }
    const scale = s.transform.scale;
    switch (button.dataset.action) {
        case 'zoom-in':
            zoomTo(s, stepScale(scale, 1, limitsOf(s)), viewportCenter(s), true);
            break;
        case 'zoom-out':
            zoomTo(s, stepScale(scale, -1, limitsOf(s)), viewportCenter(s), true);
            break;
        case 'reset':
            resetToFit(s);
            break;
        case 'close':
            closeViewer();
            break;
    }
}

function handleWheel(s: Session, event: WheelEvent): void {
    event.preventDefault();
    if (s.closing) {
        return;
    }
    const factor = wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey);
    zoomTo(s, s.transform.scale * factor, { x: event.clientX, y: event.clientY }, false);
}

/** A double click on the content toggles between the fitted view and a closer one. */
function handleDoubleClick(s: Session, event: MouseEvent): void {
    // The document's own handler jumps from the preview to the editor on a
    // double click; the viewer owns every double click inside it.
    event.stopPropagation();
    // Pointer capture retargets the click events to the stage, so the hit
    // test uses the coordinates instead of the event target.
    const box = s.content.getBoundingClientRect();
    const onContent = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (s.closing || !onContent || performance.now() - s.openedAt < openGuardMs) {
        return;
    }
    zoomTo(s, toggleScale(s.transform.scale, fitScaleOf(s), limitsOf(s)), { x: event.clientX, y: event.clientY }, true);
}

function pointerPoint(event: PointerEvent): Point {
    return { x: event.clientX, y: event.clientY };
}

function handlePointerDown(s: Session, event: PointerEvent): void {
    if (s.closing || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
    }
    stopAnimation(s);
    s.pointers.set(event.pointerId, pointerPoint(event));
    s.stage.setPointerCapture(event.pointerId);
    if (s.pointers.size === 1) {
        s.gesture = { moved: 0, onContent: event.target instanceof Element && s.content.contains(event.target), multi: false };
        return;
    }
    if (s.pointers.size === 2 && s.gesture) {
        const [first, second] = [...s.pointers.entries()];
        s.gesture.multi = true;
        s.pinch = { start: s.transform, startPoints: [first[1], second[1]], ids: [first[0], second[0]] };
        s.stage.classList.add('is-dragging');
    }
}

function handlePointerMove(s: Session, event: PointerEvent): void {
    const previous = s.pointers.get(event.pointerId);
    if (!previous || !s.gesture || s.closing) {
        return;
    }
    const current = pointerPoint(event);
    s.pointers.set(event.pointerId, current);
    if (s.pinch) {
        const first = s.pointers.get(s.pinch.ids[0]);
        const second = s.pointers.get(s.pinch.ids[1]);
        if (first && second) {
            setTransform(s, pinchTransform(s.pinch.start, s.pinch.startPoints, [first, second], s.natural, s.viewport, limitsOf(s)));
        }
        return;
    }
    s.gesture.moved += Math.hypot(current.x - previous.x, current.y - previous.y);
    if (s.gesture.moved > dragThreshold) {
        s.stage.classList.add('is-dragging');
        setTransform(s, panBy(s.transform, current.x - previous.x, current.y - previous.y, s.natural, s.viewport));
    }
}

function handlePointerEnd(s: Session, event: PointerEvent): void {
    if (!s.pointers.delete(event.pointerId)) {
        return;
    }
    if (s.pinch && s.pointers.size < 2) {
        s.pinch = null;
    }
    if (s.pointers.size > 0) {
        return;
    }
    const gesture = s.gesture;
    s.gesture = null;
    s.stage.classList.remove('is-dragging');
    const isBackdropTap = gesture !== null && !gesture.multi && !gesture.onContent && gesture.moved <= dragThreshold && event.type === 'pointerup';
    if (isBackdropTap && performance.now() - s.openedAt >= openGuardMs) {
        closeViewer();
    }
}

/** Keeps keyboard focus inside the open viewer: the toolbar buttons only. */
function trapFocus(s: Session, event: KeyboardEvent): void {
    const buttons = [s.toolbar.zoomOut, s.toolbar.reset, s.toolbar.zoomIn, s.toolbar.close];
    const index = buttons.findIndex((button) => button === document.activeElement);
    const next = event.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : index === buttons.length - 1 ? 0 : index + 1;
    event.preventDefault();
    buttons[next].focus({ preventScroll: true });
}

function handleKeyDown(s: Session, event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || s.closing) {
        return;
    }
    const center = viewportCenter(s);
    const pan = (dx: number, dy: number): void => {
        stopAnimation(s);
        setTransform(s, panBy(s.transform, dx, dy, s.natural, s.viewport));
    };
    switch (event.key) {
        case 'Escape':
            closeViewer();
            break;
        case '+':
        case '=':
            zoomTo(s, stepScale(s.transform.scale, 1, limitsOf(s)), center, true);
            break;
        case '-':
        case '_':
            zoomTo(s, stepScale(s.transform.scale, -1, limitsOf(s)), center, true);
            break;
        case '0':
            resetToFit(s);
            break;
        case '1':
            zoomTo(s, 1, center, true);
            break;
        case 'ArrowLeft':
            pan(keyPanStep, 0);
            break;
        case 'ArrowRight':
            pan(-keyPanStep, 0);
            break;
        case 'ArrowUp':
            pan(0, keyPanStep);
            break;
        case 'ArrowDown':
            pan(0, -keyPanStep);
            break;
        case 'Tab':
            trapFocus(s, event);
            return;
        default:
            return;
    }
    event.preventDefault();
    event.stopPropagation();
}

function handleResize(s: Session): void {
    const wasAtFit = isAtFit(s);
    s.viewport = { width: s.overlay.clientWidth, height: s.overlay.clientHeight };
    stopAnimation(s);
    setTransform(s, wasAtFit ? centeredTransform(s.natural, s.viewport, fitScaleOf(s)) : clampTransform(s.transform, s.natural, s.viewport));
}

function bindSession(s: Session): void {
    const { signal } = s.controller;
    s.overlay.addEventListener('click', (event) => handleToolbarClick(s, event), { signal });
    s.overlay.addEventListener('wheel', (event) => handleWheel(s, event), { signal, passive: false });
    s.overlay.addEventListener('dblclick', (event) => handleDoubleClick(s, event), { signal });
    s.stage.addEventListener('pointerdown', (event) => handlePointerDown(s, event), { signal });
    s.stage.addEventListener('pointermove', (event) => handlePointerMove(s, event), { signal });
    s.stage.addEventListener('pointerup', (event) => handlePointerEnd(s, event), { signal });
    s.stage.addEventListener('pointercancel', (event) => handlePointerEnd(s, event), { signal });
    document.addEventListener('keydown', (event) => handleKeyDown(s, event), { signal, capture: true });
    window.addEventListener('resize', () => handleResize(s), { signal });
}

function openViewer(subject: ResolvedSubject): void {
    const parts = createOverlay(subject);
    if (!parts) {
        return;
    }
    const sourceRect = subject.element.getBoundingClientRect();
    const previousFocus = document.activeElement;
    document.body.append(parts.overlay);
    const stage = parts.overlay.querySelector<HTMLElement>('.mpgh-viewer-stage');
    if (!stage) {
        parts.overlay.remove();
        return;
    }
    const s: Session = {
        subject,
        overlay: parts.overlay,
        stage,
        content: parts.content,
        toolbar: parts.toolbar,
        natural: subject.natural,
        viewport: { width: parts.overlay.clientWidth, height: parts.overlay.clientHeight },
        transform: { scale: 1, x: 0, y: 0 },
        openedAt: performance.now(),
        closing: false,
        previousFocus,
        pointers: new Map(),
        gesture: null,
        pinch: null,
        animationTimer: 0,
        controller: new AbortController(),
    };
    session = s;
    const fitted = centeredTransform(s.natural, s.viewport, fitScaleOf(s));
    subject.element.classList.add(sourceHiddenClass);
    bindSession(s);
    const fromSource = !reducedMotion.matches && isRectVisible(sourceRect, windowSize());
    setTransform(s, fromSource ? transformFromRect(s.natural, sourceRect) : fitted);
    if (!fromSource) {
        s.overlay.classList.add('is-fade');
    }
    // Commit the starting frame before the transition begins.
    void s.overlay.offsetWidth;
    s.overlay.classList.add('is-open');
    if (fromSource) {
        animateTo(s, fitted);
    }
    s.overlay.focus({ preventScroll: true });
}

function hasTextSelection(): boolean {
    const selection = window.getSelection();
    return selection !== null && !selection.isCollapsed;
}

function handleDocumentClick(event: MouseEvent): void {
    if (session) {
        return;
    }
    const subject = resolveSubject(event.target);
    if (!subject) {
        return;
    }
    const allowed = canOpenViewer({
        ...subject,
        button: event.button,
        defaultPrevented: event.defaultPrevented,
        hasModifier: event.ctrlKey || event.metaKey || event.shiftKey || event.altKey,
        hasSelection: hasTextSelection(),
    });
    if (allowed) {
        openViewer(subject);
    }
}

document.addEventListener('click', handleDocumentClick);
// The stylesheet shows the zoom cursor only once this script is running, so
// pages that carry the stylesheet without the script (the export) stay plain.
document.documentElement.classList.add(readyClass);
