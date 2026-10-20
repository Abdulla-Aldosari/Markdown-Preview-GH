/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { _electron, type ElectronApplication, type Frame, type Page } from 'playwright';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AuditEntry {
    name: string;
    error?: string;
    colors: string[];
    rendered?: boolean;
}

export interface AuditResult {
    wrapper: boolean;
    syncScript: boolean;
    entries: AuditEntry[];
}

export interface LaunchedVscode {
    app: ElectronApplication;
    page: Page;
    userDataDir: string;
}

/**
 * Launches a real VS Code window with this extension loaded and the audit
 * fixture open, using a fresh user-data dir pinned to the requested color
 * theme.
 */
/**
 * The VS Code version the E2E suite runs against. 1.142.0 ships a known V8
 * renderer crash ("young object promotion failed", microsoft/vscode#341813)
 * that kills the preview webview while diagrams render, so the suite pins
 * the last stable release until VS Code ships a fix.
 */
const e2eVscodeVersion = process.env.MPGH_VSCODE_VERSION ?? '1.141.2';

export async function launchVscode(colorTheme: string, fixtureName = 'all-diagrams.md'): Promise<LaunchedVscode> {
    const executablePath = await downloadAndUnzipVSCode(e2eVscodeVersion);
    const userDataDir = path.join(os.tmpdir(), `mpgh-e2e-${Date.now()}-${Math.floor(Math.random() * 1e9)}`);
    fs.mkdirSync(path.join(userDataDir, 'User'), { recursive: true });
    // An empty extensions dir keeps the machine-wide installed extensions
    // out of the test window; the extension under development still loads
    // through `--extensionDevelopmentPath`.
    const extensionsDir = path.join(userDataDir, 'extensions');
    fs.mkdirSync(extensionsDir, { recursive: true });
    fs.writeFileSync(
        path.join(userDataDir, 'User', 'settings.json'),
        JSON.stringify(
            {
                'workbench.colorTheme': colorTheme,
                'workbench.startupEditor': 'none',
                'window.restoreWindows': 'none',
            },
            null,
            2
        )
    );
    const app = await _electron.launch({
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-updates',
            '--skip-welcome',
            '--skip-release-notes',
            '--disable-workspace-trust',
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            `--extensionDevelopmentPath=${process.cwd()}`,
            path.resolve(process.cwd(), `e2e/fixtures/${fixtureName}`),
        ],
        timeout: 120000,
    });
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.monaco-workbench').waitFor({ state: 'visible', timeout: 120000 });
    return { app, page, userDataDir };
}

/**
 * Opens the built-in Markdown preview to the side and returns the webview
 * frame containing the rendered document.
 */
export async function openMarkdownPreview(page: Page): Promise<Frame> {
    // The markdown editor toolbar carries the built-in preview button; the
    // Ctrl+K V keybinding is the fallback when the button is not clickable.
    const button = page.locator('a[aria-label="Open Preview to the Side"]').first();
    try {
        await button.click({ timeout: 15000 });
    } catch {
        await page.keyboard.press('Control+K');
        await page.waitForTimeout(300);
        await page.keyboard.press('v');
    }
    await page.waitForTimeout(1500);

    // The preview renders mermaid diagrams asynchronously after the content
    // arrives; wait for the document, then for every block to carry an SVG
    // or an error.
    const frame = await findPreviewFrame(page);
    try {
        await frame.waitForFunction(() => document.querySelector('.markdown-body') !== null, undefined, {
            timeout: 30000,
            polling: 500,
        });
    } catch {
        console.log('PREVIEW CONTENT DEBUG:', await frame.evaluate(() => ({ bodyClass: document.body.className, innerHtml: document.body.innerHTML.slice(0, 600) })));
        throw new Error('the Markdown preview document did not load');
    }
    await frame.waitForFunction(
        () => {
            const blocks = Array.from(document.querySelectorAll('.mpgh-mermaid'));
            if (blocks.length === 0) {
                return false;
            }
            return blocks.every((block) => block.querySelector('svg') !== null || block.querySelector('.mermaid-error') !== null);
        },
        undefined,
        { timeout: 90000, polling: 500 }
    );
    return frame;
}

async function findPreviewFrame(page: Page): Promise<Frame> {
    // The preview webview's outer frame loads a loader page; the rendered
    // document lives in its nested fake.html frame, which shares the loader's
    // origin but not its query parameters.
    for (let attempt = 0; attempt < 60; attempt++) {
        const frames = page.frames();
        const loader = frames.find((frame) => frame.url().includes('extensionId=vscode.markdown-language-features') && frame.url().includes('index.html'));
        if (loader) {
            const origin = loader.url().slice(0, loader.url().indexOf('index.html'));
            const content = frames.find((frame) => frame.url().startsWith(origin) && frame.url().includes('fake.html'));
            if (content) {
                return content;
            }
        }
        await page.waitForTimeout(500);
    }
    console.log('PREVIEW FRAME DEBUG:');
    for (const frame of page.frames()) {
        console.log('-', frame.url());
    }
    await page.screenshot({ path: path.join(process.cwd(), 'test-results', `debug-${Date.now()}.png`) });
    throw new Error('the Markdown preview webview frame did not appear');
}

/**
 * Collects, per diagram heading, the distinct computed fill and stroke
 * colors of every shape in the diagram's SVG.
 */
export async function auditDiagramColors(frame: Frame): Promise<AuditResult> {
    return frame.evaluate(() => {
        const report: AuditEntry[] = [];
        for (const heading of Array.from(document.querySelectorAll('h2'))) {
            const name = heading.textContent?.trim() ?? '';
            let block: Element | null = null;
            let element: Element | null = heading.nextElementSibling;
            while (element && element.tagName !== 'H2') {
                const found = element.matches('.mpgh-mermaid') ? element : element.querySelector('.mpgh-mermaid');
                if (found) {
                    block = found;
                    break;
                }
                element = element.nextElementSibling;
            }
            if (!block) {
                report.push({ name, error: 'block not found', colors: [] });
                continue;
            }
            const svg = block.querySelector('svg');
            if (!svg) {
                report.push({ name, error: (block.textContent ?? '').trim().slice(0, 100) || 'no svg', colors: [] });
                continue;
            }
            const colors = new Set<string>();
            for (const node of svg.querySelectorAll('rect,circle,path,ellipse,polygon,line,text')) {
                const style = getComputedStyle(node);
                for (const property of ['fill', 'stroke'] as const) {
                    const value = style[property];
                    if (value && value !== 'none') {
                        colors.add(`${property}:${value}`);
                    }
                }
            }
            const rendered = block instanceof HTMLElement && block.dataset.mpghRendered === '1';
            report.push({
                name,
                colors: [...colors].slice(0, 25),
                rendered,
            });
        }
        return {
            wrapper: document.querySelector('.mpgh-body') !== null,
            syncScript: document.querySelector('script[src*="mermaid-preview"]') !== null,
            entries: report,
        };
    });
}
