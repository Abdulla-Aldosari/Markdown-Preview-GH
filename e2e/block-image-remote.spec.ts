/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Frame } from 'playwright';
import { copyThrough, readClipboardPng } from './block-image-helpers.mts';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(180000);

/** How long the picture server holds back a CORS request, so the progress bar can be seen. */
const corsDelayMs = 1500;

interface PictureServer {
    origin: string;
    close: () => Promise<void>;
}

/**
 * Serves one picture. A plain request is answered at once. A CORS request (it
 * carries an `Origin`) is answered after a delay, with the CORS header only
 * when `allowCors` is set, like a real host that does or does not allow it.
 */
async function startPictureServer(allowCors: boolean): Promise<PictureServer> {
    const bytes = fs.readFileSync(path.resolve(process.cwd(), 'e2e/fixtures/viewer-image.png'));
    const server = https.createServer(
        {
            key: fs.readFileSync(path.resolve(process.cwd(), `e2e/fixtures/tls/localhost-key.pem`)),
            cert: fs.readFileSync(path.resolve(process.cwd(), `e2e/fixtures/tls/localhost-cert.pem`)),
        },
        (request, response) => {
            const send = (): void => {
                const headers: Record<string, string> = { 'Content-Type': 'image/png' };
                if (allowCors && request.headers.origin) {
                    headers['Access-Control-Allow-Origin'] = '*';
                }
                response.writeHead(200, headers);
                response.end(bytes);
            };
            if (request.headers.origin) {
                setTimeout(send, corsDelayMs);
            } else {
                send();
            }
        }
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return { origin: `https://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

/** A workspace holding one document with a remote picture under a heading. */
function writeWorkspace(pictureUrl: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-remote-'));
    fs.writeFileSync(path.join(directory, 'remote.md'), `## Remote Picture Section\n\n![A remote picture](${pictureUrl})\n\n\`\`\`mermaid\nflowchart LR\n    A --> B\n\`\`\`\n`);
    return directory;
}

/** What the preview showed during a copy: when each message came and went, and how the toast looked. */
interface CopyReport {
    toast: string;
    progress: string | null;
    progressGone: boolean;
    progressRemovedAt: number | null;
    progressAddedAt: number | null;
    toastAddedAt: number | null;
    toastMode: string | null;
    toastBackground: string;
    progressBackground: string | null;
    previewBackground: string;
    iconAfterText: boolean;
    iconStroke: string | null;
    iconCount: number;
    png: Buffer | null;
}

/** Starts a timeline of the progress bar and the toast: each is stamped when it is added or removed. */
async function startTimeline(frame: Frame): Promise<void> {
    await frame.evaluate(() => {
        const marks = window as unknown as {
            __timeline?: {
                progressRemovedAt: number | null;
                progressAddedAt: number | null;
                toastAddedAt: number | null;
                progressSeen: string | null;
                progressBackground: string | null;
            };
        };
        const timeline = {
            progressRemovedAt: null as number | null,
            progressAddedAt: null as number | null,
            toastAddedAt: null as number | null,
            progressSeen: null as string | null,
            progressBackground: null as string | null,
        };
        marks.__timeline = timeline;
        new MutationObserver((records) => {
            const now = performance.now();
            for (const record of records) {
                record.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }
                    if (node.classList.contains('mpgh-block-progress')) {
                        timeline.progressSeen = node.textContent;
                        timeline.progressAddedAt = now;
                        timeline.progressBackground = getComputedStyle(node).backgroundColor;
                    }
                    if (node.classList.contains('mpgh-block-toast') && timeline.toastAddedAt === null) {
                        timeline.toastAddedAt = now;
                    }
                });
                record.removedNodes.forEach((node) => {
                    if (node instanceof HTMLElement && node.classList.contains('mpgh-block-progress') && timeline.progressRemovedAt === null) {
                        timeline.progressRemovedAt = now;
                    }
                });
            }
        }).observe(document.body, { childList: true });
    });
}

async function runCopy(allowCors: boolean, previewTheme: 'light' | 'dark', windowTheme: string): Promise<CopyReport> {
    const server = await startPictureServer(allowCors);
    const workspaceDir = writeWorkspace(`${server.origin}/picture.png`);
    const { app, page } = await launchVscode(windowTheme, 'remote.md', {
        workspaceDir,
        extraArgs: ['--ignore-certificate-errors'],
        settings: { 'markdown-preview-gh.colorTheme': previewTheme },
    });
    try {
        const frame = await openMarkdownPreview(page);
        await frame.waitForFunction(() => {
            const image = document.querySelector<HTMLImageElement>('.mpgh-content img');
            return document.querySelector('h2')?.hasAttribute('data-vscode-context') && image?.complete && image.naturalWidth > 0;
        });
        await app.evaluate(({ clipboard }) => clipboard.clear());
        await startTimeline(frame);
        const toast = await copyThrough(page, frame, 'h2 >> nth=0', 'Copy This Section As PNG');
        const seen = await frame.evaluate(() => {
            const timeline = (
                window as unknown as {
                    __timeline: {
                        progressRemovedAt: number | null;
                        progressAddedAt: number | null;
                        toastAddedAt: number | null;
                        progressSeen: string | null;
                        progressBackground: string | null;
                    };
                }
            ).__timeline;
            const element = document.querySelector<HTMLElement>('.mpgh-block-toast');
            const icon = element?.querySelector('svg');
            return {
                ...timeline,
                progressGone: document.querySelector('.mpgh-block-progress') === null,
                toastMode: element?.dataset.themeMode ?? null,
                toastBackground: element ? getComputedStyle(element).backgroundColor : '',
                previewBackground: getComputedStyle(document.querySelector('.mpgh-body') ?? document.body)
                    .getPropertyValue('--bgColor-default')
                    .trim(),
                iconAfterText: icon !== null && icon !== undefined && element?.lastElementChild === icon && element.lastChild === icon,
                iconStroke: icon ? getComputedStyle(icon).stroke : null,
                iconCount: element?.querySelectorAll('svg').length ?? 0,
            };
        });
        return {
            toast,
            progress: seen.progressSeen,
            progressGone: seen.progressGone,
            progressRemovedAt: seen.progressRemovedAt,
            progressAddedAt: seen.progressAddedAt,
            toastAddedAt: seen.toastAddedAt,
            toastMode: seen.toastMode,
            toastBackground: seen.toastBackground,
            progressBackground: seen.progressBackground,
            previewBackground: seen.previewBackground,
            iconAfterText: seen.iconAfterText,
            iconStroke: seen.iconStroke,
            iconCount: seen.iconCount,
            png: await readClipboardPng(app),
        };
    } finally {
        await app.close();
        await server.close();
    }
}

