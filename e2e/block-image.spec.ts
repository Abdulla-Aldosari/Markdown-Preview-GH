/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { blockCases, copyThrough, pageToken, pngEntriesAt, readClipboardImage, readClipboardPng, waitForTaggedPreview, type ClipboardImage } from './block-image-helpers.mts';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(300000);

test('each block offers its own entry and copies a real image without rebuilding the preview', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md');
    try {
        const frame = await openMarkdownPreview(page);
        await waitForTaggedPreview(frame);
        const token = await pageToken(frame);

        // The entry follows the kind under the pointer, and nothing else offers one.
        for (const item of blockCases) {
            expect(await pngEntriesAt(page, frame, item.selector), item.name).toEqual([item.title]);
        }
        expect(await pngEntriesAt(page, frame, 'h2 + p'), 'a paragraph').toEqual([]);
        expect(await pngEntriesAt(page, frame, '.markdown-alert'), 'an alert').toEqual([]);
        expect(await pngEntriesAt(page, frame, 'h1'), 'a top heading offers the section entry').toEqual(['Copy This Section As PNG']);

        // A click copies a real image that holds content.
        const images: Record<string, ClipboardImage> = {};
        for (const item of blockCases) {
            await app.evaluate(({ clipboard }) => clipboard.clear());
            await copyThrough(page, frame, item.selector, item.title);
            expect(await frame.locator('.mpgh-block-toast').textContent(), item.name).toMatch(/^Copied the .* as an image\.$/);
            images[item.name] = await readClipboardImage(app);
            expect(images[item.name].width, `${item.name} width`).toBeGreaterThan(0);
            expect(images[item.name].inkShare, `${item.name} must hold content, not a blank image`).toBeGreaterThan(0.01);
            await frame.evaluate(() => document.querySelector('.mpgh-block-toast')?.remove());
        }
        expect(images.section.height, 'a section is taller than its table').toBeGreaterThan(images.table.height);

        // The same page lived through every copy: nothing was rebuilt.
        expect(await pageToken(frame)).toBe(token);
    } finally {
        await app.close();
    }
});

test('a right click and a copy never open the zoom viewer, and a viewer that is open is closed first', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md');
    try {
        const frame = await openMarkdownPreview(page);
        await waitForTaggedPreview(frame);
        await frame.evaluate(() => {
            (window as unknown as { __viewerSeen: boolean }).__viewerSeen = false;
            new MutationObserver(() => {
                if (document.querySelector('.mpgh-viewer')) {
                    (window as unknown as { __viewerSeen: boolean }).__viewerSeen = true;
                }
            }).observe(document.body, { childList: true });
        });
        for (const item of blockCases) {
            await copyThrough(page, frame, item.selector, item.title);
        }
        expect(await frame.evaluate(() => (window as unknown as { __viewerSeen: boolean }).__viewerSeen), 'no copy may open the viewer').toBe(false);

        // A viewer that a stray click opened is closed before the next right click.
        await frame.locator('.mpgh-mermaid svg').first().click();
        await frame.locator('.mpgh-viewer.is-open').waitFor({ state: 'attached', timeout: 5000 });
        expect(await pngEntriesAt(page, frame, 'table >> nth=0')).toEqual(['Copy This Table As PNG']);
        expect(await frame.locator('.mpgh-viewer').count(), 'the viewer must be closed').toBe(0);
    } finally {
        await app.close();
    }
});

test('a block far below the visible part copies without moving the preview', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md');
    try {
        const frame = await openMarkdownPreview(page);
        await waitForTaggedPreview(frame);
        await app.evaluate(({ clipboard }) => clipboard.clear());
        const far = 'table >> nth=1';
        await frame.locator(far).scrollIntoViewIfNeeded();
        const before = await frame.evaluate(() => Math.round(document.scrollingElement?.scrollTop ?? 0));
        expect(before, 'the block must really be far down').toBeGreaterThan(1000);
        await copyThrough(page, frame, far, 'Copy This Table As PNG');
        expect(await frame.evaluate(() => Math.round(document.scrollingElement?.scrollTop ?? 0))).toBe(before);
        const image = await readClipboardImage(app);
        expect(image.width).toBeGreaterThan(0);
        expect(image.inkShare).toBeGreaterThan(0.01);
    } finally {
        await app.close();
    }
});

test('a picture inside a section is part of the copied image', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md');
    try {
        const frame = await openMarkdownPreview(page);
        await waitForTaggedPreview(frame);
        await frame.waitForFunction(() => {
            const image = document.querySelector<HTMLImageElement>('.mpgh-content img');
            return image !== null && image.complete && image.naturalWidth > 0;
        });
        await app.evaluate(({ clipboard }) => clipboard.clear());
        await copyThrough(page, frame, 'h2:has-text("Picture Section")', 'Copy This Section As PNG');
        expect(await frame.locator('.mpgh-block-toast').textContent()).toBe('Copied the section as an image.');
        // The picture is shown scaled to the column, so its displayed size is the reference.
        const shown = await frame.evaluate(() => {
            const image = document.querySelector<HTMLImageElement>('.mpgh-content img')!;
            const heading = Array.from(document.querySelectorAll('h2')).find((item) => item.textContent?.includes('Picture Section'))!;
            return { pictureHeight: image.getBoundingClientRect().height, headingHeight: heading.getBoundingClientRect().height };
        });
        const png = await readClipboardPng(app);
        if (png) {
            fs.mkdirSync(path.join(process.cwd(), 'test-results'), { recursive: true });
            fs.writeFileSync(path.join(process.cwd(), 'test-results', 'block-image-picture-section.png'), png);
        }
        const image = await readClipboardImage(app);
        // The image is drawn at twice the density and holds the heading, the whole picture, and the padding.
        expect(shown.pictureHeight, 'the picture must be displayed at a measurable size').toBeGreaterThan(100);
        expect(image.height, 'the section holds the heading and the whole picture').toBeGreaterThanOrEqual(Math.floor((shown.headingHeight + shown.pictureHeight) * 2));
        expect(image.inkShare, 'the picture fills a large part of the image').toBeGreaterThan(0.3);
    } finally {
        await app.close();
    }
});
