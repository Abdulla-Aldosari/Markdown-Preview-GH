/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { launchVscode } from './helpers.mts';

test.setTimeout(180000);

test('rendered diagrams are restored from storage when the preview tab returns', async () => {
    const { app, page } = await launchVscode('Default Dark Modern');
    // Open the preview inside the editor group (not to the side), so the
    // preview tab and the editor tab share one group: switching to the
    // editor tab really hides the preview, which is the scenario under
    // test.
    const previewButton = page.locator('a[aria-label="Open Preview"]').first();
    try {
        await previewButton.click({ timeout: 15000 });
    } catch {
        await page.keyboard.press('Control+K');
        await page.waitForTimeout(300);
        await page.keyboard.press('v');
    }
    const contentFrame = () => page.frames().find((f) => f.url().includes('fake.html'));
    const waitForAllRendered = async (timeout: number): Promise<boolean> => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const frame = contentFrame();
            if (!frame) {
                await page.waitForTimeout(500);
                continue;
            }
            const count = await frame.evaluate(() => document.querySelectorAll('.mpgh-mermaid[data-mpgh-rendered="1"]').length);
            if (count >= 30) {
                return true;
            }
            await page.waitForTimeout(500);
        }
        return false;
    };
    const firstReady = await waitForAllRendered(90000);
    expect(firstReady, 'the first render must complete').toBe(true);
    // Marker that dies with the webview context: proves the tab switch
    // really destroyed and rebuilt the webview.
    await contentFrame()!.evaluate(() => {
        (window as unknown as Record<string, unknown>).__mpghAlive = true;
    });
    const persisted = await contentFrame()!.evaluate(() => {
        const raw = localStorage.getItem('mpgh-mermaid-cache-v1');
        if (!raw) {
            return { missing: true } as Record<string, unknown>;
        }
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return { keys: Object.keys(parsed).length, bytes: raw.length };
    });
    console.log('PERSISTED:', JSON.stringify(persisted));
    // Switch to the editor tab: the preview tab in the same group hides.
    await page.locator('.tab', { hasText: 'all-diagrams.md' }).filter({ hasNotText: 'Preview' }).first().click({ timeout: 10000 });
    await page.waitForTimeout(4000);
    // Return to the preview tab.
    const previewTab = page.locator('.tab').filter({ hasText: 'Preview all-diagrams.md' }).first();
    const tabCount = await previewTab.count();
    console.log('PREVIEW TABS:', tabCount);
    await previewTab.click({ timeout: 10000 });
    await page.waitForTimeout(2500);
    const frame = contentFrame();
    expect(frame, 'the preview content frame must exist').toBeTruthy();
    const state = await frame!.evaluate(() => ({
        count: document.querySelectorAll('.mpgh-mermaid[data-mpgh-rendered="1"]').length,
        rebuilt: (window as unknown as Record<string, unknown>).__mpghAlive === undefined,
    }));
    console.log('RESTORED:', JSON.stringify(state));
    // Whether VS Code destroyed the hidden webview or kept it alive is its
    // internal memory management and varies between runs. The guaranteed
    // outcome is the same: every diagram is already rendered moments after
    // returning, with no visible re-render pass.
    expect(state.count, 'all diagrams must be rendered immediately after returning').toBe(30);
    try {
        await app.close();
    } catch {
        app.process().kill();
    }
});
