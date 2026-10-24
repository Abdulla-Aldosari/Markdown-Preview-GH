/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeProtocolRelative, resolveDocumentUrls, type UrlResolutionBases } from '../src/url-resolution.mts';

const documentDirUrl = 'file:///d%3A/ws/docs/';
const workspaceFolderUrl = 'file:///d%3A/ws/';
const dir: UrlResolutionBases = { documentDirUrl, workspaceFolderUrl };

/** Resolves a single `<img src>` reference and returns the resulting value. */
function imgSrc(reference: string): string {
    const html = resolveDocumentUrls(`<img src="${reference}">`, dir);
    const match = /src="([^"]*)"/.exec(html);
    assert.ok(match, `unexpected output: ${html}`);
    return match[1];
}

test('in-page anchors are never touched', () => {
    const html = '<a href="#section">a</a><a href="#">b</a>';
    assert.equal(resolveDocumentUrls(html, dir), html);
});

test('relative paths resolve against the document folder', () => {
    assert.equal(imgSrc('./img.png'), 'file:///d%3A/ws/docs/img.png');
    assert.equal(imgSrc('sub/a.png'), 'file:///d%3A/ws/docs/sub/a.png');
    assert.equal(imgSrc('../a.png'), 'file:///d%3A/ws/a.png');
});

test('the engine output for a workspace-root path becomes a file URL', () => {
    assert.equal(imgSrc('/d:/ws/img.png'), 'file:///d:/ws/img.png');
});

test('sibling document links keep their fragment', () => {
    const html = resolveDocumentUrls('<a href="other.md#part">x</a>', dir);
    assert.equal(html, '<a href="file:///d%3A/ws/docs/other.md#part">x</a>');
});

test('references that carry a scheme stay unchanged', () => {
    for (const reference of ['https://example.com/a.png', 'http://example.com/a.png', 'data:image/png;base64,AAAA', 'mailto:a@b.c', 'file:///x/a.png', 'vscode-resource:/a.png']) {
        assert.equal(imgSrc(reference), reference);
    }
});

test('protocol-relative references get the https protocol', () => {
    assert.equal(imgSrc('//host/x.png'), 'https://host/x.png');
    assert.equal(resolveDocumentUrls('<a href="//example.com/path">x</a>', dir), '<a href="https://example.com/path">x</a>');
    assert.equal(resolveDocumentUrls('<a href="//example.com/path?q=1#part">x</a>', dir), '<a href="https://example.com/path?q=1#part">x</a>');
});

test('protocol-relative references are completed in srcset candidates and from data-src', () => {
    assert.equal(resolveDocumentUrls('<img srcset="//h.com/a.png 1x, b.png 2x">', dir), '<img srcset="https://h.com/a.png 1x, file:///d%3A/ws/docs/b.png 2x">');
    assert.equal(resolveDocumentUrls('<img src="x" data-src="//h.com/a.png">', dir), '<img src="https://h.com/a.png" data-src="//h.com/a.png">');
});

test('a reference with an empty host is not protocol-relative', () => {
    assert.equal(completeProtocolRelative('///x.png'), '///x.png');
    assert.equal(completeProtocolRelative('//'), '//');
    assert.equal(completeProtocolRelative('/x.png'), '/x.png');
    assert.equal(completeProtocolRelative('a//b'), 'a//b');
    assert.equal(completeProtocolRelative('https://h.com/a'), 'https://h.com/a');
});

test('completeProtocolRelative ignores surrounding whitespace', () => {
    assert.equal(completeProtocolRelative('  //host/x.png '), 'https://host/x.png');
});

test('Windows absolute paths become file URLs', () => {
    assert.equal(imgSrc('D:/ws/x.png'), 'file:///D:/ws/x.png');
    assert.equal(imgSrc('D:\\ws\\x.png'), 'file:///D:/ws/x.png');
});

test('a document that is not a file URI resolves no path', () => {
    const html = '<img src="./a.png"><a href="b.md">b</a>';
    assert.equal(resolveDocumentUrls(html, undefined), html);
});

test('a document that is not a file URI still completes protocol-relative references', () => {
    assert.equal(resolveDocumentUrls('<a href="//example.com/p">x</a><a href="b.md">y</a>', undefined), '<a href="https://example.com/p">x</a><a href="b.md">y</a>');
});

test('srcset resolves every candidate and keeps descriptors', () => {
    const html = resolveDocumentUrls('<img srcset="a.png 1x, sub/b.png 2x, https://e.com/c.png 3x">', dir);
    assert.equal(html, '<img srcset="file:///d%3A/ws/docs/a.png 1x, file:///d%3A/ws/docs/sub/b.png 2x, https://e.com/c.png 3x">');
});

test('srcset without descriptors and source elements resolve', () => {
    const html = resolveDocumentUrls('<picture><source srcset="a.png, b.png 2x" src="c.png"></picture>', dir);
    assert.equal(html, '<picture><source srcset="file:///d%3A/ws/docs/a.png, file:///d%3A/ws/docs/b.png 2x" src="file:///d%3A/ws/docs/c.png"></picture>');
});

test('video and audio attributes resolve', () => {
    const html = resolveDocumentUrls('<video src="v.mp4" poster="p.png"></video><audio src="a.mp3"></audio>', dir);
    assert.equal(html, '<video src="file:///d%3A/ws/docs/v.mp4" poster="file:///d%3A/ws/docs/p.png"></video><audio src="file:///d%3A/ws/docs/a.mp3"></audio>');
});

