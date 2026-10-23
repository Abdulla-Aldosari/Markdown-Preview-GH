/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import MarkdownIt from 'markdown-it';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildStandaloneHtml } from '../src/export-html.mts';
import { createGfmPlugin } from '../src/markdown-plugin.mts';
import { resolveDocumentUrls } from '../src/url-resolution.mts';

const fixturesDir = path.join(__dirname, 'fixtures');
const pngBytes = fs.readFileSync(path.join(fixturesDir, 'assets', 'sample.png'));

/**
 * The two ways the built-in engine rewrites an image path (VS Code 1.106 and
 * 1.142 share this logic): without a resource provider (`markdown.api.render`
 * on a cold cache) a path that starts with `/` is joined onto the workspace
 * folder; with one (the live preview) it becomes a webview-only URL.
 */
function toEngineLink(href: string, workspaceRoot: string, withResourceProvider: boolean): string {
    if (/^[a-z-]+:/i.test(href) || !href.startsWith('/')) {
        return href;
    }
    const root = workspaceRoot.replace(/\\/g, '/');
    const joined = `${root.startsWith('/') ? root : `/${root}`}${href}`;
    return withResourceProvider ? `https://file+.vscode-resource.vscode-cdn.net${joined}` : joined;
}

/**
 * Mimics the engine's image rule: the first render of a document writes `src`
 * and `data-src` into the cached token, and the `data-src` guard stops every
 * later render from recomputing `src`.
 */
function addCachedImageRule(md: MarkdownIt, workspaceRoot: string): void {
    const original = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, idx, options, env: { withResourceProvider: boolean }, self) => {
        const token = tokens[idx];
        const src = token.attrGet('src');
        if (src && !token.attrGet('data-src')) {
            token.attrSet('src', toEngineLink(src, workspaceRoot, env.withResourceProvider));
            token.attrSet('data-src', src);
        }
        return original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    };
}

/** Heading ids with the duplicate counter the built-in engine produces. */
function addHeadingIds(md: MarkdownIt): void {
    md.renderer.rules.heading_open = (tokens, idx, options, env: { headingCounts?: Map<string, number> }, self) => {
        const counts = (env.headingCounts ??= new Map<string, number>());
        const text = tokens[idx + 1].content;
        const base = text.trim().toLowerCase().replace(/\s+/g, '-');
        const seen = counts.get(base);
        counts.set(base, (seen ?? 0) + 1);
        tokens[idx].attrSet('id', seen === undefined ? base : `${base}-${seen}`);
        return self.renderToken(tokens, idx, options);
    };
}

/**
 * Renders a fixture the way the engine does, including its token cache: the
 * document is parsed once, `previewFirst` renders it for the live preview
 * (with a resource provider) before the export render reuses the same tokens.
 */
function renderFixture(name: string, workspaceRoot: string, previewFirst: boolean): string {
    const md = new MarkdownIt({ html: true }).use(createGfmPlugin(() => ({ direction: 'ltr', width: 'normal', themeMode: 'light' })));
    addHeadingIds(md);
    addCachedImageRule(md, workspaceRoot);
    const tokens = md.parse(fs.readFileSync(path.join(workspaceRoot, name), 'utf8'), {});
    if (previewFirst) {
        md.renderer.render(tokens, md.options, { withResourceProvider: true, headingCounts: new Map<string, number>() });
    }
    return md.renderer.render(tokens, md.options, { withResourceProvider: false, headingCounts: new Map<string, number>() });
}

/** Builds the exported page for a fixture and returns its file URL. */
function buildPage(workspaceRoot: string, name: string, previewFirst = false): string {
    const body = resolveDocumentUrls(renderFixture(name, workspaceRoot, previewFirst), {
        documentDirUrl: `${pathToFileURL(workspaceRoot).href}/`,
        workspaceFolderUrl: `${pathToFileURL(workspaceRoot).href}/`,
    });
    const html = buildStandaloneHtml({ title: name, bodyHtml: body, css: '' });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-export-page-'));
    const output = path.join(outputDir, `${name}.html`);
    fs.writeFileSync(output, html, 'utf8');
    return pathToFileURL(output).href;
}

let workspaceRoot = '';
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

    // The committed fixtures hold placeholders for machine-specific values;
    // a temp copy gets the real ones.
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-export-ws-'));
    fs.cpSync(fixturesDir, workspaceRoot, { recursive: true });
    const imagesFile = path.join(workspaceRoot, 'export-images.md');
    const source = fs.readFileSync(imagesFile, 'utf8').replaceAll('{{FIXTURES_DIR}}', workspaceRoot.replace(/\\/g, '/')).replaceAll('{{REMOTE_IMAGE_URL}}', remoteUrl);
    fs.writeFileSync(imagesFile, source, 'utf8');

    browser = await chromium.launch();
    page = await browser.newPage();
});

test.afterAll(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
});

// The engine caches the tokens of a document and writes the image `src` once,
// so the result depends on whether the live preview rendered it first.
for (const previewFirst of [false, true]) {
    test(`every local and remote image of the exported page loads, a missing one does not (${previewFirst ? 'preview rendered first' : 'cold cache'})`, async () => {
        await page.goto(buildPage(workspaceRoot, 'export-images.md', previewFirst));
        await page.waitForLoadState('load');
        const images = await page.evaluate(() => Array.from(document.querySelectorAll('img')).map((image) => ({ alt: image.alt, src: image.src, width: image.naturalWidth })));
        expect(images.length).toBe(10);
        for (const image of images) {
            expect(image.src, image.alt).not.toContain('vscode-resource');
            if (image.alt === 'missing') {
                expect(image.width, image.alt).toBe(0);
            } else {
                expect(image.width, image.alt).toBeGreaterThan(0);
            }
        }
    });
}

test('in-page anchors only change the hash and the page has no base element', async () => {
    const pageUrl = buildPage(workspaceRoot, 'export-anchors.md');
    await page.goto(pageUrl);
    expect(await page.locator('base').count()).toBe(0);
    for (const hash of ['title', 'title-1', 'عنوان-عربي']) {
        await page.locator(`a[href="#${encodeURIComponent(hash)}"]`).click();
        expect(page.url().split('#')[0]).toBe(pageUrl);
        expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${hash}`);
    }
    await page.locator('a[href="#"]').click();
    expect(page.url().split('#')[0]).toBe(pageUrl);
});

test('links to sibling documents and external pages point at the right targets', async () => {
    await page.goto(buildPage(workspaceRoot, 'export-anchors.md'));
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map((link) => link.getAttribute('href')));
    expect(hrefs).toContain(`${pathToFileURL(path.join(workspaceRoot, 'export-images.md')).href}#part`);
    expect(hrefs).toContain('https://example.com/page');
});

test('a document without images exports without rewriting side effects', async () => {
    await page.goto(buildPage(workspaceRoot, 'export-no-images.md'));
    expect(await page.locator('img').count()).toBe(0);
    await page.locator('a[href="#table"]').click();
    expect(new URL(page.url()).hash).toBe('#table');
});
