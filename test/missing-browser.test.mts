/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeMissingBrowser, exportHtmlLabel, followUpCommand, openInBrowserLabel, openSettingsLabel } from '../src/headless/missing-browser.mts';

test('no browser offers the three PDF alternatives in order', () => {
    const notice = describeMissingBrowser({ kind: 'notFound' }, 'PDF');
    assert.match(notice.message, /no Chromium-based browser/);
    assert.match(notice.message, /markdown-preview-gh\.export\.browserPath/);
    assert.deepEqual(notice.actions, [openSettingsLabel, exportHtmlLabel, openInBrowserLabel]);
});

test('PNG has no print-from-browser alternative', () => {
    assert.deepEqual(describeMissingBrowser({ kind: 'notFound' }, 'PNG').actions, [openSettingsLabel, exportHtmlLabel]);
});

test('a wrong setting is named with its path and never silently replaced', () => {
    const notice = describeMissingBrowser({ kind: 'settingMissing', path: 'D:\\gone\\chrome.exe' }, 'PDF');
    assert.match(notice.message, /was not found on this computer \(D:\\gone\\chrome\.exe\)/);
    assert.doesNotMatch(notice.message, /no Chromium-based browser/);
});

test('a local window says the browser is missing on this computer', () => {
    const message = describeMissingBrowser({ kind: 'notFound' }, 'PDF', { label: 'this computer', remote: false }).message;
    assert.match(message, /was found on this computer\. Install one, or set/);
    assert.doesNotMatch(message, /local computer\)|there/);
});

test('a remote window names the machine and says it is not the local computer', () => {
    const wsl = describeMissingBrowser({ kind: 'notFound' }, 'PDF', { label: 'WSL: Ubuntu-22.04', remote: true }).message;
    assert.equal(
        wsl,
        'Cannot export as PDF: no Chromium-based browser (Microsoft Edge, Google Chrome, or Chromium) was found on WSL: Ubuntu-22.04 (not on your local computer). Install one there, or set "markdown-preview-gh.export.browserPath".'
    );
    const ssh = describeMissingBrowser({ kind: 'notFound' }, 'PNG', { label: 'the SSH host "build-01"', remote: true }).message;
    assert.match(ssh, /Cannot export as PNG: .* was found on the SSH host "build-01" \(not on your local computer\)\. Install one there/);
});

test('a wrong setting in a remote window names the remote machine too', () => {
    const message = describeMissingBrowser({ kind: 'settingMissing', path: '/opt/gone' }, 'PDF', { label: 'WSL: Ubuntu-22.04', remote: true }).message;
    assert.match(message, /was not found on WSL: Ubuntu-22\.04 \(not on your local computer\) \(\/opt\/gone\)/);
});

test('every button maps to the command it runs, for the same document', () => {
    const resource = 'file:///work/readme.md';
    assert.deepEqual(followUpCommand(openSettingsLabel, resource), { command: 'workbench.action.openSettings', args: ['markdown-preview-gh.export.browserPath'] });
    assert.deepEqual(followUpCommand(exportHtmlLabel, resource), { command: 'markdown-preview-gh.exportHtmlLight', args: [{ resource }] });
    assert.deepEqual(followUpCommand(openInBrowserLabel, resource), { command: 'markdown-preview-gh.openInBrowser', args: [{ resource }] });
});

test('dismissing the notification or an unknown label runs nothing', () => {
    assert.equal(followUpCommand(undefined, 'file:///a.md'), undefined);
    assert.equal(followUpCommand('Something else', 'file:///a.md'), undefined);
});
