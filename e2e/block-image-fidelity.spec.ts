/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { chromium, expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { analyzePng, copyThrough, imagePadding, measuredScale, readClipboardPng } from './block-image-helpers.mts';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(300000);

interface Probe {
    name: string;
    selector: string;
    title: string;
}

const probes: Probe[] = [
    { name: 'tall table', selector: 'h2:has-text("Tall Table Section") + table', title: 'Copy This Table As PNG' },
    { name: 'wide table', selector: 'h2:has-text("Wide Table Section") + table', title: 'Copy This Table As PNG' },
    { name: 'code block', selector: 'h2:has-text("Code Section") + pre', title: 'Copy This Code Block As PNG' },
    { name: 'wide code block', selector: 'h2:has-text("Wide Code Section") + pre', title: 'Copy This Code Block As PNG' },
    { name: 'diagram', selector: '.mpgh-mermaid >> nth=0', title: 'Copy This Diagram As PNG' },
    { name: 'mixed section', selector: 'h2:has-text("Mixed Section")', title: 'Copy This Section As PNG' },
];

for (const direction of ['ltr', 'rtl'] as const) {
    test(`a copied block fills its own box, shows no scrollbar, and keeps the picture warning away (${direction})`, async () => {
        const browser = await chromium.launch();
        const helper = await browser.newPage();
        const { app, page } = await launchVscode('Default Dark Modern', 'block-image-fidelity.md', {
            settings: { 'markdown-preview-gh.contentDirection': direction, 'markdown-preview-gh.blockImageScale': measuredScale },
        });
        try {
            const frame = await openMarkdownPreview(page);
            await frame.waitForFunction(() => document.querySelector('table')?.hasAttribute('data-vscode-context') && document.querySelectorAll('.mpgh-mermaid svg').length >= 2);

            // Every problem of every block is collected first, so one run shows them all.
            const problems: string[] = [];
            for (const probe of probes) {
                await app.evaluate(({ clipboard }) => clipboard.clear());
                let message = '';
                try {
                    message = await copyThrough(page, frame, probe.selector, probe.title);
                } catch (error) {
                    problems.push(`${probe.name}: no confirmation appeared: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
                    continue;
                }
                const png = await readClipboardPng(app);
                if (!png) {
                    problems.push(`${probe.name}: nothing reached the clipboard, the message was "${message}"`);
                    continue;
                }
                fs.mkdirSync(path.join(process.cwd(), 'test-results', 'fidelity'), { recursive: true });
                fs.writeFileSync(path.join(process.cwd(), 'test-results', 'fidelity', `${direction}-${probe.name.replaceAll(' ', '-')}.png`), png);
                const image = await analyzePng(helper, png, 30);
                const label = `${probe.name} ${image.width}x${image.height}`;
                // The painted area starts and ends at the padding: nothing is cut on the left or the right.
                if (image.left < imagePadding - 4 || image.left > imagePadding + 4) {
                    problems.push(`${label}: painted from x=${image.left}, the padding is ${imagePadding}`);
                }
                if (image.right < image.width - imagePadding - 5 || image.right > image.width - imagePadding + 3) {
                    problems.push(`${label}: painted to x=${image.right}, the padding ends at ${image.width - imagePadding}`);
                }
                if (image.bottom > image.height - imagePadding + 3) {
                    problems.push(`${label}: painted to y=${image.bottom}, the padding ends at ${image.height - imagePadding}`);
                }
                // A scrollbar would paint neutral gray along the bottom or the right edge. The right edge
                // of a section is not checked: its task-list checkboxes are neutral gray too, and in a
                // right-to-left page they sit right there. A scrolling box inside a section is checked
                // through the blocks that are copied alone.
                if (image.neutralGray.bottom > 20) {
                    problems.push(`${label}: horizontal scrollbar (${image.neutralGray.bottom} gray pixels)`);
                }
                if (probe.title !== 'Copy This Section As PNG' && image.neutralGray.right > 20) {
                    problems.push(`${label}: vertical scrollbar (${image.neutralGray.right} gray pixels)`);
                }
                await frame.evaluate(() => document.querySelector('.mpgh-block-toast')?.remove());
            }
            expect(problems, `${direction}: problems found in the copied images`).toEqual([]);

            // A picture that cannot be fetched fails the whole copy, without the preview blocking anything.
            await app.evaluate(({ clipboard }) => clipboard.clear());
            await copyThrough(page, frame, 'h2:has-text("Remote Picture Section")', 'Copy This Section As PNG');
            expect(await frame.locator('.mpgh-block-toast').textContent()).toBe(
                'Could not copy the section as an image: 1 remote picture could not be fetched (mpgh-test.invalid).'
            );
            expect(await readClipboardPng(app), 'a failed copy leaves the clipboard untouched').toBeNull();
            await page.waitForTimeout(500);
            expect(await frame.locator('#code-csp-warning').count(), 'the preview must not report blocked content').toBe(0);
        } finally {
            await app.close();
            await browser.close();
        }
    });
}
