/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure PDF step of the headless engine: the print parameters and the decoding
 * of the browser's reply. The page is injected through the `HeadlessPage`
 * interface, so it is testable without a browser.
 */

import type { HeadlessPage } from './headless-types.mts';

/** The `Page.printToPDF` parameters: backgrounds are printed and the page's own `@page` size wins. */
export function buildPdfParams(): { printBackground: boolean; preferCSSPageSize: boolean; displayHeaderFooter: boolean } {
    return { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false };
}

/** Decodes the base64 payload the protocol returns. */
export function decodeBase64(data: string): Uint8Array {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

/**
 * Prints the loaded page to a PDF.
 * @throws When the browser fails or does not return a PDF.
 */
export async function printPageToPdf(page: HeadlessPage): Promise<Uint8Array> {
    const { data } = await page.send<{ data?: unknown }>('Page.printToPDF', buildPdfParams());
    if (typeof data !== 'string' || data.length === 0) {
        throw new Error('The browser did not return a PDF.');
    }
    const bytes = decodeBase64(data);
    const signature = String.fromCharCode(...bytes.subarray(0, 5));
    if (signature !== '%PDF-') {
        throw new Error('The browser returned data that is not a PDF.');
    }
    return bytes;
}
