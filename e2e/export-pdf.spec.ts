/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchVscode } from './helpers.mts';

test.setTimeout(240000);

const fixturesDir = path.join(__dirname, 'fixtures');

async function waitForFile(file: string): Promise<void> {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        if (fs.existsSync(file) && fs.statSync(file).size > 0) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`the export did not write ${file}`);
}

test('Export As PDF writes a real PDF from a VS Code window, light even on a dark theme', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-export-pdf-ws-'));
    fs.cpSync(fixturesDir, workspaceRoot, { recursive: true });
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-export-pdf-out-'));
    const pdfFile = path.join(outputDir, 'result.pdf');
    const resource = pathToFileURL(path.join(workspaceRoot, 'export-pdf.md')).href;
    const { app, page } = await launchVscode('Default Dark Modern', 'export-pdf.md', {
        workspaceDir: workspaceRoot,
        keybindings: [{ key: 'ctrl+shift+f9', command: 'markdown-preview-gh.exportPdf', args: { resource, target: pdfFile } }],
    });
    try {
        await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 60000 });
        await page.locator('.monaco-editor .view-lines').first().click();
        await page.keyboard.press('Control+Shift+F9');
        try {
            await waitForFile(pdfFile);
        } catch (error) {
            await page.screenshot({ path: path.join(process.cwd(), 'test-results', 'export-pdf-debug.png') });
            throw error;
        }
    } finally {
        await app.close();
    }

    const bytes = fs.readFileSync(pdfFile);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
    expect(bytes.toString('latin1')).toMatch(/\/Type\s*\/Page[^s]/);
    // The extension's temporary page and browser profile are gone.
    const leftovers = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('mpgh-browser-'));
    expect(leftovers).toEqual([]);
});
