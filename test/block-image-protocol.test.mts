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
    blockImageRadiusMax,
    blockImageScales,
    blockKinds,
    blockLabels,
    copyImageCommandId,
    decodeCaptureId,
    defaultBlockImageRadius,
    defaultBlockImageScale,
    encodeCaptureId,
    isBlockImageRadius,
    isBlockImageScale,
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

test('a capture id round-trips for every kind, position, scale, and radius', () => {
    for (const kind of blockKinds) {
        for (const index of [0, 1, 17, 999_999_999]) {
            for (const scale of blockImageScales) {
                for (const radius of [0, 10, 16]) {
                    assert.deepEqual(decodeCaptureId(encodeCaptureId({ kind, index }, scale, radius)), { kind, index, scale, radius });
                }
            }
        }
    }
});

test('the capture id carries the scale and radius as the host wrote them', () => {
    assert.equal(encodeCaptureId({ kind: 'table', index: 3 }, 1, 10), 'mpgh-capture:table:3:1:10');
    assert.equal(encodeCaptureId({ kind: 'section', index: 0 }, 2.5, 0), 'mpgh-capture:section:0:2.5:0');
});

test('decodeCaptureId ignores the ids of the built-in image copy and anything malformed', () => {
    const rejected: unknown[] = [
        'image-0',
        '',
        'mpgh-capture:',
        'mpgh-capture:table',
        'mpgh-capture:table:',
        'mpgh-capture:table:0',
        'mpgh-capture:table:0:',
        'mpgh-capture:table:-1:1',
        'mpgh-capture:table:1.5:1',
        'mpgh-capture:table:1e3:1',
        'mpgh-capture:table:1000000000:1',
        'mpgh-capture:image:0:1',
        'MPGH-CAPTURE:table:0:1',
        ' mpgh-capture:table:0:1',
        'mpgh-capture:table:0:1 ',
        'mpgh-capture:table:0:0',
        'mpgh-capture:table:0:4',
        'mpgh-capture:table:0:1.25',
        'mpgh-capture:table:0:9',
        'mpgh-capture:table:0:-1',
        'mpgh-capture:table:0:1e0',
        'mpgh-capture:table:0:1:',
        'mpgh-capture:table:0:1:17',
        'mpgh-capture:table:0:1:100',
        'mpgh-capture:table:0:1:-1',
        'mpgh-capture:table:0:1:1.5',
        'mpgh-capture:table:0:1:0 ',
        undefined,
        null,
        7,
        {},
    ];
    for (const id of rejected) {
        assert.equal(decodeCaptureId(id), null, String(id));
    }
});

test('the allowed scales are 1, 1.5, 2, 2.5, and 3, and the default is the actual size', () => {
    assert.deepEqual([...blockImageScales], [1, 1.5, 2, 2.5, 3]);
    assert.equal(defaultBlockImageScale, 1);
    for (const scale of blockImageScales) {
        assert.equal(isBlockImageScale(scale), true, String(scale));
    }
    for (const value of [0, 0.5, 1.25, 4, -1, Number.NaN, Number.POSITIVE_INFINITY, '2', null, undefined, {}]) {
        assert.equal(isBlockImageScale(value), false, String(value));
    }
});

test('the corner radius is a whole number from 0 to the padding, and the default is 10', () => {
    assert.equal(defaultBlockImageRadius, 10);
    assert.equal(blockImageRadiusMax, 16);
    for (const radius of [0, 1, 10, 16]) {
        assert.equal(isBlockImageRadius(radius), true, String(radius));
    }
    for (const value of [-1, 17, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '10', null, undefined, {}]) {
        assert.equal(isBlockImageRadius(value), false, String(value));
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
