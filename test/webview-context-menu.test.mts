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
    contributes: { menus: Record<string, MenuEntry[]>; commands: { command: string; title?: string }[]; submenus: { id: string; label: string }[] };
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

test('the Export As submenu lists the three formats in order, PDF desktop only', () => {
    assert.deepEqual(
        exportEntries.map((item) => item.command),
        ['markdown-preview-gh.exportHtmlLight', 'markdown-preview-gh.exportHtmlDark', 'markdown-preview-gh.exportPdf']
    );
    const byCommand = new Map(exportEntries.map((item) => [item.command, item.when]));
    assert.equal(byCommand.get('markdown-preview-gh.exportPdf'), '!isWeb', 'PDF needs a desktop browser');
});

test('no whole-document PNG export is declared anywhere in the manifest', () => {
    assert.equal(
        manifest.contributes.commands.some((item) => /exportPng/.test(item.command)),
        false
    );
    assert.doesNotMatch(JSON.stringify(manifest.contributes.menus), /exportPng/);
});

const blockCommands: Array<{ kind: string; command: string; title: string }> = [
    { kind: 'table', command: 'markdown-preview-gh.copyTableAsPng', title: 'Copy This Table As PNG' },
    { kind: 'code', command: 'markdown-preview-gh.copyCodeBlockAsPng', title: 'Copy This Code Block As PNG' },
    { kind: 'diagram', command: 'markdown-preview-gh.copyDiagramAsPng', title: 'Copy This Diagram As PNG' },
    { kind: 'section', command: 'markdown-preview-gh.copySectionAsPng', title: 'Copy This Section As PNG' },
];

test('each block command is titled for its block and appears only over that kind while the preview command exists', () => {
    for (const { kind, command, title } of blockCommands) {
        assert.equal(manifest.contributes.commands.find((item) => item.command === command)?.title, title);
        const matching = entries.filter((item) => item.command === command);
        assert.equal(matching.length, 1, `${command} must have one preview context menu entry`);
        assert.equal(matching[0].when, `webviewId == 'markdown.preview' && !mpghViewer && mpghBlock == '${kind}' && markdownPreviewGh.canCopyBlockImage`, `${command} when clause`);
        const palette = manifest.contributes.menus['commandPalette'].find((item) => item.command === command);
        assert.equal(palette?.when, 'false', `${command} needs a clicked block, so the Command Palette must not list it`);
    }
});

test('the block commands, their keys, and the preview scripts agree with the source modules', async () => {
    const { blockCommandIds, blockContextKey, availabilityContextKey } = await import('../src/block-image-protocol.mts');
    assert.deepEqual(Object.values(blockCommandIds).sort(), blockCommands.map((item) => item.command).sort());
    assert.equal(blockContextKey, 'mpghBlock');
    assert.equal(availabilityContextKey, 'markdownPreviewGh.canCopyBlockImage');
    const contributes = manifest.contributes as unknown as Record<string, string[]>;
    assert.ok(contributes['markdown.previewScripts'].includes('./dist/block-image.js'));
    assert.ok(contributes['markdown.previewStyles'].includes('./dist/block-image.css'));
});

test('the PDF command is listed in the Command Palette for Markdown files on desktop only', () => {
    const palette = manifest.contributes.menus['commandPalette'];
    assert.equal(palette.find((item) => item.command === 'markdown-preview-gh.exportPdf')?.when, 'editorLangId == markdown && !isWeb');
});
