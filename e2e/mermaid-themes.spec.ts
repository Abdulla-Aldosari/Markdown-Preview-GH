/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { auditDiagramColors, launchVscode, openMarkdownPreview, type AuditEntry } from './helpers.mts';

test.setTimeout(420000);

function entry(report: AuditEntry[], name: string): AuditEntry {
    // Fixture headings may be numbered ("01 - flowchart"), so match on the
    // diagram name appearing anywhere in the heading.
    const found = report.find((item) => item.name === name || item.name.includes(name));
    expect(found, `diagram ${name} is missing from the report`).toBeTruthy();
    expect(found?.error, `diagram ${name} failed: ${found?.error ?? ''}`).toBeUndefined();
    return found!;
}

function expectColor(report: AuditEntry[], name: string, color: string): void {
    const diagram = entry(report, name);
    expect(diagram.colors, `${name} must contain ${color}`).toContain(color);
}

for (const scenario of [
    { mode: 'dark', theme: 'Default Dark Modern' },
    { mode: 'light', theme: 'Default Light Modern' },
] as const) {
    test(`all mermaid diagrams use the website themes in ${scenario.mode} mode`, async () => {
        const { app, page } = await launchVscode(scenario.theme);
        const logs: string[] = [];
        page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning') {
                logs.push(`[console.${message.type()}] ${message.text().slice(0, 300)}`);
            }
        });
        page.on('pageerror', (error) => {
            logs.push(`[pageerror] ${error.message.slice(0, 300)}`);
        });
        try {
            const frame = await openMarkdownPreview(page);
            await frame.waitForTimeout(2500);
            const audit = await auditDiagramColors(frame);
            const report = audit.entries;

            console.log(`\n===== AUDIT: ${scenario.mode} (wrapper: ${audit.wrapper}, syncScript: ${audit.syncScript}) =====`);
            for (const item of report) {
                console.log(`- ${item.name}${item.rendered ? ' [rendered]' : ''}: ${item.error ? `ERROR ${item.error}` : item.colors.join(' | ')}`);
            }
            if (logs.length > 0) {
                console.log(`----- ${scenario.mode} console errors -----`);
                for (const log of [...new Set(logs)].slice(0, 20)) {
                    console.log(log);
                }
            }

            await page.screenshot({ path: path.join(process.cwd(), 'test-results', `mermaid-${scenario.mode}.png`) });

            // The reported regressions, now pinned to the pure website themes.
            if (scenario.mode === 'dark') {
                expectColor(report, 'flowchart', 'fill:rgb(17, 17, 19)');
                expectColor(report, 'flowchart', 'stroke:rgb(255, 255, 255)');
                expectColor(report, 'gitGraph', 'fill:rgb(161, 34, 115)');
                expectColor(report, 'pie', 'fill:rgb(77, 16, 55)');
                expectColor(report, 'venn', 'fill:rgb(164, 0, 0)');
                expectColor(report, 'sequenceDiagram', 'fill:rgb(17, 17, 19)');
                expectColor(report, 'treeView', 'stroke:rgb(211, 211, 211)');
            } else {
                expectColor(report, 'flowchart', 'fill:rgb(236, 236, 255)');
                expectColor(report, 'flowchart', 'stroke:rgb(147, 112, 219)');
                expectColor(report, 'gitGraph', 'fill:rgb(0, 0, 236)');
                expectColor(report, 'pie', 'fill:rgb(236, 236, 255)');
                expectColor(report, 'venn', 'fill:rgb(255, 255, 69)');
                expectColor(report, 'sequenceDiagram', 'fill:rgb(236, 236, 255)');
                expectColor(report, 'treeView', 'stroke:rgb(51, 51, 51)');
            }

            // An unrelated content update must not re-render already
            // rendered diagrams: the SVG element itself must survive.
            const stable = await frame.evaluate(async () => {
                const block = document.querySelector('.mpgh-mermaid');
                const svg = block?.querySelector('svg');
                if (!block || !svg) {
                    return false;
                }
                window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
                await new Promise((resolve) => setTimeout(resolve, 1500));
                return svg.isConnected && block.querySelector('svg') === svg;
            });
            expect(stable, 'diagrams must survive an unrelated content update untouched').toBe(true);
            // The re-render guard must also keep a rendered block from being
            // rewritten at all: a content update may not touch its child list.
            const rewrites = await frame.evaluate(async () => {
                const block = document.querySelector('.mpgh-mermaid');
                if (!block) {
                    return -1;
                }
                let writes = 0;
                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList' && mutation.target === block) {
                            writes += 1;
                        }
                    }
                });
                observer.observe(block, { childList: true });
                window.dispatchEvent(new CustomEvent('vscode.markdown.updateContent'));
                await new Promise((resolve) => setTimeout(resolve, 1500));
                observer.disconnect();
                return writes;
            });
            expect(rewrites, 'a rendered diagram must not be rewritten by an unrelated update').toBe(0);
        } finally {
            await app.close();
        }
    });
}
