/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chooseOpenMode, createPageToken, matchPageRoute, pagePath, pageTokenByteLength } from '../src/page-server-routes.mts';

test('createPageToken encodes every random byte as two hex digits', () => {
    const token = createPageToken((length) => new Uint8Array(length).fill(0xab));
    assert.equal(token, 'ab'.repeat(pageTokenByteLength));
});

test('createPageToken pads small bytes and asks for the documented length', () => {
    let requested = 0;
    const token = createPageToken((length) => {
        requested = length;
        return new Uint8Array(length);
    });
    assert.equal(requested, pageTokenByteLength);
    assert.equal(token, '00'.repeat(pageTokenByteLength));
});

test('createPageToken gives different tokens for a real random source', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createPageToken(randomBytes)));
    assert.equal(tokens.size, 50);
    for (const token of tokens) {
        assert.match(token, /^[0-9a-f]{32}$/);
    }
});

test('pagePath places the token in the only served path', () => {
    assert.equal(pagePath('abc'), '/abc/index.html');
});

test('matchPageRoute matches the exact page path and ignores a query string', () => {
    assert.equal(matchPageRoute('/abc/index.html', 'abc'), 'page');
    assert.equal(matchPageRoute('/abc/index.html?x=1', 'abc'), 'page');
});

test('matchPageRoute rejects every other path', () => {
    for (const url of [
        '/',
        '/abc',
        '/abc/',
        '/abc/index.html/',
        '/abc/other.html',
        '/abd/index.html',
        '/ABC/index.html',
        '//abc/index.html',
        '/abc/../abc/index.html',
        '/x/abc/index.html',
    ]) {
        assert.equal(matchPageRoute(url, 'abc'), 'notFound', url);
    }
});

test('matchPageRoute rejects a missing URL or an empty token', () => {
    assert.equal(matchPageRoute(undefined, 'abc'), 'notFound');
    assert.equal(matchPageRoute('//index.html', ''), 'notFound');
    assert.equal(matchPageRoute('/index.html', ''), 'notFound');
});

test('chooseOpenMode opens a file locally, serves remotely, and refuses without a server', () => {
    assert.equal(chooseOpenMode(undefined, true), 'file');
    assert.equal(chooseOpenMode(undefined, false), 'file');
    assert.equal(chooseOpenMode('ssh-remote', true), 'served');
    assert.equal(chooseOpenMode('wsl', false), 'unsupported');
    assert.equal(chooseOpenMode('', true), 'file');
});
