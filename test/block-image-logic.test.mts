/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockKinds } from '../src/block-image-protocol.mts';
import {
    blockSelectors,
    canRetryWithCors,
    canvasLimits,
    clipsOverflow,
    describeFailure,
    describeSuccess,
    headingLevel,
    isTransparentColor,
    planCapture,
    sectionLength,
} from '../src/preview/block-image-logic.mts';

test('every block kind has a selector', () => {
    assert.deepEqual(Object.keys(blockSelectors).sort(), [...blockKinds].sort());
});

test('the code selector leaves diagram placeholders to the diagram kind', () => {
    assert.match(blockSelectors.code, /:not\(\.mpgh-mermaid\)/);
    assert.equal(blockSelectors.diagram, '.mpgh-mermaid');
});

test('headingLevel reads h1 to h6 in any case and rejects other tags', () => {
    assert.equal(headingLevel('H1'), 1);
    assert.equal(headingLevel('h6'), 6);
    for (const tag of ['H7', 'H0', 'P', 'HR', 'HEADER', 'H12', '']) {
        assert.equal(headingLevel(tag), null, tag);
    }
});

test('a section runs up to the next heading of the same or a higher rank', () => {
    const tags = ['H2', 'P', 'TABLE', 'H3', 'PRE', 'H2', 'P'];
    assert.equal(sectionLength(tags, 0), 5);
    assert.equal(sectionLength(tags, 3), 2);
    assert.equal(sectionLength(tags, 5), 2);
});

test('a section stops at a higher-rank heading and runs to the end when none follows', () => {
    assert.equal(sectionLength(['H3', 'P', 'H1', 'P'], 0), 2);
    assert.equal(sectionLength(['H1', 'P', 'H3', 'P', 'H2'], 0), 5);
    assert.equal(sectionLength(['H2'], 0), 1);
});

test('sectionLength is 0 when the start is not a heading or is out of range', () => {
    assert.equal(sectionLength(['P', 'H2'], 0), 0);
    assert.equal(sectionLength(['H2'], 1), 0);
    assert.equal(sectionLength(['H2'], -1), 0);
    assert.equal(sectionLength([], 0), 0);
});

test('planCapture takes the sharpest density that fits', () => {
    const result = planCapture(800, 600);
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    assert.deepEqual(result.plan, { scale: 2, canvasWidth: 1600, canvasHeight: 1200 });
});

test('planCapture rounds a fractional canvas up so the block is never cut', () => {
    const result = planCapture(100.2, 50.4);
    assert.ok(result.ok);
    assert.deepEqual(result.plan, { scale: 2, canvasWidth: 201, canvasHeight: 101 });
});

test('planCapture falls back to the normal density when double does not fit', () => {
    const height = canvasLimits.maxSide - 100;
    const result = planCapture(400, height);
    assert.ok(result.ok);
    assert.equal(result.plan.scale, 1);
    assert.equal(result.plan.canvasHeight, height);
});

test('planCapture keeps double density at the exact side limit and refuses one pixel more at normal density', () => {
    const atLimit = planCapture(100, canvasLimits.maxSide / 2);
    assert.ok(atLimit.ok);
    assert.equal(atLimit.plan.scale, 2);
    assert.deepEqual(planCapture(100, canvasLimits.maxSide + 1), { ok: false, reason: 'tooLarge' });
});

test('planCapture also limits the area of the canvas', () => {
    const limits = { maxSide: 20000, maxArea: 1_000_000 };
    const fitsAtNormal = planCapture(900, 1000, limits);
    assert.ok(fitsAtNormal.ok);
    assert.equal(fitsAtNormal.plan.scale, 1);
    assert.deepEqual(planCapture(1100, 1000, limits), { ok: false, reason: 'tooLarge' });
});

test('planCapture rejects empty and invalid sizes', () => {
    for (const [width, height] of [
        [0, 10],
        [10, 0],
        [-5, 10],
        [Number.NaN, 10],
        [10, Number.POSITIVE_INFINITY],
    ]) {
        assert.deepEqual(planCapture(width, height), { ok: false, reason: 'empty' }, `${width}x${height}`);
    }
});

test('clipsOverflow is true for every scrolling overflow value on either axis', () => {
    for (const [x, y] of [
        ['auto', 'auto'],
        ['scroll', 'visible'],
        ['visible', 'auto'],
        ['hidden', 'scroll'],
        ['auto', 'hidden'],
    ]) {
        assert.equal(clipsOverflow(x, y), true, `${x} ${y}`);
    }
});

test('clipsOverflow is false when nothing scrolls', () => {
    for (const [x, y] of [
        ['visible', 'visible'],
        ['hidden', 'hidden'],
        ['clip', 'clip'],
        ['hidden', 'visible'],
        ['', ''],
    ]) {
        assert.equal(clipsOverflow(x, y), false, `${x} ${y}`);
    }
});

test('a picture is retried with CORS only when it loaded and its pixels are locked', () => {
    assert.equal(canRetryWithCors(true, false), true, 'loaded but tainted');
    assert.equal(canRetryWithCors(true, true), false, 'already readable');
    assert.equal(canRetryWithCors(false, false), false, 'never loaded: no second request');
    assert.equal(canRetryWithCors(false, true), false);
});

test('isTransparentColor recognizes every way a computed color paints nothing', () => {
    for (const color of ['transparent', 'TRANSPARENT', '', '  ', 'rgba(0, 0, 0, 0)', 'rgba(13,17,23,0)', 'rgba(0 0 0 / 0)', 'rgba(0, 0, 0, 0%)', 'rgba(1, 2, 3, 0.0)']) {
        assert.equal(isTransparentColor(color), true, JSON.stringify(color));
    }
});

test('isTransparentColor keeps every color that paints something', () => {
    for (const color of ['rgb(13, 17, 23)', 'rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 1)', 'rgba(0 0 0 / 50%)', '#fff', 'red', 'rgb(0, 0, 0)', 'color(srgb 1 1 1)']) {
        assert.equal(isTransparentColor(color), false, color);
    }
});

test('the messages name the block and the cause', () => {
    assert.equal(describeFailure('table', 'tooLarge'), 'Could not copy the table as an image: it is too large to copy as one image.');
    assert.match(describeFailure('code block', 'focus'), /^Could not copy the code block as an image: .*click the preview/i);
    assert.equal(describeSuccess('diagram', 0), 'Copied the diagram as an image.');
    assert.equal(describeSuccess('section', 1), 'Copied the section as an image, without 1 picture that could not be read.');
    assert.equal(describeSuccess('section', 3), 'Copied the section as an image, without 3 pictures that could not be read.');
});
