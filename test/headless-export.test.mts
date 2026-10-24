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
import { buildBrowserArguments, detectBrowser } from '../src/headless/browser-process.mts';
import { openHeadlessPage } from '../src/headless/headless-export.mts';

/** These tests drive the real browser installed on this machine; they are skipped when there is none. */
const lookup = detectBrowser(process.env['MPGH_TEST_BROWSER']);
const browserPath = lookup.kind === 'found' ? lookup.path : undefined;
const skip = browserPath ? false : 'no Chromium-based browser is installed';

function writePage(html: string): { url: string; cleanup(): void } {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-page-'));
    const file = path.join(directory, 'index.html');
    fs.writeFileSync(file, html);
    return { url: pathToFileURL(file).href, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

function leftoverProfiles(): string[] {
    return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('mpgh-browser-'));
}

test('the launch arguments carry the pipe, the Edge relaunch guard, and the profile', () => {
    const args = buildBrowserArguments('/tmp/profile');
    assert.ok(args.includes('--remote-debugging-pipe'));
    assert.ok(args.includes('--edge-skip-compat-layer-relaunch'));
    assert.ok(args.includes('--headless=new'));
    assert.ok(args.includes('--user-data-dir=/tmp/profile'));
});

test('a real browser prints a loaded page to a PDF', { skip }, async () => {
    const page = writePage('<!DOCTYPE html><html><body><h1>Hello PDF</h1></body></html>');
    const before = leftoverProfiles().length;
    const headless = await openHeadlessPage({ executablePath: browserPath as string, url: page.url, waitForMarker: false });
    try {
        const { data } = await headless.send<{ data: string }>('Page.printToPDF', { printBackground: true });
        const bytes = Buffer.from(data, 'base64');
        assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
        assert.ok(bytes.length > 500);
    } finally {
        await headless.dispose();
        page.cleanup();
    }
    assert.equal(leftoverProfiles().length, before, 'the temporary profile must be deleted');
});

test('a real browser waits for the ready marker before the page is handed over', { skip }, async () => {
    const page = writePage(`<!DOCTYPE html><html><body><p id="v">pending</p>
<script>setTimeout(() => { document.getElementById('v').textContent = 'drawn'; document.documentElement.setAttribute('data-mpgh-ready', ''); }, 600);</script>
</body></html>`);
    const headless = await openHeadlessPage({ executablePath: browserPath as string, url: page.url, waitForMarker: true });
    try {
        const { result } = await headless.send<{ result: { value: string } }>('Runtime.evaluate', { expression: `document.getElementById('v').textContent`, returnByValue: true });
        assert.equal(result.value, 'drawn');
    } finally {
        await headless.dispose();
        page.cleanup();
    }
});

test('a page that never sets the marker is stopped by the timeout and cleaned up', { skip }, async () => {
    const page = writePage('<!DOCTYPE html><html><body>never ready</body></html>');
    const before = leftoverProfiles().length;
    try {
        await assert.rejects(openHeadlessPage({ executablePath: browserPath as string, url: page.url, waitForMarker: true, timeoutMs: 1500 }), /took too long/);
    } finally {
        page.cleanup();
    }
    assert.equal(leftoverProfiles().length, before);
});

test('an aborted signal cancels the export and cleans up', { skip }, async () => {
    const page = writePage('<!DOCTYPE html><html><body>never ready</body></html>');
    const before = leftoverProfiles().length;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 800);
    try {
        await assert.rejects(openHeadlessPage({ executablePath: browserPath as string, url: page.url, waitForMarker: true, signal: controller.signal }), /cancelled/);
    } finally {
        page.cleanup();
    }
    assert.equal(leftoverProfiles().length, before);
});

test('an executable that is not a browser fails with a clear error and cleans up', async () => {
    const before = leftoverProfiles().length;
    await assert.rejects(
        openHeadlessPage({ executablePath: path.join(os.tmpdir(), 'mpgh-no-such-browser.exe'), url: 'about:blank', waitForMarker: false, timeoutMs: 5000 }),
        /could not be started|exited unexpectedly/
    );
    assert.equal(leftoverProfiles().length, before);
});
