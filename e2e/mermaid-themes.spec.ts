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
    const found = report.find((item) => item.name === name);
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
                console.log(`- ${item.name}${item.injected ? ' [injected]' : ''}: ${item.error ? `ERROR ${item.error}` : item.colors.join(' | ')}`);
            }
            if (logs.length > 0) {
                console.log(`----- ${scenario.mode} console errors -----`);
                for (const log of [...new Set(logs)].slice(0, 20)) {
                    console.log(log);
                }
            }

            await page.screenshot({ path: path.join(process.cwd(), 'test-results', `mermaid-${scenario.mode}.png`) });

            // The reported regressions, now pinned to the pure website themes.
            // treeView is excluded: the bundled renderer draws its branch
            // lines with a hardcoded black stroke that no theme variable
            // reaches.
            if (scenario.mode === 'dark') {
                expectColor(report, 'flowchart', 'fill:rgb(17, 17, 19)');
                expectColor(report, 'flowchart', 'stroke:rgb(255, 255, 255)');
                expectColor(report, 'gitGraph', 'fill:rgb(161, 34, 115)');
                expectColor(report, 'pie', 'fill:rgb(77, 16, 55)');
                expectColor(report, 'venn', 'fill:rgb(164, 0, 0)');
                expectColor(report, 'sequenceDiagram', 'fill:rgb(17, 17, 19)');
            } else {
                expectColor(report, 'flowchart', 'fill:rgb(236, 236, 255)');
                expectColor(report, 'flowchart', 'stroke:rgb(147, 112, 219)');
                expectColor(report, 'gitGraph', 'fill:rgb(0, 0, 236)');
                expectColor(report, 'pie', 'fill:rgb(236, 236, 255)');
                expectColor(report, 'venn', 'fill:rgb(255, 255, 69)');
                expectColor(report, 'sequenceDiagram', 'fill:rgb(236, 236, 255)');
            }
        } finally {
            await app.close();
        }
    });
}
