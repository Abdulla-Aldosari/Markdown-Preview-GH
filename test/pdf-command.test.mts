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
import { detectBrowser } from '../src/headless/browser-process.mts';
import { activateDesktop } from './desktop-harness.mts';
import { isolateTempDir } from './isolated-temp.mts';

// Other test files run browsers in parallel; count only the profiles of this process.
isolateTempDir();

/**
 * Drives the real desktop bundle and the real installed browser through the
 * `exportPdf` command. The browser-dependent tests are skipped when no browser
 * is installed.
 */

const lookup = detectBrowser(undefined);
const browserPath = lookup.kind === 'found' ? lookup.path : '';
const skip = browserPath ? false : 'no Chromium-based browser is installed';
const resource = 'file:///x/doc.md';

const plainBody = '<div class="mpgh-body" data-theme-mode="dark"><h1>Hello PDF</h1><p>Text with <code>code</code>.</p></div>';
const diagramBody = '<div class="mpgh-body" data-theme-mode="dark"><h1>Diagram</h1><pre class="mermaid">graph TD; A--&gt;B;</pre></div>';

function outputPath(name: string): string {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-pdf-out-')), name);
}

function leftoverBrowserProfiles(): string[] {
    return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('mpgh-browser-'));
}

test('exportPdf writes a real PDF for a page without diagrams and announces it', { skip }, async () => {
    const harness = await activateDesktop({ browserPath, markdown: plainBody });
    const target = outputPath('plain.pdf');
    await harness.command('markdown-preview-gh.exportPdf')({ resource, target });
    assert.deepEqual(harness.errors, []);
    const bytes = fs.readFileSync(target);
    assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.match(bytes.toString('latin1'), /\/Type\s*\/Page[^s]/, 'at least one page');
    assert.ok(harness.infos.some((message) => message === `Exported to ${target}`));
    assert.deepEqual(leftoverBrowserProfiles(), []);
});

test('exportPdf waits for the diagrams of a page that carries them', { skip }, async () => {
    const harness = await activateDesktop({ browserPath, markdown: diagramBody });
    const target = outputPath('diagram.pdf');
    await harness.command('markdown-preview-gh.exportPdf')({ resource, target });
    assert.deepEqual(harness.errors, []);
    assert.equal(fs.readFileSync(target).subarray(0, 5).toString('latin1'), '%PDF-');
});

test('a cancelled export writes no file, reports no error, and announces nothing', { skip }, async () => {
    const harness = await activateDesktop({ browserPath, markdown: diagramBody, cancelOnProgress: true });
    const target = outputPath('cancelled.pdf');
    await harness.command('markdown-preview-gh.exportPdf')({ resource, target });
    assert.equal(fs.existsSync(target), false);
    assert.deepEqual(harness.errors, []);
    assert.deepEqual(harness.infos, []);
    assert.deepEqual(leftoverBrowserProfiles(), []);
});

test('a missing browser offers the three alternatives and runs the chosen one', async () => {
    const missing = path.join(os.tmpdir(), 'mpgh-no-such-browser.exe');
    const harness = await activateDesktop({ browserPath: missing, markdown: plainBody, choice: 'Export as HTML instead' });
    await harness.command('markdown-preview-gh.exportPdf')({ resource, target: outputPath('none.pdf') });
    assert.equal(harness.errors.length, 1);
    assert.match(harness.errors[0], /was not found/);
    assert.equal(JSON.stringify(harness.errorActions[0]), JSON.stringify(['Open Settings', 'Export as HTML instead', 'Open in Browser (then Save as PDF)']));
    // The bundle runs in its own vm context, so objects it creates have another prototype: compare as JSON.
    const followUps = harness.executed.filter((call) => call.id !== 'setContext');
    assert.equal(JSON.stringify(followUps), JSON.stringify([{ id: 'markdown-preview-gh.exportHtmlLight', args: [{ resource }] }]));
});

test('a render that returns no HTML fails with one error and cleans up', { skip }, async () => {
    const harness = await activateDesktop({ browserPath, markdown: undefined as unknown as string });
    await harness.command('markdown-preview-gh.exportPdf')({ resource, target: outputPath('bad.pdf') });
    assert.equal(harness.errors.length, 1);
    assert.match(harness.errors[0], /Failed to export Markdown as PDF/);
    assert.deepEqual(leftoverBrowserProfiles(), []);
});
