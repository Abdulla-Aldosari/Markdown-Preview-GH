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

/** The space the copy keeps around a block, in the pixels of the image: 16 CSS pixels at double density. */
export const imagePadding = 32;

/** How many times a menu entry is clicked before the test gives up. */
const menuClickAttempts = 3;

/** How long the menu may take to close after a click. */
const menuCloseWaitMs = 1500;

/** How many right clicks are made, and how long each is given, before a menu is declared missing. */
const menuOpenAttempts = 2;
const menuOpenWaitMs = 3000;

/** How long the preview may take to get the focus back after a menu closed. */
const focusReturnWaitMs = 2000;

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

/**
 * Closes the zoom layer of the viewer when it is open. A layer that covers the
 * preview takes every click meant for a block, and a stray click on a diagram
 * opens it, so every step that clicks a block starts from a clean page.
 */
export async function closeViewerIfOpen(page: Page, frame: Frame): Promise<void> {
    const viewer = frame.locator('.mpgh-viewer');
    if ((await viewer.count()) === 0) {
        return;
    }
    await page.keyboard.press('Escape');
    try {
        await viewer.waitFor({ state: 'detached', timeout: 2000 });
    } catch {
        await frame.evaluate(() => document.querySelector<HTMLButtonElement>('.mpgh-viewer [data-action="close"]')?.click());
        await viewer.waitFor({ state: 'detached', timeout: 2000 });
    }
}

/** Right-clicks a point of the element and returns every entry of the menu that opened. */
export async function openMenuAt(page: Page, frame: Frame, selector: string): Promise<string[]> {
    await closeViewerIfOpen(page, frame);
    // The clipboard accepts a write only from a focused window. A test window
    // that lost the operating system focus (the machine is in use while the
    // suite runs) is brought back before every step that depends on it.
    await page.bringToFront();
    const locator = frame.locator(selector).first();
    await locator.scrollIntoViewIfNeeded();
    const firstEntry = page.locator('.monaco-menu .action-label').first();
    // A right click that arrives while the window is still settling may open no
    // menu at all; one more click is made before the step is reported as failed.
    for (let attempt = 0; attempt < menuOpenAttempts; attempt++) {
        await locator.click({ button: 'right', position: { x: 12, y: 8 } });
        try {
            await firstEntry.waitFor({ state: 'visible', timeout: menuOpenWaitMs });
            break;
        } catch (error) {
            if (attempt === menuOpenAttempts - 1) {
                throw error;
            }
        }
    }
    return (await page.locator('.monaco-menu .action-label').allTextContents()).map((label) => label.trim());
}

/**
 * Closes the open menu and waits until the preview has the focus back. VS Code
 * hands the focus back after a moment, and now and then does not at all; the
 * preview is then given the focus the way a person would, by clicking its
 * title, which is plain text that no script of the preview reacts to.
 */
export async function closeMenu(page: Page, frame: Frame): Promise<void> {
    await page.keyboard.press('Escape');
    await page.locator('.monaco-menu').waitFor({ state: 'detached', timeout: 10000 });
    try {
        await frame.waitForFunction(() => document.hasFocus(), undefined, { timeout: focusReturnWaitMs });
    } catch {
        await frame.locator('h1').first().click();
        await frame.waitForFunction(() => document.hasFocus(), undefined, { timeout: focusReturnWaitMs });
    }
}

/** The "Copy This ... As PNG" entries the menu over the element offers. */
export async function pngEntriesAt(page: Page, frame: Frame, selector: string): Promise<string[]> {
    const labels = await openMenuAt(page, frame, selector);
    await closeMenu(page, frame);
    return labels.filter((label) => pngTitle.test(label));
}

/**
 * Clicks an entry of the open menu. The menu may ignore a click that arrives
 * right after it opened (the first click of a run sometimes leaves it open and
 * the command never runs), so the menu is expected to close, and the click is
 * repeated while it has not. A click on a menu that closed does nothing.
 */
async function chooseMenuEntry(page: Page, title: string): Promise<void> {
    const entry = page.locator('.monaco-menu .action-label', { hasText: title });
    const menu = page.locator('.monaco-menu');
    for (let attempt = 0; attempt < menuClickAttempts; attempt++) {
        // A second click is only made on a menu that is still there: a click
        // that lands after the menu closed would hit the page under it.
        if ((await menu.count()) === 0) {
            return;
        }
        await entry.hover({ timeout: 5000 });
        await entry.click({ timeout: 5000 });
        try {
            await menu.waitFor({ state: 'detached', timeout: menuCloseWaitMs });
            return;
        } catch {
            // The menu is still open: the click was ignored.
        }
    }
    throw new Error(`the menu entry "${title}" did not run after ${menuClickAttempts} clicks`);
}

/**
 * Picks an entry of the menu over the element and waits for the page to report
 * the copy. A message left over from an earlier copy is removed first, so the
 * message returned belongs to this copy; the menu is closed if anything fails.
 */
