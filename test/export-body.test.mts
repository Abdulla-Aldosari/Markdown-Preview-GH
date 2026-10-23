/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUriString, prepareExportBody } from '../src/export-body.mts';
import type { ImageSource } from '../src/image-embedding.mts';

const bases = { documentDirUrl: 'file:///d:/ws/docs/', workspaceFolderUrl: 'file:///d:/ws/' };
const outputDirUrl = 'file:///d:/ws/out/';
const png = new Uint8Array([1, 2, 3]);
const pngUri = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

function source(files: Record<string, Uint8Array>): ImageSource & { reads: string[] } {
    const reads: string[] = [];
    return {
        reads,
        async size(url) {
            if (!files[url]) {
                throw new Error('missing');
            }
            return files[url].length;
        },
        async read(url) {
            reads.push(url);
            return files[url];
        },
    };
}

test('local images become data URIs, internet and data images stay as they are', async () => {
    const html = '<img src="a.png"><img src="/b.png"><img src="https://example.com/c.png"><img src="data:image/gif;base64,R0lG">';
    const result = await prepareExportBody(html, { bases, outputDirUrl, source: source({ 'file:///d:/ws/docs/a.png': png, 'file:///d:/ws/b.png': png }) });
    assert.equal(result.html, `<img src="${pngUri}"><img src="${pngUri}"><img src="https://example.com/c.png"><img src="data:image/gif;base64,R0lG">`);
    assert.equal(result.embeddedCount, 1 + 1);
    assert.deepEqual(result.failures, []);
});

test('an image is embedded from data-src, not from a preview-only src', async () => {
    const html = '<img src="https://file+.vscode-resource.vscode-cdn.net/d%3A/ws/docs/a.png" data-src="a.png">';
    const result = await prepareExportBody(html, { bases, outputDirUrl, source: source({ 'file:///d:/ws/docs/a.png': png }) });
    assert.match(result.html, new RegExp(`src="${pngUri}"`));
    assert.doesNotMatch(result.html, /vscode-resource/);
});

test('every srcset candidate is embedded and keeps its descriptor', async () => {
    const result = await prepareExportBody('<img srcset="a.png 1x, b.png 2x">', {
        bases,
        outputDirUrl,
        source: source({ 'file:///d:/ws/docs/a.png': png, 'file:///d:/ws/docs/b.png': png }),
    });
    assert.equal(result.html, `<img srcset="${pngUri} 1x, ${pngUri} 2x">`);
});

test('the same image used twice is read once', async () => {
    const files = source({ 'file:///d:/ws/docs/a.png': png });
    await prepareExportBody('<img src="a.png"><img src="./a.png">', { bases, outputDirUrl, source: files });
    assert.deepEqual(files.reads, ['file:///d:/ws/docs/a.png']);
});

test('a missing image stays a rebased link and is reported', async () => {
    const result = await prepareExportBody('<img src="gone.png">', { bases, outputDirUrl, source: source({}) });
    assert.equal(result.html, '<img src="../docs/gone.png">');
    assert.deepEqual(
        result.failures.map((failure) => failure.url),
        ['file:///d:/ws/docs/gone.png']
    );
});

test('document links are rebased to the output folder and anchors are untouched', async () => {
    const html = '<a href="other.md#part">x</a><a href="#top">y</a><a href="https://example.com/">z</a>';
    const result = await prepareExportBody(html, { bases, outputDirUrl, source: source({}) });
    assert.equal(result.html, '<a href="../docs/other.md#part">x</a><a href="#top">y</a><a href="https://example.com/">z</a>');
});

test('a link is never embedded, even when it points at an image file', async () => {
    const files = source({ 'file:///d:/ws/docs/a.png': png });
    const result = await prepareExportBody('<a href="a.png">x</a>', { bases, outputDirUrl, source: files });
    assert.equal(result.html, '<a href="../docs/a.png">x</a>');
    assert.deepEqual(files.reads, []);
});

test('code samples that contain image tags are never read or rewritten', async () => {
    const files = source({});
    const html = '<pre><code>&lt;img src="a.png"&gt;</code></pre><code><img src="a.png"></code>';
    const result = await prepareExportBody(html, { bases, outputDirUrl, source: files });
    assert.equal(result.html, html);
    assert.deepEqual(files.reads, []);
});

test('without bases the references stay as written and no file is read', async () => {
    const files = source({});
    const html = '<img src="a.png"><a href="b.md">x</a>';
    const result = await prepareExportBody(html, { bases: undefined, outputDirUrl, source: files });
    assert.equal(result.html, html);
    assert.deepEqual(files.reads, []);
});

test('isUriString tells URIs from file system paths', () => {
    assert.equal(isUriString('file:///d:/a.html'), true);
    assert.equal(isUriString('vscode-vfs://github/o/r/a.html'), true);
    assert.equal(isUriString('d:\\out\\a.html'), false);
    assert.equal(isUriString('D:/out/a.html'), false);
    assert.equal(isUriString('/home/u/a.html'), false);
});
