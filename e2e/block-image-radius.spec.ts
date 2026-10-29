/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { chromium, expect, test } from '@playwright/test';
import { copyThrough, measuredScale, measuredScaleSettings, readClipboardPng, sampleCorners, waitForTaggedPreview, type CornerSample } from './block-image-helpers.mts';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(300000);

/** The corner radius of the image, in image pixels, for a css radius at the measured scale. */
const radiusPx = (cssRadius: number): number => cssRadius * measuredScale;

/** Copies the first table of the preview at the given radius and reads the alpha of the image's corners. */
async function copyAndSample(radiusSetting: number | undefined): Promise<CornerSample> {
    const browser = await chromium.launch();
    const helper = await browser.newPage();
    const settings = radiusSetting === undefined ? measuredScaleSettings : { ...measuredScaleSettings, 'markdown-preview-gh.blockImageRadius': radiusSetting };
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md', { settings });
    try {
        const frame = await openMarkdownPreview(page);
        await waitForTaggedPreview(frame);
        await app.evaluate(({ clipboard }) => clipboard.clear());
        await copyThrough(page, frame, 'table >> nth=0', 'Copy This Table As PNG');
        const png = await readClipboardPng(app);
        expect(png, 'a copied image reached the clipboard').not.toBeNull();
        return await sampleCorners(helper, png!);
    } finally {
        await app.close();
        await browser.close();
    }
}

test('a copied block has rounded, transparent corners by default', async () => {
    const corners = await copyAndSample(undefined);
    expect(corners.topLeft, 'top-left corner is transparent').toBe(0);
    expect(corners.topRight, 'top-right corner is transparent').toBe(0);
    expect(corners.bottomLeft, 'bottom-left corner is transparent').toBe(0);
    expect(corners.bottomRight, 'bottom-right corner is transparent').toBe(0);
    expect(corners.topCenter, 'the top edge stays opaque').toBe(255);
    expect(corners.topLeftOpaqueFrom, 'the default radius rounds the corner').toBeGreaterThan(0);
    expect(corners.topLeftOpaqueFrom, 'the default radius stays inside the padding').toBeLessThan(radiusPx(16));
});

test('blockImageRadius 0 keeps square, opaque corners', async () => {
    const corners = await copyAndSample(0);
    expect(corners.topLeft, 'top-left corner is opaque').toBe(255);
    expect(corners.topRight, 'top-right corner is opaque').toBe(255);
    expect(corners.bottomLeft, 'bottom-left corner is opaque').toBe(255);
    expect(corners.bottomRight, 'bottom-right corner is opaque').toBe(255);
    expect(corners.topLeftOpaqueFrom, 'no rounding').toBe(0);
});

test('a chosen blockImageRadius is honored in the image', async () => {
    const corners = await copyAndSample(16);
    expect(corners.topLeft, 'top-left corner is transparent').toBe(0);
    expect(corners.topCenter, 'the top edge stays opaque').toBe(255);
    expect(corners.topLeftOpaqueFrom, 'radius 16 rounds more than the default 10').toBeGreaterThan(radiusPx(10));
});
