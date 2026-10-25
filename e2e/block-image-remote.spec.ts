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

async function runCopy(allowCors: boolean): Promise<{ toast: string; progress: string | null; progressGone: boolean; png: Buffer | null }> {
    const server = await startPictureServer(allowCors);
    const workspaceDir = writeWorkspace(`${server.origin}/picture.png`);
    const { app, page } = await launchVscode('Default Dark Modern', 'remote.md', { workspaceDir, extraArgs: ['--ignore-certificate-errors'] });
    try {
        const frame = await openMarkdownPreview(page);
        await frame.waitForFunction(() => {
            const image = document.querySelector<HTMLImageElement>('.mpgh-content img');
            return document.querySelector('h2')?.hasAttribute('data-vscode-context') && image?.complete && image.naturalWidth > 0;
        });
        await app.evaluate(({ clipboard }) => clipboard.clear());
        const shown = frame.waitForSelector('.mpgh-block-progress', { state: 'attached', timeout: 15000 }).then((handle) => handle.textContent());
        const toast = await copyThrough(page, frame, 'h2 >> nth=0', 'Copy This Section As PNG');
        const progress = await shown.catch(() => null);
        const progressGone = (await frame.locator('.mpgh-block-progress').count()) === 0;
        return { toast, progress, progressGone, png: await readClipboardPng(app) };
    } finally {
        await app.close();
        await server.close();
    }
}

/*
 * A remote picture takes time to fetch, so the preview shows a progress bar
 * until the fetch ends. The copy then either holds every picture or fails as
 * a whole: it never leaves a picture out.
 */
test('a remote picture that allows CORS shows a progress bar and is part of the copy', async () => {
    const result = await runCopy(true);
    expect(result.progress, 'the progress bar must appear while the picture is fetched').toBe('Fetching remote pictures: 0 of 1');
    expect(result.progressGone, 'the progress bar must be gone when the copy ends').toBe(true);
    expect(result.toast).toBe('Copied the section as an image.');
    expect(result.png, 'the picture reached the clipboard').not.toBeNull();
});

test('a remote picture that does not allow CORS fails the whole copy', async () => {
    const result = await runCopy(false);
    expect(result.progress, 'the progress bar must appear while the picture is fetched').toBe('Fetching remote pictures: 0 of 1');
    expect(result.progressGone, 'the progress bar must be gone when the copy ends').toBe(true);
    expect(result.toast).toMatch(/^Could not copy the section as an image: 1 remote picture could not be fetched \(127\.0\.0\.1:\d+\)\.$/);
    expect(result.png, 'a failed copy leaves the clipboard untouched').toBeNull();
});
