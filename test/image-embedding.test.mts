/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { imageMimeType, isEmbeddableUrl, loadImages, toBase64, type ImageSource } from '../src/image-embedding.mts';

function memorySource(files: Record<string, Uint8Array>): ImageSource & { reads: string[] } {
    const reads: string[] = [];
    return {
        reads,
        async size(url) {
            const file = files[url];
            if (!file) {
                throw new Error('missing');
            }
            return file.length;
        },
        async read(url) {
            reads.push(url);
            const file = files[url];
            if (!file) {
                throw new Error('missing');
            }
            return file;
        },
    };
}

test('toBase64 matches Buffer for random bytes of every size around the chunk boundary', () => {
    for (const length of [0, 1, 2, 3, 100, 0x7fff, 0x8000, 0x8001, 0x10000, 100_003]) {
        const bytes = new Uint8Array(randomBytes(length));
        assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'), `length ${length}`);
    }
});

test('imageMimeType maps every supported extension, ignoring case, query, and fragment', () => {
    const expected: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        avif: 'image/avif',
        bmp: 'image/bmp',
        ico: 'image/x-icon',
    };
    for (const [extension, mime] of Object.entries(expected)) {
        assert.equal(imageMimeType(`file:///d:/a.${extension}`), mime);
        assert.equal(imageMimeType(`file:///d:/a.${extension.toUpperCase()}?v=1#x`), mime);
    }
    assert.equal(imageMimeType('file:///d:/a.txt'), undefined);
    assert.equal(imageMimeType('file:///d:/noextension'), undefined);
    assert.equal(imageMimeType('file:///d:/dir.png/file'), undefined);
});

test('isEmbeddableUrl accepts files and virtual file systems, never the web or inline data', () => {
    assert.equal(isEmbeddableUrl('file:///d:/a.png'), true);
    assert.equal(isEmbeddableUrl('vscode-vfs://github/o/r/a.png'), true);
    assert.equal(isEmbeddableUrl('https://example.com/a.png'), false);
    assert.equal(isEmbeddableUrl('http://example.com/a.png'), false);
    assert.equal(isEmbeddableUrl('HTTPS://example.com/a.png'), false);
    assert.equal(isEmbeddableUrl('data:image/png;base64,AAAA'), false);
    assert.equal(isEmbeddableUrl('assets/a.png'), false);
});

test('loadImages embeds each readable image as a data URI', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = await loadImages(['file:///a.png'], memorySource({ 'file:///a.png': png }));
    assert.equal(result.dataUris.get('file:///a.png'), `data:image/png;base64,${Buffer.from(png).toString('base64')}`);
    assert.deepEqual(result.failures, []);
});

test('loadImages reads each distinct file once', async () => {
    const source = memorySource({ 'file:///a.png': new Uint8Array([1]) });
    const result = await loadImages(['file:///a.png', 'file:///a.png', 'file:///a.png'], source);
    assert.deepEqual(source.reads, ['file:///a.png']);
    assert.equal(result.dataUris.size, 1);
});

test('loadImages reports a missing file and an unknown extension without throwing', async () => {
    const result = await loadImages(['file:///gone.png', 'file:///a.txt'], memorySource({ 'file:///a.txt': new Uint8Array([1]) }));
    assert.equal(result.dataUris.size, 0);
    assert.deepEqual(
        result.failures.map((failure) => failure.url),
        ['file:///gone.png', 'file:///a.txt']
    );
});

test('loadImages skips an image over the size cap and never reads it', async () => {
    const source = memorySource({ 'file:///big.png': new Uint8Array(11), 'file:///small.png': new Uint8Array(10) });
    const result = await loadImages(['file:///big.png', 'file:///small.png'], source, 10);
    assert.deepEqual([...result.dataUris.keys()], ['file:///small.png']);
    assert.deepEqual(source.reads, ['file:///small.png']);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].url, 'file:///big.png');
});
