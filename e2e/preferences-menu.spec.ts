/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import type { Frame, Page } from 'playwright';
import { findPreviewFrame, launchVscode, openMarkdownPreview } from './helpers.mts';
import { closeMenu, openMenuAt } from './block-image-helpers.mts';

test.setTimeout(120000);

/** The mark that ends the title of the option in effect. */
const mark = '\u2714';

/** How long a submenu may take to open after the pointer rests on its entry. */
const submenuWaitMs = 3000;

/** How many times an option is clicked, and how long the menu may take to close after a click. */
const optionClickAttempts = 3;
const menuCloseWaitMs = 1500;

/** How many times the submenu entry is approached before the test gives up. */
const submenuOpenAttempts = 3;

/** How long the preview may take to carry a new context value after an option was chosen. */
const contextWaitMs = 5000;

/** How long one look at a preview frame may take before the frame is looked up again. */
const frameAttemptMs = 1000;

/** The titles of the submenu that is open, with `|` for each separator, read from the visible menu items. */
async function readSubmenu(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const menus = Array.from(document.querySelectorAll('.monaco-menu'));
        const submenu = menus[menus.length - 1];
        return Array.from(submenu.querySelectorAll('.action-item'))
            .map((item) => (item.querySelector('.action-label.separator') ? '|' : (item.querySelector('.action-label')?.textContent ?? '').trim()))
            .filter((text) => text !== '');
    });
}

/** Opens the context menu over the preview and then the `Preferences` submenu, and returns its titles. */
async function openPreferences(page: Page, frame: Frame): Promise<string[]> {
    const labels = await openMenuAt(page, frame, 'h1');
    expect(labels).toContain('Preferences');
    const entry = page.locator('.monaco-menu .action-label', { hasText: /^Preferences$/ });
    const submenu = page.locator('.monaco-menu').nth(1);
    // A hover that arrives while the menu is still settling may not open the submenu; it is repeated.
    for (let attempt = 0; attempt < submenuOpenAttempts; attempt++) {
        await entry.hover();
        try {
            await submenu.waitFor({ state: 'visible', timeout: submenuWaitMs });
            break;
        } catch (error) {
            if (attempt === submenuOpenAttempts - 1) {
                throw error;
            }
            await entry.click();
        }
    }
    return readSubmenu(page);
}

/** Closes the open submenu and then the menu under it: each Escape closes one level. */
async function closeAllMenus(page: Page, frame: Frame): Promise<void> {
    while ((await page.locator('.monaco-menu').count()) > 1) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
    }
    await closeMenu(page, frame);
}

/**
 * Clicks an option of the open submenu. A menu may ignore a click that arrives
 * right after it opened, so the click is repeated while the menu is still open;
 * a click is never made on a menu that already closed.
 */
async function chooseOption(page: Page, title: string): Promise<void> {
    const option = page
        .locator('.monaco-menu')
        .last()
        .locator('.action-label', { hasText: new RegExp(`^${title}$`) });
    const menus = page.locator('.monaco-menu');
    for (let attempt = 0; attempt < optionClickAttempts; attempt++) {
        if ((await menus.count()) === 0) {
            return;
        }
        await option.hover({ timeout: submenuWaitMs });
        await option.click({ timeout: submenuWaitMs });
        try {
            await menus.first().waitFor({ state: 'detached', timeout: menuCloseWaitMs });
            return;
        } catch {
            // The menu is still open: the click was ignored.
        }
    }
    throw new Error(`the option "${title}" did not run after ${optionClickAttempts} clicks`);
}

/**
 * Waits until the preview page carries the given context value and returns its
 * frame. A refresh rebuilds the preview webview, which detaches the old frame,
 * so the frame is looked up again on every attempt.
 */
async function waitForContextValue(page: Page, contextKey: string, value: string): Promise<Frame> {
    const deadline = Date.now() + contextWaitMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
        try {
            const frame = await findPreviewFrame(page);
            await frame.waitForFunction(
                ({ key, expected }) => {
                    const context = document.querySelector('.mpgh-body')?.getAttribute('data-vscode-context');
                    return context !== null && context !== undefined && JSON.parse(context)[key] === expected;
                },
                { key: contextKey, expected: value },
                { timeout: frameAttemptMs }
            );
            return frame;
        } catch (error) {
            // The frame was replaced while it was being read: look it up again.
            lastError = error;
        }
    }
    throw new Error(`the preview never carried ${contextKey}=${value}: ${String(lastError)}`);
}

/** Gives the preview the focus back after a choice closed the menu, so the next right click reaches the page. */
async function closeMenuFocus(page: Page, frame: Frame): Promise<void> {
    await page.bringToFront();
    try {
        await frame.waitForFunction(() => document.hasFocus(), undefined, { timeout: 2000 });
    } catch {
        await frame.locator('h1').first().click();
    }
}

/** The titles of the submenu with the separators removed and only the checked ones kept. */
function checkedOnly(titles: string[]): string[] {
    return titles.filter((title) => title.endsWith(mark));
}

test('the Preferences submenu groups the options, marks the ones in effect, and moves the mark on choosing', async () => {
    const { app, page } = await launchVscode('Default Dark Modern', 'preferences-menu.md');
    try {
        let frame = await openMarkdownPreview(page);
        frame = await waitForContextValue(page, 'mpghWidth', 'normal');

        const titles = await openPreferences(page, frame);
        console.log('SUBMENU:', JSON.stringify(titles));
        expect(titles.filter((title) => title !== '|').map((title) => title.replace(` ${mark}`, ''))).toEqual([
            'Width Narrow',
            'Width Normal',
            'Width Wide',
            'Width Full',
            'Direction Auto',
            'Direction LTR',
            'Direction RTL',
            'Theme Auto',
            'Theme Dark',
            'Theme Light',
        ]);
        expect(titles.filter((title) => title === '|')).toHaveLength(2);
        expect(checkedOnly(titles)).toEqual([`Width Normal ${mark}`, `Direction LTR ${mark}`, `Theme Auto ${mark}`]);
        await closeAllMenus(page, frame);

        // Choose another option of each group: the mark must follow the choice.
        const choices: Array<{ title: string; contextKey: string; value: string }> = [
            { title: 'Width Wide', contextKey: 'mpghWidth', value: 'wide' },
            { title: 'Direction RTL', contextKey: 'mpghDirection', value: 'rtl' },
            { title: 'Theme Dark', contextKey: 'mpghTheme', value: 'dark' },
        ];
        for (const choice of choices) {
            await openPreferences(page, frame);
            await chooseOption(page, choice.title);
            // The preview is rebuilt after the choice: wait for the new frame to carry the new value.
            frame = await waitForContextValue(page, choice.contextKey, choice.value);
            await closeMenuFocus(page, frame);
        }
        await frame.waitForFunction(() => document.querySelector('.mpgh-body')?.getAttribute('dir') === 'rtl');

        const after = await openPreferences(page, frame);
        console.log('SUBMENU AFTER:', JSON.stringify(after));
        expect(checkedOnly(after)).toEqual([`Width Wide ${mark}`, `Direction RTL ${mark}`, `Theme Dark ${mark}`]);
        await closeAllMenus(page, frame);
    } finally {
        try {
            await app.close();
        } catch {
            app.process().kill();
        }
    }
});
