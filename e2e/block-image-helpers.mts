/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Support for the block-to-image E2E specs: opening the context menu over a
 * block of the preview, and reading back the image the copy put on the
 * clipboard. Not a spec itself.
 */

import type { ElectronApplication, Frame, Page } from 'playwright';

export interface BlockCase {
    name: string;
    selector: string;
    title: string;
}

export const blockCases: BlockCase[] = [
    { name: 'table', selector: 'table >> nth=0', title: 'Copy This Table As PNG' },
    { name: 'code', selector: 'pre:not(.mpgh-mermaid) >> nth=0', title: 'Copy This Code Block As PNG' },
    { name: 'diagram', selector: '.mpgh-mermaid >> nth=0', title: 'Copy This Diagram As PNG' },
    { name: 'section', selector: 'h2 >> nth=0', title: 'Copy This Section As PNG' },
];

export const pngTitle = /^Copy This .* As PNG$/;

export interface ClipboardImage {
    width: number;
    height: number;
    /** The share of pixels that differ from the corner color, so a blank image reads as 0. */
    inkShare: number;
}

/** Waits for a rendered preview whose blocks carry their context values and whose diagrams are drawn. */
export async function waitForTaggedPreview(frame: Frame): Promise<void> {
    await frame.waitForFunction(() => document.querySelector('table')?.hasAttribute('data-vscode-context') && document.querySelector('.mpgh-mermaid svg') !== null);
}

/** Right-clicks a point of the element and returns every entry of the menu that opened. */
export async function openMenuAt(page: Page, frame: Frame, selector: string): Promise<string[]> {
    const locator = frame.locator(selector).first();
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ button: 'right', position: { x: 12, y: 8 } });
    await page.locator('.monaco-menu .action-label').first().waitFor({ state: 'visible', timeout: 10000 });
    return (await page.locator('.monaco-menu .action-label').allTextContents()).map((label) => label.trim());
}

/** Closes the open menu and waits until the preview has the focus back. */
export async function closeMenu(page: Page, frame: Frame): Promise<void> {
    await page.keyboard.press('Escape');
    await page.locator('.monaco-menu').waitFor({ state: 'detached', timeout: 10000 });
    await frame.waitForFunction(() => document.hasFocus());
}

/** The "Copy This ... As PNG" entries the menu over the element offers. */
export async function pngEntriesAt(page: Page, frame: Frame, selector: string): Promise<string[]> {
    const labels = await openMenuAt(page, frame, selector);
    await closeMenu(page, frame);
    return labels.filter((label) => pngTitle.test(label));
}

/** Picks an entry of the menu over the element and waits for the page to report the copy. */
export async function copyThrough(page: Page, frame: Frame, selector: string, title: string): Promise<void> {
    await openMenuAt(page, frame, selector);
    await page.locator('.monaco-menu .action-label', { hasText: title }).click();
    await frame.locator('.mpgh-block-toast').waitFor({ state: 'attached', timeout: 20000 });
}

/** The clipboard image as PNG bytes, or `null` when the clipboard holds none. */
export async function readClipboardPng(app: ElectronApplication): Promise<Buffer | null> {
    const base64 = await app.evaluate(({ clipboard }) => {
        const image = clipboard.readImage();
        return image.isEmpty() ? '' : image.toPNG().toString('base64');
    });
    return base64 === '' ? null : Buffer.from(base64, 'base64');
}

export async function readClipboardImage(app: ElectronApplication): Promise<ClipboardImage> {
    return app.evaluate(({ clipboard }) => {
        const image = clipboard.readImage();
        if (image.isEmpty()) {
            return { width: 0, height: 0, inkShare: 0 };
        }
        const { width, height } = image.getSize();
        const bitmap = image.toBitmap();
        const background = [bitmap[0], bitmap[1], bitmap[2]];
        let ink = 0;
        for (let offset = 0; offset < bitmap.length; offset += 4) {
            if (bitmap[offset] !== background[0] || bitmap[offset + 1] !== background[1] || bitmap[offset + 2] !== background[2]) {
                ink++;
            }
        }
        return { width, height, inkShare: ink / (width * height) };
    });
}

/** A token stored on the page itself: it survives as long as the page is not rebuilt. */
export async function pageToken(frame: Frame): Promise<string> {
    return frame.evaluate(() => {
        const marker = document.documentElement as HTMLElement & { mpghTestToken?: string };
        marker.mpghTestToken ??= `${Date.now()}-${Math.random()}`;
        return marker.mpghTestToken;
    });
}