/** The longest time the page may show neither the bar nor the message between them: less than one frame. */
const handoverMs = 16;

/** The least time the bar is visible: the minimum of the page, less a frame of measuring slack. */
const progressVisibleMs = 480;

/** `#rrggbb` or `#rgb` as the `rgb(r, g, b)` text a computed color has. */
function asRgb(hex: string): string {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? [...value].map((digit) => digit + digit).join('') : value;
    const [r, g, b] = [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16));
    return `rgb(${r}, ${g}, ${b})`;
}

/*
 * A remote picture takes time to fetch, so the preview shows a progress bar.
 * The bar stays until the message takes its place, with no moment in between
 * where nothing is shown. The copy then either holds every picture or fails
 * as a whole: it never leaves a picture out.
 */
test('a remote picture that allows CORS shows a progress bar until the success message, which ends with a check mark', async () => {
    const result = await runCopy(true, 'dark', 'Default Dark Modern');
    expect(result.progress, 'the progress bar must appear while the picture is fetched').toBe('Fetching remote pictures: 0 of 1');
    expect(result.progressGone, 'the progress bar must be gone when the message shows').toBe(true);
    expect(result.progressRemovedAt, 'the bar was removed').not.toBeNull();
    expect(result.toastAddedAt, 'the message was added').not.toBeNull();
    expect(Math.abs((result.toastAddedAt ?? 0) - (result.progressRemovedAt ?? 0)), 'the message takes the place of the bar at once').toBeLessThanOrEqual(handoverMs);
    expect((result.progressRemovedAt ?? 0) - (result.progressAddedAt ?? 0), 'the bar stays up for its minimum time').toBeGreaterThanOrEqual(progressVisibleMs);
    expect(result.toast).toBe('Copied the section as an image.');
    expect(result.iconCount, 'one check mark').toBe(1);
    expect(result.iconAfterText, 'the check mark ends the message').toBe(true);
    expect(result.iconStroke, 'the check mark is green (the success color of the dark theme)').toBe(asRgb('#3fb950'));
    expect(result.png, 'the picture reached the clipboard').not.toBeNull();
});

test('a remote picture that does not allow CORS fails the whole copy, with no check mark', async () => {
    const result = await runCopy(false, 'dark', 'Default Dark Modern');
    expect(result.progress, 'the progress bar must appear while the picture is fetched').toBe('Fetching remote pictures: 0 of 1');
    expect(result.progressGone, 'the progress bar must be gone when the message shows').toBe(true);
    expect(Math.abs((result.toastAddedAt ?? 0) - (result.progressRemovedAt ?? 0)), 'the message takes the place of the bar at once').toBeLessThanOrEqual(handoverMs);
    expect((result.progressRemovedAt ?? 0) - (result.progressAddedAt ?? 0), 'the bar stays up for its minimum time').toBeGreaterThanOrEqual(progressVisibleMs);
    expect(result.toast).toMatch(/^Could not copy the section as an image: 1 remote picture could not be fetched \(127\.0\.0\.1:\d+\)\.$/);
    expect(result.iconCount, 'an error carries no check mark').toBe(0);
    expect(result.png, 'a failed copy leaves the clipboard untouched').toBeNull();
});

/*
 * The messages are colored by the theme the preview shows, which the setting
 * `colorTheme` can pin, and not by the theme of the VS Code window.
 */
for (const [previewTheme, windowTheme, preview] of [
    ['light', 'Default Dark Modern', '#ffffff'],
    ['dark', 'Default Light Modern', '#0d1117'],
] as const) {
    test(`the messages follow the ${previewTheme} preview theme in a window that uses ${windowTheme}`, async () => {
        const result = await runCopy(true, previewTheme, windowTheme);
        expect(result.toastMode).toBe(previewTheme);
        expect(result.toastBackground, 'the message is painted with the background of the preview').toBe(asRgb(preview));
        expect(result.progressBackground, 'the progress bar is painted with the background of the preview').toBe(asRgb(preview));
    });
}
