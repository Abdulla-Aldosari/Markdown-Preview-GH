/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HeadlessPage } from '../src/headless/headless-types.mts';
import { buildPdfParams, decodeBase64, printPageToPdf } from '../src/headless/pdf-export.mts';

function pageReplying(reply: unknown): { page: HeadlessPage; calls: Array<{ method: string; params: unknown }> } {
    const calls: Array<{ method: string; params: unknown }> = [];
    const page: HeadlessPage = {
        send: async <T = unknown,>(method: string, params?: object) => {
            calls.push({ method, params });
            return reply as T;
        },
        dispose: async () => undefined,
    };
    return { page, calls };
}

test('the print parameters keep backgrounds and the page size of the stylesheet', () => {
    assert.deepEqual(buildPdfParams(), { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
});

test('decodeBase64 restores every byte value', () => {
    const original = Uint8Array.from({ length: 256 }, (_unused, index) => index);
    assert.deepEqual(decodeBase64(Buffer.from(original).toString('base64')), original);
});

test('printPageToPdf returns the decoded PDF bytes', async () => {
    const pdf = Buffer.from('%PDF-1.7 body');
    const { page, calls } = pageReplying({ data: pdf.toString('base64') });
    assert.deepEqual(Buffer.from(await printPageToPdf(page)), pdf);
    assert.deepEqual(calls, [{ method: 'Page.printToPDF', params: buildPdfParams() }]);
});

test('printPageToPdf rejects an empty or missing payload', async () => {
    await assert.rejects(printPageToPdf(pageReplying({}).page), /did not return a PDF/);
    await assert.rejects(printPageToPdf(pageReplying({ data: '' }).page), /did not return a PDF/);
});

test('printPageToPdf rejects data that is not a PDF', async () => {
    await assert.rejects(printPageToPdf(pageReplying({ data: Buffer.from('<html>').toString('base64') }).page), /not a PDF/);
});
