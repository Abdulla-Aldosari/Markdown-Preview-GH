/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

interface MenuEntry {
    command?: string;
    submenu?: string;
    when?: string;
}

const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    contributes: { menus: Record<string, MenuEntry[]>; commands: { command: string }[]; submenus: { id: string; label: string }[] };
};
const entries = manifest.contributes.menus['webview/context'];
const exportEntries = manifest.contributes.menus['markdown-preview-gh.exportAs'];

test('the preview context menu lists every command outside the Export As submenu', () => {
    const inSubmenu = new Set(exportEntries.map((item) => item.command));
    const commands = manifest.contributes.commands
        .map((item) => item.command)
        .filter((command) => !inSubmenu.has(command))
        .sort();
    const listed = entries
        .map((item) => item.command)
        .filter((command): command is string => command !== undefined)
        .sort();
    assert.deepEqual(listed, commands);
});

test('every preview context menu entry is hidden while the image viewer layer is under the pointer', () => {
    for (const entry of entries) {
        const name = entry.command ?? entry.submenu;
        assert.ok(entry.when, `${name} needs a when clause`);
        assert.match(entry.when, /^webviewId == 'markdown\.preview' && !mpghViewer( &&|$)/, `${name} must carry !mpghViewer`);
    }
});

test('the Export As submenu is declared once and hangs off the preview context menu', () => {
    const submenus = manifest.contributes.submenus.filter((item) => item.id === 'markdown-preview-gh.exportAs');
    assert.deepEqual(submenus, [{ id: 'markdown-preview-gh.exportAs', label: 'Export As...' }]);
    assert.equal(entries.filter((item) => item.submenu === 'markdown-preview-gh.exportAs').length, 1);
});

test('the Export As submenu lists the four formats in order, PDF desktop only and PNG hidden until it ships', () => {
    assert.deepEqual(
        exportEntries.map((item) => item.command),
        ['markdown-preview-gh.exportHtmlLight', 'markdown-preview-gh.exportHtmlDark', 'markdown-preview-gh.exportPdf', 'markdown-preview-gh.exportPng']
    );
    const byCommand = new Map(exportEntries.map((item) => [item.command, item.when]));
    assert.equal(byCommand.get('markdown-preview-gh.exportPdf'), '!isWeb', 'PDF needs a desktop browser');
    assert.equal(byCommand.get('markdown-preview-gh.exportPng'), 'false', 'PNG stays hidden');
});

test('the PDF command is listed in the Command Palette for Markdown files on desktop only', () => {
    const palette = manifest.contributes.menus['commandPalette'];
    assert.equal(palette.find((item) => item.command === 'markdown-preview-gh.exportPdf')?.when, 'editorLangId == markdown && !isWeb');
});
