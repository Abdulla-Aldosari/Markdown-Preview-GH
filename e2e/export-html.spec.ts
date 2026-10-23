/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchVscode } from './helpers.mts';

test.setTimeout(240000);

const fixturesDir = path.join(__dirname, 'fixtures');
const pngBytes = fs.readFileSync(path.join(fixturesDir, 'assets', 'sample.png'));

let workspaceRoot = '';
let outputDir = '';
let server: http.Server;
let browser: Browser;
let page: Page;

test.beforeAll(async () => {
    server = http.createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(pngBytes);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const remoteUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/remote.png`;

    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-export-html-ws-'));
    fs.cpSync(fixturesDir, workspaceRoot, { recursive: true });
    const imagesFile = path.join(workspaceRoot, 'export-images.md');
    fs.writeFileSync(
        imagesFile,
        fs.readFileSync(imagesFile, 'utf8').replaceAll('{{FIXTURES_DIR}}', workspaceRoot.replace(/\\/g, '/')).replaceAll('{{REMOTE_IMAGE_URL}}', remoteUrl),
        'utf8'
    );
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-export-html-out-'));

    browser = await chromium.launch();
    page = await browser.newPage();
});

test.afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
});

async function waitForFile(file: string): Promise<void> {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        if (fs.existsSync(file) && fs.statSync(file).size > 0) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`the export did not write ${file}`);
}

test('the Export As HTML commands write a pinned, self-contained page for each theme', async () => {
    const outputs = {
        imagesLight: path.join(outputDir, 'images-light.html'),
        imagesDark: path.join(outputDir, 'images-dark.html'),
        anchors: path.join(outputDir, 'anchors.html'),
    };
    const resource = (name: string): string => pathToFileURL(path.join(workspaceRoot, name)).href;
    const { app, page: vscodePage } = await launchVscode('Default Dark Modern', 'export-images.md', {
        workspaceDir: workspaceRoot,
        keybindings: [
            { key: 'ctrl+shift+f9', command: 'markdown-preview-gh.exportHtmlLight', args: { resource: resource('export-images.md'), target: outputs.imagesLight } },
            { key: 'ctrl+shift+f10', command: 'markdown-preview-gh.exportHtmlDark', args: { resource: resource('export-images.md'), target: outputs.imagesDark } },
            { key: 'ctrl+shift+f11', command: 'markdown-preview-gh.exportHtmlLight', args: { resource: resource('export-anchors.md'), target: outputs.anchors } },
        ],
    });
    try {
        await vscodePage.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 60000 });
        await vscodePage.locator('.monaco-editor .view-lines').first().click();
        for (const [key, file] of [
            ['Control+Shift+F9', outputs.imagesLight],
            ['Control+Shift+F10', outputs.imagesDark],
            ['Control+Shift+F11', outputs.anchors],
        ] as const) {
            await vscodePage.keyboard.press(key);
            try {
                await waitForFile(file);
            } catch (error) {
                await vscodePage.screenshot({ path: path.join(process.cwd(), 'test-results', 'export-html-debug.png') });
                throw error;
            }
        }
    } finally {
        await app.close();
    }

    await page.goto(pathToFileURL(outputs.imagesLight).href);
    expect(await page.locator('html').getAttribute('data-theme-mode')).toBe('light');
    const images = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img')).map((image) => ({ alt: image.alt, src: image.getAttribute('src') ?? '', width: image.naturalWidth }))
    );
    expect(images.length).toBe(10);
    for (const image of images) {
        if (image.alt === 'remote') {
            expect(image.src, image.alt).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/remote\.png$/);
        } else if (image.alt === 'missing') {
            expect(image.src, image.alt).not.toMatch(/^data:/);
            expect(image.width, image.alt).toBe(0);
        } else {
            expect(image.src, image.alt).toMatch(/^data:image\//);
            expect(image.width, image.alt).toBeGreaterThan(0);
        }
    }
    expect(await page.evaluate(() => document.querySelector('img[alt="srcset"]')?.getAttribute('srcset') ?? '')).toMatch(
        /^data:image\/png;base64,\S+ 1x, data:image\/png;base64,\S+ 2x$/
    );

    await page.goto(pathToFileURL(outputs.imagesDark).href);
    expect(await page.locator('html').getAttribute('data-theme-mode')).toBe('dark');
    expect(await page.locator('body').getAttribute('class')).toContain('vscode-dark');

    await page.goto(pathToFileURL(outputs.anchors).href);
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map((link) => link.href));
    expect(hrefs).toContain(`${pathToFileURL(path.join(workspaceRoot, 'export-images.md')).href}#part`);
    expect(hrefs).toContain('https://example.com/page');
    const anchorUrl = pathToFileURL(outputs.anchors).href;
    for (const hash of ['title', 'title-1']) {
        await page.locator(`a[href="#${hash}"]`).click();
        expect(page.url().split('#')[0]).toBe(anchorUrl);
        expect(new URL(page.url()).hash).toBe(`#${hash}`);
    }
});
