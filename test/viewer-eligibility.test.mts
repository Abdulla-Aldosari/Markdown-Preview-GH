/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canOpenViewer, isVectorImageSource, isZoomableSubject, minDisplaySize, type ViewerClick } from '../src/preview/viewer-eligibility.mts';

const base: ViewerClick = {
    natural: { width: 1200, height: 800 },
    display: { width: 600, height: 400 },
    insideLink: false,
    button: 0,
    defaultPrevented: false,
    hasModifier: false,
    hasSelection: false,
};

test('a plain primary click on a regular image opens the viewer', () => {
    assert.equal(canOpenViewer(base), true);
});

test('an image inside a link keeps the behavior of the link', () => {
    assert.equal(canOpenViewer({ ...base, insideLink: true }), false);
    assert.equal(isZoomableSubject({ ...base, insideLink: true }), false);
});

test('only the primary button opens the viewer', () => {
    assert.equal(canOpenViewer({ ...base, button: 1 }), false);
    assert.equal(canOpenViewer({ ...base, button: 2 }), false);
});

test('a handled click, a modified click, and a text selection never open it', () => {
    assert.equal(canOpenViewer({ ...base, defaultPrevented: true }), false);
    assert.equal(canOpenViewer({ ...base, hasModifier: true }), false);
    assert.equal(canOpenViewer({ ...base, hasSelection: true }), false);
});

test('content without a known natural size is ignored (still loading, or broken)', () => {
    assert.equal(canOpenViewer({ ...base, natural: { width: 0, height: 0 } }), false);
    assert.equal(canOpenViewer({ ...base, natural: { width: 100, height: 0 } }), false);
    assert.equal(canOpenViewer({ ...base, natural: { width: Number.NaN, height: 10 } }), false);
});

test('icon-sized content is not worth zooming, but one large side is enough', () => {
    const small = minDisplaySize - 1;
    assert.equal(canOpenViewer({ ...base, display: { width: small, height: small } }), false);
    assert.equal(canOpenViewer({ ...base, display: { width: minDisplaySize, height: small } }), true);
    assert.equal(canOpenViewer({ ...base, display: { width: small, height: minDisplaySize } }), true);
    assert.equal(canOpenViewer({ ...base, display: { width: 600, height: 6 } }), true, 'a thin banner stays zoomable');
});

test('isVectorImageSource recognizes SVG files and data URLs', () => {
    assert.equal(isVectorImageSource('https://example.com/logo.svg'), true);
    assert.equal(isVectorImageSource('https://example.com/logo.SVG?v=2'), true);
    assert.equal(isVectorImageSource('https://example.com/logo.svg#view'), true);
    assert.equal(isVectorImageSource('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), true);
    assert.equal(isVectorImageSource('data:image/svg+xml,%3Csvg%3E'), true);
});

test('isVectorImageSource rejects raster sources', () => {
    assert.equal(isVectorImageSource('https://example.com/photo.png'), false);
    assert.equal(isVectorImageSource('https://example.com/svg/photo.png'), false);
    assert.equal(isVectorImageSource('https://example.com/photo.png?name=a.svg.png'), false);
    assert.equal(isVectorImageSource('data:image/png;base64,AAAA'), false);
    assert.equal(isVectorImageSource(''), false);
});
