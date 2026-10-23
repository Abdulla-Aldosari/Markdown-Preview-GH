/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebaseReference } from '../src/url-rebase.mts';

const output = 'file:///d:/ws/out/';

test('a file in the output folder becomes a bare file name', () => {
    assert.equal(rebaseReference('file:///d:/ws/out/a.md', output), 'a.md');
});

test('a file in a child folder keeps the sub path', () => {
    assert.equal(rebaseReference('file:///d:/ws/out/sub/a.md', output), 'sub/a.md');
});

test('a file in a parent folder climbs out', () => {
    assert.equal(rebaseReference('file:///d:/ws/a.md', output), '../a.md');
    assert.equal(rebaseReference('file:///d:/other/a.md', output), '../../other/a.md');
});

test('the query and the fragment survive', () => {
    assert.equal(rebaseReference('file:///d:/ws/a.md?x=1#part', output), '../a.md?x=1#part');
});

test('the output folder itself is the current folder', () => {
    assert.equal(rebaseReference('file:///d:/ws/out/', output), './');
});

test('percent-encoded names stay encoded and still match their folders', () => {
    assert.equal(rebaseReference('file:///d:/ws/out/with%20space.md', output), 'with%20space.md');
    assert.equal(rebaseReference('file:///d:/ws/My%20Out/a.md', 'file:///d:/ws/My%20Out/'), 'a.md');
});

test('a different drive stays absolute, a different case of the same drive does not', () => {
    assert.equal(rebaseReference('file:///e:/ws/a.md', output), 'file:///e:/ws/a.md');
    assert.equal(rebaseReference('file:///D:/ws/a.md', output), '../a.md');
    assert.equal(rebaseReference('file:///d%3A/ws/a.md', output), '../a.md');
});

test('another scheme or host stays absolute', () => {
    assert.equal(rebaseReference('https://example.com/a', output), 'https://example.com/a');
    assert.equal(rebaseReference('vscode-vfs://github/o/r/a.md', 'file:///d:/ws/out/'), 'vscode-vfs://github/o/r/a.md');
    assert.equal(rebaseReference('vscode-vfs://github/o/r/a.md', 'vscode-vfs://gitlab/o/r/'), 'vscode-vfs://github/o/r/a.md');
});

test('virtual file systems rebase like file URLs', () => {
    assert.equal(rebaseReference('vscode-vfs://github/o/r/docs/a.md', 'vscode-vfs://github/o/r/out/'), '../docs/a.md');
});

test('references that are not absolute URLs are returned as they are', () => {
    for (const reference of ['#part', './a.md', 'a.md', '/abs/a.md', '', 'mailto:a@b.c']) {
        assert.equal(rebaseReference(reference, output), reference);
    }
});

test('an invalid output folder leaves the reference as it is', () => {
    assert.equal(rebaseReference('file:///d:/ws/a.md', 'not a url'), 'file:///d:/ws/a.md');
});
