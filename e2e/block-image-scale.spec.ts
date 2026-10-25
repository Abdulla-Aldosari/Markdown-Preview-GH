/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { chromium, expect, test } from '@playwright/test';
import { copyThrough, readClipboardPng, tableLines } from './block-image-helpers.mts';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(180000);

/** The padding around a copied block, in css pixels. */
const cssPadding = 16;

/** The distances between consecutive lines, in css pixels. */
const gaps = (positions: number[], scale: number): number[] => positions.slice(1).map((value, index) => Math.round((value - positions[index]) / scale));

const near = (image: number[], page: number[]): boolean => image.length === page.length && image.every((value, index) => Math.abs(value - page[index]) <= 1);

/*
 * At a fractional device pixel ratio (a Windows display scale of 125%, or a
 * VS Code zoom level) the page draws every 1px border one device pixel wide,
 * which is less than one css pixel. The copied table must keep the exact row
 * and column sizes of the page: no cell may break onto a second line, and the
 * bottom border must stay inside the image.
 */
test('a table copied at a 125% display scale keeps the rows and columns of the page', async () => {
    const browser = await chromium.launch();
    const helper = await browser.newPage();
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image-scale.md', { extraArgs: ['--force-device-scale-factor=1.25'] });
    try {
        expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1.25);
        const frame = await openMarkdownPreview(page);
        await frame.waitForFunction(() => document.querySelector('table')?.hasAttribute('data-vscode-context'));
        const count = await frame.locator('table').count();
        expect(count).toBe(3);
        const problems: string[] = [];
        for (let index = 0; index < count; index++) {
            const table = frame.locator('table').nth(index);
            await table.scrollIntoViewIfNeeded();
            const onPage = await table.evaluate((element) => ({
                width: element.getBoundingClientRect().width,
                rows: Array.from(element.querySelectorAll('tr')).map((row) => Math.round(row.getBoundingClientRect().height)),
                cols: Array.from(element.querySelector('tr')?.children ?? []).map((cell) => Math.round(cell.getBoundingClientRect().width)),
            }));
            await app.evaluate(({ clipboard }) => clipboard.clear());
            await copyThrough(page, frame, `table >> nth=${index}`, 'Copy This Table As PNG');
            const png = await readClipboardPng(app);
            if (!png) {
                problems.push(`table ${index}: nothing reached the clipboard`);
                continue;
            }
            const lines = await tableLines(helper, png, Math.ceil(onPage.width) + cssPadding * 2, cssPadding);
            const rows = gaps(lines.rows, lines.scale);
            const cols = gaps(lines.cols, lines.scale);
            if (!near(rows, onPage.rows)) {
                problems.push(`table ${index}: rows page=${JSON.stringify(onPage.rows)} image=${JSON.stringify(rows)}`);
            }
            if (!near(cols, onPage.cols)) {
                problems.push(`table ${index}: columns page=${JSON.stringify(onPage.cols)} image=${JSON.stringify(cols)}`);
            }
        }
        expect(problems, problems.join('\n')).toEqual([]);
    } finally {
        await app.close();
        await browser.close();
    }
});