test('encoded spaces and non-Latin names resolve to the same file', () => {
    assert.equal(imgSrc('my%20pic.png'), 'file:///d%3A/ws/docs/my%20pic.png');
    assert.equal(imgSrc('my pic.png'), 'file:///d%3A/ws/docs/my%20pic.png');
    const arabic = imgSrc('صورة.png');
    assert.equal(arabic, 'file:///d%3A/ws/docs/%D8%B5%D9%88%D8%B1%D8%A9.png');
    assert.equal(imgSrc('%D8%B5%D9%88%D8%B1%D8%A9.png'), arabic);
});

test('all three attribute quoting styles are supported', () => {
    assert.equal(resolveDocumentUrls('<img src="a.png">', dir), '<img src="file:///d%3A/ws/docs/a.png">');
    assert.equal(resolveDocumentUrls("<img src='a.png'>", dir), '<img src="file:///d%3A/ws/docs/a.png">');
    assert.equal(resolveDocumentUrls('<img src=a.png alt=x>', dir), '<img src="file:///d%3A/ws/docs/a.png" alt=x>');
});

test('attribute names are matched exactly', () => {
    assert.equal(resolveDocumentUrls('<img data-original="a.png" src="b.png">', dir), '<img data-original="a.png" src="file:///d%3A/ws/docs/b.png">');
});

test('HTML entities in a reference are decoded before resolving and encoded after', () => {
    const html = resolveDocumentUrls('<img src="a.png?x=1&amp;y=2">', dir);
    assert.equal(html, '<img src="file:///d%3A/ws/docs/a.png?x=1&amp;y=2">');
});

test('a quoted > inside another attribute does not end the tag', () => {
    const html = resolveDocumentUrls('<img alt="a > b" src="a.png">', dir);
    assert.equal(html, '<img alt="a > b" src="file:///d%3A/ws/docs/a.png">');
});

test('src= inside pre, code, script, style, and comments stays unchanged', () => {
    const html = [
        '<pre><code>&lt;img src="a.png"&gt;</code></pre>',
        '<code><img src="a.png"></code>',
        '<script>var s = \'<img src="a.png">\';</script>',
        '<style>.x { content: "<img src=a.png>"; }</style>',
        '<!-- <img src="a.png"> -->',
    ].join('');
    assert.equal(resolveDocumentUrls(html, dir), html);
});

test('content after a raw element is still rewritten', () => {
    const html = resolveDocumentUrls('<pre><img src="a.png"></pre><img src="b.png">', dir);
    assert.equal(html, '<pre><img src="a.png"></pre><img src="file:///d%3A/ws/docs/b.png">');
});

test('unrelated tags and plain text are untouched', () => {
    const html = '<p>1 < 2 and <b class="x">bold</b></p><link href="style.css">';
    assert.equal(resolveDocumentUrls(html, dir), html);
});

test('an unterminated tag is left as it is', () => {
    const html = '<p>x</p><img src="a.png';
    assert.equal(resolveDocumentUrls(html, dir), html);
});

/** Resolves one `<img>` and returns its final `src`. */
function finalSrc(tag: string, bases = dir): string {
    const match = /\ssrc="([^"]*)"/.exec(resolveDocumentUrls(tag, bases));
    assert.ok(match, `no src in ${tag}`);
    return match[1];
}

test('a workspace-root path resolves against the workspace folder, not the document folder', () => {
    assert.equal(imgSrc('/assets/sample.png'), 'file:///d%3A/ws/assets/sample.png');
});

test('a workspace-root path stays as it is when there is no workspace folder', () => {
    const bases = { documentDirUrl };
    assert.equal(finalSrc('<img src="/x.png">', bases), '/x.png');
    assert.equal(finalSrc('<img src="/x.png" data-src="/x.png">', bases), '/x.png');
});

test('data-src decides the result whatever shape the cached src has', () => {
    const expected = 'file:///d%3A/ws/assets/sample.png';
    const shapes = [
        '/assets/sample.png',
        '/d:/ws/assets/sample.png',
        'https://file+.vscode-resource.vscode-cdn.net/d:/ws/assets/sample.png',
        'https://file%2B.vscode-resource.vscode-cdn.net/d%3A/ws/assets/sample.png',
    ];
    for (const src of shapes) {
        assert.equal(finalSrc(`<img src="${src}" alt="x" data-src="/assets/sample.png">`), expected, src);
    }
});

test('data-src with a relative path resolves against the document folder', () => {
    const tag = '<img src="https://file+.vscode-resource.vscode-cdn.net/x" data-src="./assets/a b.png">';
    assert.equal(finalSrc(tag), 'file:///d%3A/ws/docs/assets/a%20b.png');
});

test('data-src keeps remote and data references untouched', () => {
    assert.equal(finalSrc('<img src="https://e.com/a.png" data-src="https://e.com/a.png">'), 'https://e.com/a.png');
    assert.equal(finalSrc('<img src="data:image/png;base64,AAAA" data-src="data:image/png;base64,AAAA">'), 'data:image/png;base64,AAAA');
});

test('data-src with a file URL replaces a rewritten src with that file URL', () => {
    const tag = '<img src="https://file+.vscode-resource.vscode-cdn.net/d:/p/a.png" data-src="file:///d:/p/a.png">';
    assert.equal(finalSrc(tag), 'file:///d:/p/a.png');
});

test('data-src is read from any attribute order and quoting', () => {
    assert.equal(finalSrc(`<img data-src='/assets/s.png' src="/d:/ws/assets/s.png">`), 'file:///d%3A/ws/assets/s.png');
    assert.equal(finalSrc('<img data-src=/assets/s.png src=bad>'), 'file:///d%3A/ws/assets/s.png');
});

test('data-src on tags other than img is ignored', () => {
    const html = resolveDocumentUrls('<a data-src="/x.png" href="y.md">y</a>', dir);
    assert.equal(html, '<a data-src="/x.png" href="file:///d%3A/ws/docs/y.md">y</a>');
});
