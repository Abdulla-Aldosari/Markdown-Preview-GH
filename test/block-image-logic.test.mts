/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockImageScales, blockKinds } from '../src/block-image-protocol.mts';
import {
    blockSelectors,
    canRetryWithCors,
    canvasLimits,
    clipsOverflow,
    describeBusy,
    describeFailure,
    describeFocusWait,
    describeProgress,
    describeSuccess,
    focusWaitMs,
    headingLevel,
    isTransparentColor,
    layoutZoom,
    pictureHost,
    planCapture,
    pngBlobFromDataUrl,
    progressMinMs,
    progressPercent,
    remainingProgressMs,
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

test('layoutZoom is the device pixel ratio of the page, fractional ones included', () => {
    assert.equal(layoutZoom(1), 1);
    assert.equal(layoutZoom(1.25), 1.25);
    assert.equal(layoutZoom(1.5), 1.5);
    assert.equal(layoutZoom(2), 2);
    assert.equal(layoutZoom(0.8333333), 0.8333333);
});

test('layoutZoom falls back to 1 for a ratio that cannot be used', () => {
    for (const ratio of [0, -1.25, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(layoutZoom(ratio), 1, String(ratio));
    }
});

test('planCapture makes the canvas at the requested scale when it fits', () => {
    const result = planCapture(800, 600, 2);
    assert.ok(result.ok);
    assert.deepEqual(result.plan, { scale: 2, canvasWidth: 1600, canvasHeight: 1200 });
    const actual = planCapture(800, 600, 1);
    assert.ok(actual.ok);
    assert.deepEqual(actual.plan, { scale: 1, canvasWidth: 800, canvasHeight: 600 });
});

test('planCapture honors every allowed scale, fractional ones included', () => {
    for (const scale of blockImageScales) {
        const result = planCapture(400, 200, scale);
        assert.ok(result.ok, String(scale));
        assert.equal(result.plan.scale, scale);
        assert.equal(result.plan.canvasWidth, Math.ceil(400 * scale));
        assert.equal(result.plan.canvasHeight, Math.ceil(200 * scale));
    }
});

test('planCapture rounds a fractional canvas up so the block is never cut', () => {
    const result = planCapture(100.2, 50.4, 2);
    assert.ok(result.ok);
    assert.deepEqual(result.plan, { scale: 2, canvasWidth: 201, canvasHeight: 101 });
});

test('planCapture steps down to the next smaller scale that fits', () => {
    const height = canvasLimits.maxSide - 100;
    const result = planCapture(400, height, 2);
    assert.ok(result.ok);
    assert.equal(result.plan.scale, 1);
    assert.equal(result.plan.canvasHeight, height);
    const stepped = planCapture(100, Math.floor(canvasLimits.maxSide / 2), 3);
    assert.ok(stepped.ok);
    assert.equal(stepped.plan.scale, 2, 'a block that does not fit at 3, 2.5 fits at 2 only');
});

test('planCapture never goes above the requested scale', () => {
    const result = planCapture(100, 100, 1.5);
    assert.ok(result.ok);
    assert.equal(result.plan.scale, 1.5);
});

test('planCapture keeps the requested scale at the exact side limit and refuses one pixel more at scale 1', () => {
    const atLimit = planCapture(100, canvasLimits.maxSide / 2, 2);
    assert.ok(atLimit.ok);
    assert.equal(atLimit.plan.scale, 2);
    assert.deepEqual(planCapture(100, canvasLimits.maxSide + 1, 2), { ok: false, reason: 'tooLarge' });
});

test('planCapture also limits the area of the canvas', () => {
    const limits = { maxSide: 20000, maxArea: 1_000_000 };
    const fitsAtNormal = planCapture(900, 1000, 2, limits);
    assert.ok(fitsAtNormal.ok);
    assert.equal(fitsAtNormal.plan.scale, 1);
    assert.deepEqual(planCapture(1100, 1000, 2, limits), { ok: false, reason: 'tooLarge' });
});

test('planCapture rejects empty and invalid sizes', () => {
    for (const [width, height] of [
        [0, 10],
        [10, 0],
        [-5, 10],
        [Number.NaN, 10],
        [10, Number.POSITIVE_INFINITY],
    ]) {
        assert.deepEqual(planCapture(width, height, 2), { ok: false, reason: 'empty' }, `${width}x${height}`);
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
    assert.match(describeFailure('code block', 'focus'), /^Could not copy the code block as an image: .*keep the preview in front/i);
    assert.equal(describeSuccess('diagram'), 'Copied the diagram as an image.');
});

test('a failed remote picture names how many and from which hosts', () => {
    assert.equal(
        describeFailure('section', 'picture', ['https://media.askvg.com/a/b.png']),
        'Could not copy the section as an image: 1 remote picture could not be fetched (media.askvg.com).'
    );
    assert.equal(
        describeFailure('section', 'picture', ['https://a.example/x.png', 'https://a.example/y.png', 'https://b.example/z.png']),
        'Could not copy the section as an image: 3 remote pictures could not be fetched (a.example, b.example).'
    );
});

test('a picture failure without addresses still has a message', () => {
    assert.equal(describeFailure('table', 'picture'), 'Could not copy the table as an image: a remote picture could not be fetched.');
});

test('pictureHost reads the host and keeps an unparsable address as it is', () => {
    assert.equal(pictureHost('https://raw.githubusercontent.com/a/b.png'), 'raw.githubusercontent.com');
    assert.equal(pictureHost('http://127.0.0.1:8080/x.png'), '127.0.0.1:8080');
    assert.equal(pictureHost('not an address'), 'not an address');
});

test('the progress text and percentage follow the finished fetches', () => {
    assert.equal(describeProgress(0, 3), 'Fetching remote pictures: 0 of 3');
    assert.equal(describeProgress(3, 3), 'Fetching remote pictures: 3 of 3');
    assert.equal(progressPercent(0, 4), 0);
    assert.equal(progressPercent(1, 3), 33);
    assert.equal(progressPercent(4, 4), 100);
});

test('the progress bar stays up until it reached its minimum time', () => {
    assert.equal(remainingProgressMs(1000, 1100), progressMinMs - 100);
    assert.equal(remainingProgressMs(1000, 1000), progressMinMs);
    assert.equal(remainingProgressMs(1000, 1000 + progressMinMs), 0);
    assert.equal(remainingProgressMs(1000, 9000), 0);
    assert.equal(remainingProgressMs(1000, 1250.4, 600), 350);
    assert.equal(remainingProgressMs(Number.NaN, 1000), 0);
});

test('pngBlobFromDataUrl turns a base64 PNG address into a blob and refuses anything else', async () => {
    const bytes = [137, 80, 78, 71, 13, 10, 26, 10];
    const blob = pngBlobFromDataUrl(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
    assert.ok(blob);
    assert.equal(blob.type, 'image/png');
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], bytes);
    assert.equal(pngBlobFromDataUrl('data:,'), null, 'an empty canvas address');
    assert.equal(pngBlobFromDataUrl('data:image/jpeg;base64,AAAA'), null, 'another type');
    assert.equal(pngBlobFromDataUrl('data:image/png;base64,***'), null, 'invalid base64');
});

test('progressPercent stays within 0 to 100 and survives unusable input', () => {
    assert.equal(progressPercent(9, 3), 100);
    assert.equal(progressPercent(-2, 3), 0);
    assert.equal(progressPercent(1, 0), 0);
    assert.equal(progressPercent(Number.NaN, 3), 0);
});

test('the working and focus messages name the block and tell the user what to do', () => {
    assert.equal(describeBusy('section'), 'Copying the section as an image. Keep the preview in front until it finishes.');
    assert.equal(describeFocusWait('table'), 'The table image is ready. Click the preview to finish copying.');
    assert.ok(focusWaitMs >= 10000, 'the copy waits long enough for the user to come back');
});
