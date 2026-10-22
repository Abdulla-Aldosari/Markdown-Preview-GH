/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { launchVscode, openMarkdownPreview } from './helpers.mts';

test.setTimeout(240000);

test('images and diagrams open in the zoomable viewer inside the real preview', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'image-viewer.md');
    try {
        const frame = await openMarkdownPreview(page);
        await frame.waitForFunction(() => {
            const image = document.querySelector<HTMLImageElement>('.mpgh-content img');
            return image !== null && image.complete && image.naturalWidth > 0;
        });
        await frame.waitForFunction(() => document.documentElement.classList.contains('mpgh-viewer-ready'));

        const viewerState = () =>
            frame.evaluate(() => {
                const overlay = document.querySelector('.mpgh-viewer');
                const content = document.querySelector<HTMLElement>('.mpgh-viewer-content');
                return {
                    open: overlay !== null,
                    isOpen: overlay?.classList.contains('is-open') ?? false,
                    label: document.querySelector<HTMLElement>('[data-action="reset"]')?.dataset.label ?? '',
                    transform: content?.style.transform ?? '',
                    themeMode: (overlay as HTMLElement | null)?.dataset.themeMode ?? '',
                    background: content ? getComputedStyle(content).backgroundColor : '',
                    insideContent: overlay?.closest('.markdown-body') !== null,
                    context: (overlay as HTMLElement | null)?.dataset.vscodeContext ?? '',
                };
            });

        // A click on a regular image opens the viewer, outside the rewritten content.
        await frame.locator('.mpgh-content > p > img').first().click();
        await frame.waitForFunction(() => document.querySelector('.mpgh-viewer.is-open') !== null);
        let state = await viewerState();
        expect(state.insideContent, 'the layer must live outside the content the preview rewrites').toBe(false);
        expect(state.themeMode).toBe('auto');
        expect(JSON.parse(state.context), 'the layer marks itself so the extension commands are hidden from the context menu').toEqual({ mpghViewer: true });
        // An image has no card behind it: its transparent pixels must show the
        // backdrop, and its shadow follows the painted pixels (a filter on the
        // image), fading through a transition so it is gone on the way back.
        const imageDress = await frame.evaluate(() => {
            const content = document.querySelector<HTMLElement>('.mpgh-viewer-content')!;
            const image = content.querySelector('img')!;
            return {
                kind: (document.querySelector('.mpgh-viewer') as HTMLElement).dataset.kind,
                background: getComputedStyle(content).backgroundColor,
                boxShadow: getComputedStyle(content).boxShadow,
                filter: getComputedStyle(image).filter,
                filterTransition: getComputedStyle(image).transitionProperty,
            };
        });
        expect(imageDress.kind).toBe('image');
        expect(imageDress.background, 'an image is not placed on a card').toBe('rgba(0, 0, 0, 0)');
        expect(imageDress.boxShadow).toBe('none');
        expect(imageDress.filter).toContain('drop-shadow');
        expect(imageDress.filterTransition).toContain('filter');

        // The context menu inside the layer offers only the built-in entries:
        // none of the extension's commands applies to a zoomed image.
        await frame.locator('.mpgh-viewer-stage').click({ button: 'right', position: { x: 40, y: 40 } });
        await page.locator('.monaco-menu .action-label').first().waitFor({ state: 'visible', timeout: 10000 });
        const viewerMenu = (await page.locator('.monaco-menu .action-label').allTextContents()).map((label) => label.trim());
        await page.keyboard.press('Escape');
        expect(viewerMenu, 'the layer menu must list the built-in entries only').toEqual(['Cut', 'Copy', 'Paste']);
        // Keys reach the preview only after the menu is gone and VS Code has
        // given the focus back to the webview.
        await page.locator('.monaco-menu').waitFor({ state: 'detached', timeout: 10000 });
        await frame.waitForFunction(() => document.hasFocus() && document.querySelector('.mpgh-viewer') !== null);

        // Wheel zoom changes the scale; the fit key restores it.
        const fitLabel = (await viewerState()).label;
        await frame.locator('.mpgh-viewer-stage').hover();
        await frame.page().mouse.wheel(0, -400);
        await expect.poll(async () => (await viewerState()).label).not.toBe(fitLabel);
        await frame.page().keyboard.press('0');
        await expect.poll(async () => (await viewerState()).label).toBe(fitLabel);

        // Escape closes the viewer and restores the source image.
        await frame.page().keyboard.press('Escape');
        await frame.waitForFunction(() => document.querySelector('.mpgh-viewer') === null);
        expect(await frame.evaluate(() => getComputedStyle(document.querySelector('.mpgh-content img')!).visibility)).toBe('visible');

        // An image inside a link keeps the behavior of the link.
        await frame.locator('.mpgh-content a img').click();
        await frame.page().waitForTimeout(600);
        expect((await viewerState()).open, 'a linked image must not open the viewer').toBe(false);

        // A rendered diagram opens in the same viewer.
        await frame.locator('.mpgh-mermaid[data-mpgh-rendered="1"] svg').click();
        await frame.waitForFunction(() => document.querySelector('.mpgh-viewer.is-open .mpgh-viewer-content > svg') !== null);
        state = await viewerState();
        expect(state.open).toBe(true);
        // A diagram keeps its themed card and the card shadow. The card fades
        // in with the opening animation, so the check waits for it to settle.
        await frame.waitForFunction(() => getComputedStyle(document.querySelector('.mpgh-viewer-content')!).backgroundColor === 'rgb(13, 17, 23)');
        const diagramDress = await frame.evaluate(() => {
            const content = document.querySelector<HTMLElement>('.mpgh-viewer-content')!;
            return {
                kind: (document.querySelector('.mpgh-viewer') as HTMLElement).dataset.kind,
                background: getComputedStyle(content).backgroundColor,
                boxShadow: getComputedStyle(content).boxShadow,
                shadowTransition: getComputedStyle(content).transitionProperty,
            };
        });
        expect(diagramDress.kind).toBe('diagram');
        expect(diagramDress.background).toBe('rgb(13, 17, 23)');
        expect(diagramDress.boxShadow).not.toBe('none');
        expect(diagramDress.shadowTransition).toContain('box-shadow');
        expect(diagramDress.shadowTransition, 'the card surface fades with its shadow on the way back').toContain('background-color');
        // The clone must not duplicate any id of the original diagram: its
        // markers would otherwise resolve through the hidden original.
        const duplicateIds = await frame.evaluate(() => {
            const seen = new Set<string>();
            const duplicates: string[] = [];
            for (const element of Array.from(document.querySelectorAll('[id]'))) {
                if (seen.has(element.id)) {
                    duplicates.push(element.id);
                }
                seen.add(element.id);
            }
            return duplicates;
        });
        expect(duplicateIds, 'the diagram clone must carry unique ids').toEqual([]);
        await frame.page().keyboard.press('Escape');
        await frame.waitForFunction(() => document.querySelector('.mpgh-viewer') === null);
    } finally {
        try {
            await app.close();
        } catch {
            app.process().kill();
        }
    }
});
