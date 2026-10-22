/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    centeredTransform,
    clamp,
    clampTransform,
    fitScale,
    isRectVisible,
    panBy,
    pinchTransform,
    stepScale,
    toggleScale,
    transformFromRect,
    wheelZoomFactor,
    zoomAt,
    zoomStep,
    type Margin,
    type ScaleLimits,
    type Size,
    type Transform,
} from '../src/preview/viewer-geometry.mts';

const viewport: Size = { width: 1000, height: 800 };
const margin: Margin = { horizontal: 40, vertical: 60 };
const limits: ScaleLimits = { min: 0.5, max: 8 };

/** The content point drawn under a viewport point. */
function contentPointAt(transform: Transform, x: number, y: number): { x: number; y: number } {
    return { x: (x - transform.x) / transform.scale, y: (y - transform.y) / transform.scale };
}

function assertClose(actual: number, expected: number, message?: string): void {
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? 'value'}: expected ${expected}, got ${actual}`);
}

test('clamp keeps a value inside the range', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(11, 0, 10), 10);
});

test('fitScale fits the content inside the margins and honors the maximum', () => {
    assert.equal(fitScale({ width: 1920, height: 1080 }, viewport, margin, 1), (1000 - 80) / 1920);
    assert.equal(fitScale({ width: 400, height: 1000 }, viewport, margin, 1), (800 - 120) / 1000);
    assert.equal(fitScale({ width: 200, height: 100 }, viewport, margin, 1), 1, 'raster content is never enlarged');
    assert.equal(fitScale({ width: 200, height: 100 }, viewport, margin, 4), 4, 'vector content may enlarge up to its maximum');
});

test('fitScale falls back to the natural size for unusable content sizes', () => {
    assert.equal(fitScale({ width: 0, height: 100 }, viewport, margin, 1), 1);
    assert.equal(fitScale({ width: Number.NaN, height: 100 }, viewport, margin, 1), 1);
});

test('fitScale survives a viewport smaller than its margins', () => {
    const scale = fitScale({ width: 500, height: 500 }, { width: 50, height: 50 }, margin, 1);
    assert.ok(scale > 0 && Number.isFinite(scale));
});

test('centeredTransform centers the scaled content', () => {
    const transform = centeredTransform({ width: 400, height: 200 }, viewport, 2);
    assert.deepEqual(transform, { scale: 2, x: 100, y: 200 });
});

test('clampTransform centers an axis that fits and pins an axis that overflows', () => {
    const content = { width: 400, height: 2000 };
    const result = clampTransform({ scale: 1, x: -300, y: 500 }, content, viewport);
    assert.equal(result.x, 300, 'the narrow axis stays centered');
    assert.equal(result.y, 0, 'the tall axis cannot leave a gap before its top edge');
    assert.equal(clampTransform({ scale: 1, x: 0, y: -5000 }, content, viewport).y, 800 - 2000, 'nor after its bottom edge');
});

test('panBy moves within the limits', () => {
    const content = { width: 3000, height: 3000 };
    const start = { scale: 1, x: -100, y: -100 };
    assert.deepEqual(panBy(start, 30, -20, content, viewport), { scale: 1, x: -70, y: -120 });
    assert.equal(panBy(start, 500, 0, content, viewport).x, 0);
});

test('zoomAt keeps the content point under the anchor in place', () => {
    const content = { width: 3000, height: 3000 };
    const start = { scale: 1, x: -400, y: -300 };
    const anchor = { x: 250, y: 400 };
    const before = contentPointAt(start, anchor.x, anchor.y);
    const result = zoomAt(start, 2.5, anchor, content, viewport, limits);
    const after = contentPointAt(result, anchor.x, anchor.y);
    assertClose(result.scale, 2.5, 'scale');
    assertClose(after.x, before.x, 'content x');
    assertClose(after.y, before.y, 'content y');
});

test('zoomAt clamps the scale to the limits', () => {
    const content = { width: 400, height: 300 };
    const start = centeredTransform(content, viewport, 1);
    assert.equal(zoomAt(start, 100, { x: 500, y: 400 }, content, viewport, limits).scale, 8);
    assert.equal(zoomAt(start, 0.01, { x: 500, y: 400 }, content, viewport, limits).scale, 0.5);
});

test('zoomAt keeps small content centered while it still fits', () => {
    const content = { width: 400, height: 300 };
    const start = centeredTransform(content, viewport, 1);
    const result = zoomAt(start, 1.5, { x: 10, y: 10 }, content, viewport, limits);
    assert.deepEqual({ x: result.x, y: result.y }, { x: (1000 - 600) / 2, y: (800 - 450) / 2 });
});

test('stepScale multiplies by the zoom step and stops at the actual size', () => {
    assertClose(stepScale(1, 1, limits), zoomStep, 'zoom in from 100%');
    assertClose(stepScale(1, -1, limits), 1 / zoomStep, 'zoom out from 100%');
    assert.equal(stepScale(0.9, 1, limits), 1, 'zooming in from below stops at 100%');
    assert.equal(stepScale(1.1, -1, limits), 1, 'zooming out from above stops at 100%');
});

test('stepScale respects the limits', () => {
    assert.equal(stepScale(8, 1, limits), 8);
    assert.equal(stepScale(0.5, -1, limits), 0.5);
});

test('wheelZoomFactor zooms in for negative deltas and out for positive ones', () => {
    assert.ok(wheelZoomFactor(-100, 0, false) > 1);
    assert.ok(wheelZoomFactor(100, 0, false) < 1);
    assert.equal(wheelZoomFactor(0, 0, false), 1);
});

test('wheelZoomFactor is exponential: opposite gestures cancel out', () => {
    assertClose(wheelZoomFactor(-60, 0, false) * wheelZoomFactor(60, 0, false), 1);
});

test('wheelZoomFactor caps a single event and converts line and page units', () => {
    assert.equal(wheelZoomFactor(-100000, 0, false), wheelZoomFactor(-120, 0, false));
    assert.equal(wheelZoomFactor(-3, 1, false), wheelZoomFactor(-48, 0, false));
    assert.equal(wheelZoomFactor(-1, 2, false), wheelZoomFactor(-100, 0, false));
});

test('wheelZoomFactor zooms faster for a trackpad pinch (ctrl wheel)', () => {
    assert.ok(wheelZoomFactor(-5, 0, true) > wheelZoomFactor(-5, 0, false));
});

test('pinchTransform scales with the finger distance and keeps the pinch point', () => {
    const content = { width: 3000, height: 3000 };
    const start = { scale: 1, x: -200, y: -200 };
    const startPoints = [
        { x: 400, y: 400 },
        { x: 600, y: 400 },
    ] as const;
    const currentPoints = [
        { x: 300, y: 400 },
        { x: 700, y: 400 },
    ] as const;
    const result = pinchTransform(start, startPoints, currentPoints, content, viewport, limits);
    assertClose(result.scale, 2, 'scale doubles with the distance');
    const anchorBefore = contentPointAt(start, 500, 400);
    const anchorAfter = contentPointAt(result, 500, 400);
    assertClose(anchorAfter.x, anchorBefore.x, 'the midpoint content stays under the midpoint');
    assertClose(anchorAfter.y, anchorBefore.y);
});

test('pinchTransform pans when both fingers move together', () => {
    const content = { width: 3000, height: 3000 };
    const start = { scale: 1, x: -200, y: -200 };
    const startPoints = [
        { x: 400, y: 400 },
        { x: 600, y: 400 },
    ] as const;
    const currentPoints = [
        { x: 450, y: 430 },
        { x: 650, y: 430 },
    ] as const;
    const result = pinchTransform(start, startPoints, currentPoints, content, viewport, limits);
    assertClose(result.scale, 1);
    assertClose(result.x, -150);
    assertClose(result.y, -170);
});

test('pinchTransform clamps the scale and ignores coincident starting fingers', () => {
    const content = { width: 3000, height: 3000 };
    const start = { scale: 1, x: 0, y: 0 };
    const same = { x: 500, y: 400 };
    const spread = [
        { x: 0, y: 400 },
        { x: 1000, y: 400 },
    ] as const;
    const result = pinchTransform(start, [same, same], spread, content, viewport, limits);
    assert.equal(result.scale, 8);
    assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
});

test('toggleScale goes from the fit to the actual size and back', () => {
    assert.equal(toggleScale(0.4, 0.4, limits), 1, 'from the fit of a large image to 100%');
    assert.equal(toggleScale(1, 0.4, limits), 0.5, 'from any other scale back to the fit (clamped to the minimum)');
});

test('toggleScale doubles the fit when the content already shows at its natural size', () => {
    assert.equal(toggleScale(1, 1, { min: 1, max: 8 }), 2);
    assert.equal(toggleScale(3, 1, { min: 1, max: 8 }), 1);
});

test('transformFromRect places the content over a rectangle with a contain fit', () => {
    const transform = transformFromRect({ width: 1000, height: 500 }, { left: 100, top: 50, width: 200, height: 200 });
    assertClose(transform.scale, 0.2);
    assertClose(transform.x, 100);
    assertClose(transform.y, 50 + (200 - 100) / 2);
});

test('isRectVisible reports whether a rectangle touches the viewport', () => {
    assert.equal(isRectVisible({ left: 10, top: 10, width: 50, height: 50 }, viewport), true);
    assert.equal(isRectVisible({ left: -100, top: 10, width: 50, height: 50 }, viewport), false);
    assert.equal(isRectVisible({ left: 10, top: 900, width: 50, height: 50 }, viewport), false);
    assert.equal(isRectVisible({ left: -20, top: 10, width: 50, height: 50 }, viewport), true, 'partially visible counts');
    assert.equal(isRectVisible({ left: 10, top: 10, width: 0, height: 50 }, viewport), false, 'a collapsed rectangle never counts');
});
