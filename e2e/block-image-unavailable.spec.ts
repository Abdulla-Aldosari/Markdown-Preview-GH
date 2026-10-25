/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchVscode } from './helpers.mts';

test.setTimeout(240000);

/**
 * With the built-in Markdown extension disabled, the preview command the
 * copy relies on really does not exist. Running a block command anyway (as a
 * stale keybinding would) must tell the user instead of failing silently.
 */
test('a block command tells the user when the built-in preview command is gone', async () => {
    const resource = pathToFileURL(path.join(process.cwd(), 'e2e', 'fixtures', 'block-image.md')).href;
    const { app, page } = await launchVscode('Default Dark Modern', 'block-image.md', {
        extraArgs: ['--disable-extension=vscode.markdown-language-features'],
        keybindings: [{ key: 'ctrl+shift+f9', command: 'markdown-preview-gh.copyTableAsPng', args: { resource, mpghBlock: 'table', mpghIndex: 0 } }],
    });
    try {
        await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 60000 });
        await page.locator('.monaco-editor .view-lines').first().click();
        await page.keyboard.press('Control+Shift+F9');
        const notice = page.locator('.notification-toast', { hasText: 'Copying as an image is not available in this version of VS Code.' });
        await notice.first().waitFor({ state: 'visible', timeout: 30000 });
        expect(await notice.count()).toBeGreaterThan(0);
    } finally {
        await app.close();
    }
});
