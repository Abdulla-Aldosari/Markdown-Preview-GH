/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    blockCommandIds,
    blockKinds,
    blockLabels,
    copyImageCommandId,
    decodeCaptureId,
    encodeCaptureId,
    isBlockKind,
    isCopyImageAvailable,
    readBlockRequest,
} from '../src/block-image-protocol.mts';

test('every block kind has a command id and a label', () => {
    assert.deepEqual(Object.keys(blockCommandIds).sort(), [...blockKinds].sort());
    assert.deepEqual(Object.keys(blockLabels).sort(), [...blockKinds].sort());
    assert.equal(new Set(Object.values(blockCommandIds)).size, blockKinds.length);
});

test('isBlockKind accepts only the known kinds', () => {
    for (const kind of blockKinds) {
        assert.equal(isBlockKind(kind), true);
    }
    for (const value of ['', 'image', 'Table', undefined, null, 3, {}]) {
        assert.equal(isBlockKind(value), false);
    }
});

test('a capture id round-trips for every kind and position', () => {
    for (const kind of blockKinds) {
        for (const index of [0, 1, 17, 999_999_999]) {
            assert.deepEqual(decodeCaptureId(encodeCaptureId({ kind, index })), { kind, index });
        }
    }
});

test('decodeCaptureId ignores the ids of the built-in image copy and anything malformed', () => {
    const rejected: unknown[] = [
        'image-0',
        '',
        'mpgh-capture:',
        'mpgh-capture:table',
        'mpgh-capture:table:',
        'mpgh-capture:table:-1',
        'mpgh-capture:table:1.5',
        'mpgh-capture:table:1e3',
        'mpgh-capture:table:1000000000',
        'mpgh-capture:image:0',
        'MPGH-CAPTURE:table:0',
        ' mpgh-capture:table:0',
        'mpgh-capture:table:0 ',
        undefined,
        null,
        7,
        {},
    ];
    for (const id of rejected) {
        assert.equal(decodeCaptureId(id), null, String(id));
    }
});

test('readBlockRequest reads the merged context of the clicked block', () => {
    const args = { resource: 'file:///d%3A/ws/a.md', mpghBlock: 'table', mpghIndex: 2, webview: 'markdown.preview', preventDefaultContextMenuItems: false };
    assert.deepEqual(readBlockRequest(args, 'table'), { resource: 'file:///d%3A/ws/a.md', kind: 'table', index: 2 });
});

test('readBlockRequest rejects a context of another kind and every incomplete or invalid one', () => {
    const good = { resource: 'file:///a.md', mpghBlock: 'code', mpghIndex: 0 };
    assert.notEqual(readBlockRequest(good, 'code'), null);
    assert.equal(readBlockRequest(good, 'table'), null, 'kind mismatch');
    const broken: unknown[] = [
        undefined,
        null,
        'text',
        42,
        {},
        { ...good, resource: '' },
        { ...good, resource: 5 },
        { mpghBlock: 'code', mpghIndex: 0 },
        { resource: 'file:///a.md', mpghBlock: 'code' },
        { ...good, mpghIndex: -1 },
        { ...good, mpghIndex: 1.5 },
        { ...good, mpghIndex: '1' },
        { ...good, mpghIndex: Number.NaN },
        { ...good, mpghIndex: Number.MAX_SAFE_INTEGER + 1 },
    ];
    for (const value of broken) {
        assert.equal(readBlockRequest(value, 'code'), null, JSON.stringify(value));
    }
});

test('isCopyImageAvailable looks for the preview command in the command list', () => {
    assert.equal(isCopyImageAvailable(['a', copyImageCommandId, 'b']), true);
    assert.equal(isCopyImageAvailable(['a', 'b']), false);
    assert.equal(isCopyImageAvailable([]), false);
    assert.equal(isCopyImageAvailable(['markdown.copyImage', '_markdown.copyImage2']), false);
});
