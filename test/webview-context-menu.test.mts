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
    command: string;
    when?: string;
}

const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    contributes: { menus: Record<string, MenuEntry[]>; commands: { command: string }[] };
};
const entries = manifest.contributes.menus['webview/context'];

test('the preview context menu lists every command of the extension', () => {
    const commands = manifest.contributes.commands.map((item) => item.command).sort();
    const listed = entries.map((item) => item.command).sort();
    assert.deepEqual(listed, commands);
});

test('every preview context menu entry is hidden while the image viewer layer is under the pointer', () => {
    for (const entry of entries) {
        assert.ok(entry.when, `${entry.command} needs a when clause`);
        assert.match(entry.when, /^webviewId == 'markdown\.preview' && !mpghViewer( &&|$)/, `${entry.command} must carry !mpghViewer`);
    }
});
