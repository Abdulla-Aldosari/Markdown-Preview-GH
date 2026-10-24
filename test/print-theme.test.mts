/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectBrowser } from '../src/headless/browser-process.mts';
import { openHeadlessPage } from '../src/headless/headless-export.mts';
import { buildStandaloneHtml } from '../src/export-html.mts';
import { isolateTempDir } from './isolated-temp.mts';

isolateTempDir();

/**
 * The PDF promises a light page whatever the preview theme. The page the PDF
 * engine prints is a dark page, so with the browser's print media emulated the
 * computed colors of the body must be the light theme's.
 */

const lookup = detectBrowser(undefined);
const browserPath = lookup.kind === 'found' ? lookup.path : '';
const skip = browserPath ? false : 'no Chromium-based browser is installed';

const css = `
:root[data-theme-mode="light"] { --bgColor-default: #ffffff; --fgColor-default: #1f2328; }
:root[data-theme-mode="dark"] { --bgColor-default: #0d1117; --fgColor-default: #f0f6fc; }
body { background-color: var(--bgColor-default); color: var(--fgColor-default); }
`;

async function colorsOf(theme: 'light' | 'dark', media: 'print' | 'screen'): Promise<{ background: string; color: string }> {
    const html = buildStandaloneHtml({ title: 't', bodyHtml: '<p>text</p>', css, theme });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-theme-'));
    const file = path.join(directory, 'page.html');
    fs.writeFileSync(file, html);
    const page = await openHeadlessPage({ executablePath: browserPath, url: pathToFileURL(file).href, waitForMarker: false });
    try {
        await page.send('Emulation.setEmulatedMedia', { media });
        const { result } = await page.send<{ result: { value: string } }>('Runtime.evaluate', {
            expression: `JSON.stringify({ background: getComputedStyle(document.body).backgroundColor, color: getComputedStyle(document.body).color })`,
            returnByValue: true,
        });
        return JSON.parse(result.value) as { background: string; color: string };
    } finally {
        await page.dispose();
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

test('a light page is light on screen and in print', { skip }, async () => {
    const screen = await colorsOf('light', 'screen');
    const print = await colorsOf('light', 'print');
    assert.equal(screen.background, 'rgb(255, 255, 255)');
    assert.deepEqual(print, screen);
});

test('a dark page is dark on screen but fully light in print', { skip }, async () => {
    const screen = await colorsOf('dark', 'screen');
    const print = await colorsOf('dark', 'print');
    assert.equal(screen.background, 'rgb(13, 17, 23)', 'the visible page stays dark');
    assert.equal(print.background, 'rgb(255, 255, 255)', 'the printed page is light');
    assert.equal(print.color, 'rgb(31, 35, 40)');
});
