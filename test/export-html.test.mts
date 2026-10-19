import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHtml, escapeHtml, exportFileName, forceLightTheme, toLocalFileUri } from '../src/export-html.mts';

interface FakeUri {
    scheme: string;
    path: string;
    with(change: { scheme?: string; path?: string }): FakeUri;
}

/**
 * Minimal stand-in for `vscode.Uri`, exposing only what `toLocalFileUri` uses.
 */
function fakeUri(scheme: string, path: string): FakeUri {
    return {
        scheme,
        path,
        with(change) {
            return fakeUri(change.scheme ?? scheme, change.path ?? path);
        },
    };
}

test('toLocalFileUri keeps file URIs as they are', () => {
    const uri = fakeUri('file', '/c:/a/b.html');
    assert.equal(toLocalFileUri(uri), uri);
});

test('toLocalFileUri maps vscode-userdata URIs to file URIs with the same path', () => {
    const result = toLocalFileUri(fakeUri('vscode-userdata', '/c:/Users/x/AppData/Roaming/Code/User/globalStorage/ext/a.html'));
    assert.ok(result);
    assert.equal(result.scheme, 'file');
    assert.equal(result.path, '/c:/Users/x/AppData/Roaming/Code/User/globalStorage/ext/a.html');
});

test('toLocalFileUri rejects schemes that are not on the local disk', () => {
    assert.equal(toLocalFileUri(fakeUri('vscode-remote', '/a.html')), undefined);
    assert.equal(toLocalFileUri(fakeUri('https', '/a.html')), undefined);
});

const renderedBody = `<div
            class="mpgh-body"
            dir="rtl"
            data-vscode-context='{}'
            data-theme-mode="dark"
        >
            <div class="mpgh-content" data-content-width="wide"><p data-theme-mode="dark">Hi</p></div>
        </div>`;

test('escapeHtml escapes all HTML-significant characters', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('forceLightTheme pins only the root container to the light theme', () => {
    const result = forceLightTheme(renderedBody);
    assert.match(result, /class="mpgh-body"[^>]*data-theme-mode="light"/);
    assert.match(result, /dir="rtl"/);
    assert.match(result, /data-content-width="wide"/);
    assert.match(result, /<p data-theme-mode="dark">/, 'user content must not be rewritten');
});

test('forceLightTheme leaves unexpected markup untouched', () => {
    const html = '<p data-theme-mode="dark">x</p>';
    assert.equal(forceLightTheme(html), html);
});

test('buildStandaloneHtml produces a light, escaped, self-contained page', () => {
    const html = buildStandaloneHtml({
        title: 'a<b>.md',
        bodyHtml: renderedBody,
        css: 'body { color: red; } </style><script>x</script>',
        baseHref: 'file:///c%3A/docs/"x"/',
    });
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<title>a&lt;b&gt;\.md<\/title>/);
    assert.match(html, /<base href="file:\/\/\/c%3A\/docs\/&quot;x&quot;\/">/);
    assert.match(html, /<body class="vscode-body vscode-light">/);
    assert.equal((html.match(/<\/style>/g) || []).length, 1, 'CSS must not close the style element');
    assert.doesNotMatch(html, /window\.print/);
});

test("buildStandaloneHtml wraps the content in VS Code's own .markdown-body container", () => {
    // VS Code's live preview wraps markdown-it's output in <div class="markdown-body">
    // (see documentRenderer.ts, renderBody()). Every CSS custom property the
    // GitHub theme stylesheets rely on (--base-size-16, --bgColor-*, etc.) is
    // declared exclusively on selectors scoped to .markdown-body, so the
    // exported/printed page must reproduce this wrapper or those variables
    // resolve to nothing, breaking spacing (e.g. code block padding).
    const html = buildStandaloneHtml({ title: 't', bodyHtml: renderedBody, css: '' });
    assert.match(html, /<div class="markdown-body" dir="auto">\s*<div\s+class="mpgh-body"/);
    assert.match(html, /<p data-theme-mode="dark">Hi<\/p>\s*<\/div>\s*<\/div>/, 'markdown-body must close after mpgh-body');
});

test('buildStandaloneHtml adds the print script only when requested', () => {
    const html = buildStandaloneHtml({ title: 't', bodyHtml: '', css: '', autoPrint: true });
    assert.match(html, /window\.addEventListener\('load', \(\) => window\.print\(\)\)/);
    assert.doesNotMatch(html, /<base /);
});

test('exportFileName is stable per source and safe for the file system', () => {
    const a = exportFileName('file:///c%3A/docs/My%20Notes.md', 'My Notes.md');
    const b = exportFileName('file:///c%3A/docs/My%20Notes.md', 'My Notes.md');
    const c = exportFileName('file:///c%3A/other/My%20Notes.md', 'My Notes.md');
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^My-Notes-[0-9a-f]{8}\.html$/);
    // Non-Latin letters (here: an Arabic word) must be preserved, not stripped.
    const nonLatinStem = '\u0645\u0644\u0627\u062d\u0638\u0627\u062a';
    assert.match(exportFileName('x', `${nonLatinStem}.md`), new RegExp(`^${nonLatinStem}-[0-9a-f]{8}\\.html$`, 'u'));
    assert.match(exportFileName('x', '???.md'), /^document-[0-9a-f]{8}\.html$/);
});
