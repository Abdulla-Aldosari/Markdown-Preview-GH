/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { chromium, expect, test } from '@playwright/test';
import { blockImageScales } from '../src/block-image-protocol.mts';
import { analyzePng, copyThrough, readClipboardPng } from './block-image-helpers.mts';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(300000);

/** The space the copy keeps around a block, in css pixels. */
const cssPadding = 16;

/** The width of the image, in image pixels, for a block of this css width at this scale. */
const imageWidth = (blockWidth: number, scale: number): number => Math.ceil((Math.ceil(blockWidth) + cssPadding * 2) * scale);

/** A readable difference: the image may be one pixel off per scale step from rounding. */
const roundingSlack = 3;

/*
 * The image is the block times the scale of the setting: 1 is the actual size
 * of the block (plus its padding), and every other scale multiplies it.
 */
test('the copied image is as wide as the block times the scale setting', async () => {
    const browser = await chromium.launch();
    const helper = await browser.newPage();
    try {
        const problems: string[] = [];
        for (const setting of [undefined, ...blockImageScales]) {
            const scale = setting ?? 1;
            const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md', {
                settings: setting === undefined ? {} : { 'markdown-preview-gh.blockImageScale': setting },
            });
            try {
                const frame = await openMarkdownPreview(page);
                await frame.waitForFunction(() => document.querySelector('table')?.hasAttribute('data-vscode-context'));
                const blockWidth = await frame.locator('table >> nth=0').evaluate((element) => element.getBoundingClientRect().width);
                await app.evaluate(({ clipboard }) => clipboard.clear());
                await copyThrough(page, frame, 'table >> nth=0', 'Copy This Table As PNG');
                const png = await readClipboardPng(app);
                if (!png) {
                    problems.push(`scale ${setting ?? 'default'}: nothing reached the clipboard`);
                    continue;
                }
                const image = await analyzePng(helper, png, 30);
                const expected = imageWidth(blockWidth, scale);
                if (Math.abs(image.width - expected) > roundingSlack) {
                    problems.push(`scale ${setting ?? 'default'}: image is ${image.width} px wide, expected ${expected}`);
                }
            } finally {
                await app.close();
            }
        }
        expect(problems, problems.join('\n')).toEqual([]);
    } finally {
        await browser.close();
    }
});

/*
 * A user who never wrote the setting hears once, after a copy, that images are
 * made at the actual size and where to change it. The notice does not come back.
 */
test('the scale notice shows once after a copy and never again', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md');
    try {
        const frame = await openMarkdownPreview(page);
        await frame.waitForFunction(() => document.querySelector('table')?.hasAttribute('data-vscode-context'));
        const notice = page.locator('.notification-toast', { hasText: 'Block Image Scale' });
        await copyThrough(page, frame, 'table >> nth=0', 'Copy This Table As PNG');
        await notice.first().waitFor({ state: 'visible', timeout: 15000 });
        expect(await notice.first().textContent()).toContain('actual size (scale 1)');
        expect(await notice.first().textContent()).toContain('zoom');
        expect(await notice.first().textContent()).toContain('Open Settings');
        await notice.first().locator('.codicon-notifications-clear, .codicon-close').first().click();
        await notice.first().waitFor({ state: 'hidden', timeout: 10000 });
        await copyThrough(page, frame, 'table >> nth=0', 'Copy This Table As PNG');
        await page.waitForTimeout(2500);
        expect(await notice.count(), 'the notice must not come back').toBe(0);
    } finally {
        await app.close();
    }
});

test('no scale notice for a user who set the scale, even to the default', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md', { settings: { 'markdown-preview-gh.blockImageScale': 1 } });
    try {
        const frame = await openMarkdownPreview(page);
        await frame.waitForFunction(() => document.querySelector('table')?.hasAttribute('data-vscode-context'));
        await copyThrough(page, frame, 'table >> nth=0', 'Copy This Table As PNG');
        await page.waitForTimeout(3000);
        expect(await page.locator('.notification-toast', { hasText: 'Block Image Scale' }).count()).toBe(0);
    } finally {
        await app.close();
    }
});
