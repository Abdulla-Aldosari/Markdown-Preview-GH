/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { copyThrough } from './block-image-helpers.mts';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(300000);

/** How many times each section is copied; the slow case came and went between runs. */
const rounds = 6;

/** The most a copy without remote pictures may take, from the request to the message, in milliseconds. */
const copyLimitMs = 400;

/*
 * A section without remote pictures must not wait. Turning the drawn image into
 * a clipboard blob used to wait for an idle moment of the page, which took one
 * second or several for a block (it showed for a section with emoji and a list,
 * and moved between sections from run to run).
 */
test('copying a section without pictures does not wait for an idle moment of the page', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image-speed.md');
    try {
        const frame = await openMarkdownPreview(page);
        await frame.waitForFunction(() => document.querySelector('h2')?.hasAttribute('data-vscode-context'));
        // The page stamps the request (the message the extension sends) and the message that answers it.
        await frame.evaluate(() => {
            const marks = window as unknown as { __copyTimes: number[]; __copyRequestedAt: number };
            marks.__copyTimes = [];
            window.addEventListener('message', (event) => {
                if ((event.data as { type?: string } | null)?.type === 'copyImage') {
                    marks.__copyRequestedAt = performance.now();
                }
            });
            new MutationObserver((records) => {
                for (const record of records) {
                    record.addedNodes.forEach((node) => {
                        if (node instanceof HTMLElement && node.classList.contains('mpgh-block-toast')) {
                            marks.__copyTimes.push(Math.round(performance.now() - marks.__copyRequestedAt));
                        }
                    });
                }
            }).observe(document.body, { childList: true });
        });
        const slow: string[] = [];
        for (let round = 0; round < rounds; round++) {
            for (const name of ['Emoji', 'Plain']) {
                await frame.evaluate(() => document.querySelector('.mpgh-block-toast')?.remove());
                await copyThrough(page, frame, `h2:has-text("${name}")`, 'Copy This Section As PNG');
                const times = await frame.evaluate(() => (window as unknown as { __copyTimes: number[] }).__copyTimes);
                const took = times[times.length - 1];
                if (!(took <= copyLimitMs)) {
                    slow.push(`round ${round} ${name}: ${took} ms`);
                }
            }
        }
        expect(slow, `every copy must finish within ${copyLimitMs} ms`).toEqual([]);
    } finally {
        await app.close();
    }
});