export async function copyThrough(page: Page, frame: Frame, selector: string, title: string): Promise<string> {
    await frame.evaluate(() => {
        document.querySelector('.mpgh-block-toast')?.remove();
        // A trace of what reaches the page, kept for the failure report below.
        const mark = window as unknown as { __copyTrace?: string[]; __copyTraceOn?: boolean };
        mark.__copyTrace = [];
        if (!mark.__copyTraceOn) {
            mark.__copyTraceOn = true;
            window.addEventListener('message', (event) => {
                const data = event.data as { type?: string; id?: string } | null;
                mark.__copyTrace?.push(`${data?.type ?? '?'}${data?.id ? `:${data.id}` : ''}`);
            });
        }
    });
    try {
        await openMenuAt(page, frame, selector);
        await chooseMenuEntry(page, title);
        await frame.locator('.mpgh-block-toast').waitFor({ state: 'attached', timeout: 10000 });
    } catch (error) {
        const seen = await describeFailureState(page, frame);
        await page.keyboard.press('Escape');
        const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
        throw new Error(`${reason} | ${seen}`);
    }
    return (await frame.locator('.mpgh-block-toast').textContent()) ?? '';
}

/** What the window and the preview show after a copy that never confirmed: the evidence for a failure report. */
async function describeFailureState(page: Page, frame: Frame): Promise<string> {
    const pageState = await frame
        .evaluate(() => ({
            messages: (window as unknown as { __copyTrace?: string[] }).__copyTrace ?? [],
            focus: document.hasFocus(),
            viewer: document.querySelector('.mpgh-viewer') !== null,
            toast: document.querySelector('.mpgh-block-toast')?.textContent ?? '',
        }))
        .catch(() => ({ messages: ['frame gone'], focus: false, viewer: false, toast: '' }));
    const notices = await page
        .locator('.notifications-toasts .notification-toast')
        .allInnerTexts()
        .catch(() => []);
    const menus = await page
        .locator('.monaco-menu')
        .count()
        .catch(() => -1);
    return `page=${JSON.stringify(pageState)} notices=${JSON.stringify(notices.map((text) => text.replace(/\s+/g, ' ').slice(0, 90)))} menusOpen=${menus}`;
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

export interface PngAnalysis {
    width: number;
    height: number;
    /** The first and last columns and rows that differ from the corner color. */
    left: number;
    right: number;
    top: number;
    bottom: number;
    /** Neutral gray pixels in the strips along the bottom and right edges of the painted area: scrollbar colors. */
    neutralGray: { bottom: number; right: number };
}

/**
 * Measures where a PNG is painted, in a plain page (the PNG never reaches
 * VS Code's own window). The corner pixel is the background; the strips are
 * `band` pixels deep and hold the scrollbars a block would show.
 */
export async function analyzePng(helper: Page, png: Buffer, band: number): Promise<PngAnalysis> {
    return helper.evaluate(
        async ({ base64, strip }) => {
            const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d')!;
            context.drawImage(bitmap, 0, 0);
            const { width, height } = bitmap;
            const data = context.getImageData(0, 0, width, height).data;
            const background = [data[0], data[1], data[2]];
            let left = width;
            let right = -1;
            let top = height;
            let bottom = -1;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const offset = (y * width + x) * 4;
                    if (data[offset] !== background[0] || data[offset + 1] !== background[1] || data[offset + 2] !== background[2]) {
                        left = Math.min(left, x);
                        right = Math.max(right, x);
                        top = Math.min(top, y);
                        bottom = Math.max(bottom, y);
                    }
                }
            }
            const isNeutralGray = (x: number, y: number): boolean => {
                const offset = (y * width + x) * 4;
                const [r, g, b] = [data[offset], data[offset + 1], data[offset + 2]];
                return Math.abs(r - g) <= 1 && Math.abs(g - b) <= 1 && r >= 35 && r <= 140;
            };
            let grayBottom = 0;
            let grayRight = 0;
            for (let y = Math.max(0, bottom - strip); y <= bottom; y++) {
                for (let x = left; x <= right; x++) {
                    grayBottom += isNeutralGray(x, y) ? 1 : 0;
                }
            }
            for (let y = top; y <= bottom; y++) {
                for (let x = Math.max(0, right - strip); x <= right; x++) {
                    grayRight += isNeutralGray(x, y) ? 1 : 0;
                }
            }
            return { width, height, left, right, top, bottom, neutralGray: { bottom: grayBottom, right: grayRight } };
        },
        { base64: png.toString('base64'), strip: band }
    );
}

/** A token stored on the page itself: it survives as long as the page is not rebuilt. */
export async function pageToken(frame: Frame): Promise<string> {
    return frame.evaluate(() => {
        const marker = document.documentElement as HTMLElement & { mpghTestToken?: string };
        marker.mpghTestToken ??= `${Date.now()}-${Math.random()}`;
        return marker.mpghTestToken;
    });
}
