/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure geometry of the zoomable viewer: fitting, zooming around a point,
 * panning limits, and pinch gestures. No DOM access, so it is unit-testable
 * in plain Node.
 *
 * The viewer positions its content with a single transform
 * `translate(x, y) scale(scale)` applied with a top-left origin, where the
 * content is laid out at its natural size. Every function here maps one
 * such transform to the next.
 */

export interface Size {
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Transform {
    scale: number;
    x: number;
    y: number;
}

/** The space kept free around fitted content, per side. */
export interface Margin {
    horizontal: number;
    vertical: number;
}

export interface ScaleLimits {
    min: number;
    max: number;
}

/** A rectangle in viewport coordinates, like `DOMRect`. */
export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** The factor one zoom step multiplies (or divides) the scale by. */
export const zoomStep = 1.25;

/** The tolerance when comparing two scales for equality. */
export const scaleEpsilon = 0.001;

/** The largest wheel delta (in pixels) one event may zoom by. */
const maxWheelDelta = 120;

/** The zoom speed of a regular wheel and of a trackpad pinch (`ctrl` wheel). */
const wheelSensitivity = 0.002;
const pinchSensitivity = 0.01;

/** The pixel size of one line and of one page for wheel events that report those units. */
const pixelsPerLine = 16;
const pixelsPerPage = 100;

export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * The scale that fits the content inside the viewport minus the margins,
 * never above `maxScale`. Invalid content sizes fall back to the natural size.
 */
export function fitScale(content: Size, viewport: Size, margin: Margin, maxScale: number): number {
    if (!(content.width > 0 && content.height > 0)) {
        return 1;
    }
    const availableWidth = Math.max(1, viewport.width - margin.horizontal * 2);
    const availableHeight = Math.max(1, viewport.height - margin.vertical * 2);
    return Math.min(availableWidth / content.width, availableHeight / content.height, maxScale);
}

/** One axis of the pan limits: centered when it fits, otherwise kept edge to edge. */
function clampAxis(offset: number, contentSize: number, viewportSize: number): number {
    if (contentSize <= viewportSize) {
        return (viewportSize - contentSize) / 2;
    }
    return clamp(offset, viewportSize - contentSize, 0);
}

/** The transform that centers the content in the viewport at the given scale. */
export function centeredTransform(content: Size, viewport: Size, scale: number): Transform {
    return {
        scale,
        x: (viewport.width - content.width * scale) / 2,
        y: (viewport.height - content.height * scale) / 2,
    };
}

/**
 * Keeps the content from drifting out of the viewport: an axis that fits is
 * centered, an axis that overflows stays edge to edge.
 */
export function clampTransform(transform: Transform, content: Size, viewport: Size): Transform {
    return {
        scale: transform.scale,
        x: clampAxis(transform.x, content.width * transform.scale, viewport.width),
        y: clampAxis(transform.y, content.height * transform.scale, viewport.height),
    };
}

/** Moves the content by the given offset, within the pan limits. */
export function panBy(transform: Transform, dx: number, dy: number, content: Size, viewport: Size): Transform {
    return clampTransform({ scale: transform.scale, x: transform.x + dx, y: transform.y + dy }, content, viewport);
}

/**
 * Changes the scale while the content point under `anchor` stays under it.
 * The scale is clamped to the limits first.
 */
export function zoomAt(transform: Transform, targetScale: number, anchor: Point, content: Size, viewport: Size, limits: ScaleLimits): Transform {
    const scale = clamp(targetScale, limits.min, limits.max);
    const ratio = scale / transform.scale;
    return clampTransform(
        {
            scale,
            x: anchor.x - (anchor.x - transform.x) * ratio,
            y: anchor.y - (anchor.y - transform.y) * ratio,
        },
        content,
        viewport
    );
}

/**
 * The next scale of a zoom button or key press. A step that would cross the
 * actual size (100%) stops there first, so the natural size is easy to reach.
 */
export function stepScale(scale: number, direction: 1 | -1, limits: ScaleLimits): number {
    const next = direction > 0 ? scale * zoomStep : scale / zoomStep;
    const crossesActualSize = (scale < 1 - scaleEpsilon && next > 1) || (scale > 1 + scaleEpsilon && next < 1);
    return clamp(crossesActualSize ? 1 : next, limits.min, limits.max);
}

/**
 * The scale factor of one wheel event. Scrolling up zooms in, scrolling down
 * zooms out; the factor is exponential, so equal gestures zoom by equal
 * ratios at every scale. `deltaMode` is the DOM `WheelEvent.deltaMode`.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
    const unit = deltaMode === 1 ? pixelsPerLine : deltaMode === 2 ? pixelsPerPage : 1;
    const delta = clamp(deltaY * unit, -maxWheelDelta, maxWheelDelta);
    return Math.exp(-delta * (ctrlKey ? pinchSensitivity : wheelSensitivity));
}

export function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The transform of a two-finger gesture: the scale follows the ratio of the
 * finger distances, and the content point that was under the starting
 * midpoint follows the current midpoint (so the gesture pans as well).
 */
export function pinchTransform(
    start: Transform,
    startPoints: readonly [Point, Point],
    currentPoints: readonly [Point, Point],
    content: Size,
    viewport: Size,
    limits: ScaleLimits
): Transform {
    const startDistance = Math.max(1, distance(startPoints[0], startPoints[1]));
    const currentDistance = distance(currentPoints[0], currentPoints[1]);
    const scale = clamp((start.scale * currentDistance) / startDistance, limits.min, limits.max);
    const startMid = midpoint(startPoints[0], startPoints[1]);
    const currentMid = midpoint(currentPoints[0], currentPoints[1]);
    const contentX = (startMid.x - start.x) / start.scale;
    const contentY = (startMid.y - start.y) / start.scale;
    return clampTransform({ scale, x: currentMid.x - contentX * scale, y: currentMid.y - contentY * scale }, content, viewport);
}

/**
 * The scale a double click moves to. From the fitted view it goes to the
 * actual size (or to twice the fit when the content already shows at its
 * natural size or larger); from any other view it returns to the fit.
 */
export function toggleScale(current: number, fit: number, limits: ScaleLimits): number {
    const atFit = Math.abs(current - fit) < 0.01;
    if (!atFit) {
        return clamp(fit, limits.min, limits.max);
    }
    return clamp(fit < 1 - scaleEpsilon ? 1 : fit * 2, limits.min, limits.max);
}

/**
 * The transform that places the content exactly over a rectangle of the
 * document (contain-fit, centered in the rectangle). The open and close
 * animations travel between this transform and the fitted one.
 */
export function transformFromRect(content: Size, rect: Rect): Transform {
    const scale = Math.min(rect.width / content.width, rect.height / content.height);
    return {
        scale,
        x: rect.left + (rect.width - content.width * scale) / 2,
        y: rect.top + (rect.height - content.height * scale) / 2,
    };
}

/** Whether any part of the rectangle lies inside the viewport. */
export function isRectVisible(rect: Rect, viewport: Size): boolean {
    return rect.width > 0 && rect.height > 0 && rect.left < viewport.width && rect.top < viewport.height && rect.left + rect.width > 0 && rect.top + rect.height > 0;
}
