/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCdpClient, createFrameDecoder, encodeMessage } from '../src/headless/cdp-pipe.mts';

const encoder = new TextEncoder();

test('encodeMessage ends the JSON with a NUL delimiter', () => {
    assert.equal(encodeMessage({ id: 1, method: 'A.b' }), '{"id":1,"method":"A.b"}\0');
});

test('the frame decoder returns only complete messages', () => {
    const decoder = createFrameDecoder();
    assert.deepEqual(decoder.push(encoder.encode('{"a":1}\0{"b"')), ['{"a":1}']);
    assert.deepEqual(decoder.push(encoder.encode(':2}\0')), ['{"b":2}']);
    assert.deepEqual(decoder.push(encoder.encode('')), []);
});

test('the frame decoder handles a multi-byte character split across chunks', () => {
    const decoder = createFrameDecoder();
    const bytes = encoder.encode('{"t":"مرحبا"}\0');
    const cut = bytes.indexOf(0xd9) + 1;
    assert.deepEqual(decoder.push(bytes.slice(0, cut)), []);
    assert.deepEqual(decoder.push(bytes.slice(cut)), ['{"t":"مرحبا"}']);
});

test('the frame decoder returns several messages from one chunk and skips empty ones', () => {
    const decoder = createFrameDecoder();
    assert.deepEqual(decoder.push(encoder.encode('{"a":1}\0\0{"b":2}\0')), ['{"a":1}', '{"b":2}']);
});

test('a response resolves the command with the matching id', async () => {
    const written: string[] = [];
    const client = createCdpClient((text) => written.push(text));
    const first = client.send<{ n: number }>('A.one');
    const second = client.send<{ n: number }>('A.two', { x: 1 }, 'session-1');
    assert.deepEqual(JSON.parse(written[0].slice(0, -1)), { id: 1, method: 'A.one', params: {} });
    assert.deepEqual(JSON.parse(written[1].slice(0, -1)), { id: 2, method: 'A.two', params: { x: 1 }, sessionId: 'session-1' });
    client.receive(encoder.encode('{"id":2,"result":{"n":2}}\0{"id":1,"result":{"n":1}}\0'));
    assert.deepEqual(await first, { n: 1 });
    assert.deepEqual(await second, { n: 2 });
});

test('an error response rejects the command with the method and message', async () => {
    const client = createCdpClient(() => undefined);
    const pending = client.send('Page.navigate');
    client.receive(encoder.encode('{"id":1,"error":{"code":-32000,"message":"Cannot navigate"}}\0'));
    await assert.rejects(pending, /Page\.navigate: Cannot navigate/);
});

test('events, malformed messages, and unknown ids are ignored', async () => {
    const client = createCdpClient(() => undefined);
    const pending = client.send('A.b');
    client.receive(encoder.encode('{"method":"Page.loadEventFired","params":{}}\0not json\0{"id":99,"result":{}}\0'));
    client.receive(encoder.encode('{"id":1,"result":{"ok":true}}\0'));
    assert.deepEqual(await pending, { ok: true });
});

test('close rejects pending commands and refuses new ones', async () => {
    const client = createCdpClient(() => undefined);
    const pending = client.send('A.b');
    client.close(new Error('gone'));
    client.close(new Error('ignored second reason'));
    await assert.rejects(pending, /gone/);
    await assert.rejects(client.send('A.c'), /gone/);
});

test('a failing write rejects the command instead of leaving it pending', async () => {
    const client = createCdpClient(() => {
        throw new Error('pipe closed');
    });
    await assert.rejects(client.send('A.b'), /pipe closed/);
});
