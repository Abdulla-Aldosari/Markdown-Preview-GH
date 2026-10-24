/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startPageServer } from '../src/page-server.mts';

interface Reply {
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
}

function request(port: number, path: string, method = 'GET'): Promise<Reply> {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method, agent: false }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf-8') }));
        });
        req.on('error', reject);
        req.end();
    });
}

function refused(port: number): Promise<boolean> {
    return request(port, '/').then(
        () => false,
        () => true
    );
}

test('the page is served with safe headers and its exact content', async () => {
    const page = await startPageServer({ html: '<p>héllo ✓</p>' });
    try {
        const reply = await request(page.port, page.path);
        assert.equal(reply.status, 200);
        assert.equal(reply.body, '<p>héllo ✓</p>');
        assert.equal(reply.headers['content-type'], 'text/html; charset=utf-8');
        assert.equal(reply.headers['cache-control'], 'no-store');
        assert.equal(reply.headers['x-content-type-options'], 'nosniff');
        assert.equal(Number(reply.headers['content-length']), Buffer.byteLength('<p>héllo ✓</p>'));
    } finally {
        page.dispose();
        await page.closed;
    }
});

test('the server answers HEAD without a body', async () => {
    const page = await startPageServer({ html: '<p>x</p>' });
    try {
        const reply = await request(page.port, page.path, 'HEAD');
        assert.equal(reply.status, 200);
        assert.equal(reply.body, '');
    } finally {
        page.dispose();
        await page.closed;
    }
});

test('every other path returns 404 and other methods return 405', async () => {
    const page = await startPageServer({ html: '<p>x</p>' });
    try {
        for (const path of ['/', '/index.html', `${page.path}x`, '/favicon.ico']) {
            assert.equal((await request(page.port, path)).status, 404, path);
        }
        const post = await request(page.port, page.path, 'POST');
        assert.equal(post.status, 405);
        assert.equal(post.headers.allow, 'GET, HEAD');
        assert.doesNotMatch(post.body, /<p>/);
    } finally {
        page.dispose();
        await page.closed;
    }
});

test('the server listens on the loopback interface with a random token', async () => {
    const first = await startPageServer({ html: 'a' });
    const second = await startPageServer({ html: 'b' });
    try {
        assert.match(first.path, /^\/[0-9a-f]{32}\/index\.html$/);
        assert.notEqual(first.path, second.path);
        assert.notEqual(first.port, second.port);
        assert.equal((await request(first.port, second.path)).status, 404);
    } finally {
        first.dispose();
        second.dispose();
        await Promise.all([first.closed, second.closed]);
    }
});

test('the server closes after the unserved timeout', async () => {
    const page = await startPageServer({ html: 'x', unservedTimeoutMs: 40 });
    await page.closed;
    assert.equal(await refused(page.port), true);
});

test('the server closes after the served timeout once the page was fetched', async () => {
    const page = await startPageServer({ html: 'x', unservedTimeoutMs: 5_000, servedTimeoutMs: 40 });
    assert.equal((await request(page.port, page.path)).status, 200);
    await page.closed;
    assert.equal(await refused(page.port), true);
});

test('dispose closes the server at once and can be called twice', async () => {
    const page = await startPageServer({ html: 'x' });
    page.dispose();
    page.dispose();
    await page.closed;
    assert.equal(await refused(page.port), true);
});
