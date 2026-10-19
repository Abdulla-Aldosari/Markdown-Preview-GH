import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRendererPageHtml,
    buildStandaloneHtml,
    escapeHtml,
    exportFileName,
    forceTheme,
    parseRendererMessage,
    prepareMermaidHtml,
    toLocalFileUri,
} from '../src/export-html.mts';

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

test('forceTheme pins only the root container to the light theme', () => {
    const result = forceTheme(renderedBody, 'light');
    assert.match(result, /class="mpgh-body"[^>]*data-theme-mode="light"/);
    assert.match(result, /dir="rtl"/);
    assert.match(result, /data-content-width="wide"/);
    assert.match(result, /<p data-theme-mode="dark">/, 'user content must not be rewritten');
});

test('forceTheme pins only the root container to the dark theme', () => {
    const result = forceTheme(renderedBody, 'dark');
    assert.match(result, /class="mpgh-body"[^>]*data-theme-mode="dark"/);
    assert.match(result, /<p data-theme-mode="dark">/, 'user content must not be rewritten');
});

test('forceTheme leaves unexpected markup untouched', () => {
    const html = '<p data-theme-mode="dark">x</p>';
    assert.equal(forceTheme(html, 'dark'), html);
});

const mermaidBody = `<div class="mpgh-body" dir="ltr" data-theme-mode="auto">
    <pre class="mermaid" style="all: unset;">graph TD\n    A --&gt; B</pre>
    <div class="mermaid">sequenceDiagram\n    A-&gt;&gt;B: hi</div>
    <pre class="language-js" style="all: unset;">const x = 1;</pre>
</div>`;

test('prepareMermaidHtml strips the unset style only from Mermaid fences', () => {
    const { html, hasMermaid } = prepareMermaidHtml(mermaidBody);
    assert.equal(hasMermaid, true);
    assert.match(html, /<pre class="mermaid">graph TD/);
    assert.doesNotMatch(html, /<pre class="mermaid"[^>]*all:\s*unset/);
    assert.match(html, /<div class="mermaid">sequenceDiagram/, 'custom containers are detected but not rewritten');
    assert.match(html, /<pre class="language-js" style="all: unset;">/, 'non-Mermaid fences must keep their style');
});

test('prepareMermaidHtml reports documents without Mermaid', () => {
    const { html, hasMermaid } = prepareMermaidHtml('<p data-theme-mode="dark">x</p>');
    assert.equal(hasMermaid, false);
    assert.equal(html, '<p data-theme-mode="dark">x</p>');
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
    assert.match(html, /<meta name="color-scheme" content="light">/);
    assert.match(html, /<body class="vscode-body vscode-light">/);
    assert.match(html, /class="mpgh-body"[^>]*data-theme-mode="light"/);
    assert.equal((html.match(/<\/style>/g) || []).length, 1, 'CSS must not close the style element');
    assert.doesNotMatch(html, /window\.print/);
});

test('buildStandaloneHtml pins a dark export to the dark theme end to end', () => {
    const html = buildStandaloneHtml({ title: 't', bodyHtml: renderedBody, css: '', theme: 'dark' });
    assert.match(html, /<meta name="color-scheme" content="dark">/);
    assert.match(html, /<body class="vscode-body vscode-dark">/);
    assert.match(html, /class="mpgh-body"[^>]*data-theme-mode="dark"/);
    assert.match(html, /<p data-theme-mode="dark">/, 'user content must not be rewritten');
});

test('buildRendererPageHtml hosts the pinned body and loads only the local renderer', () => {
    const html = buildRendererPageHtml({
        bodyHtml: mermaidBody,
        theme: 'light',
        scriptUri: 'vscode-webview://abc&x/dist/mermaid-render.js',
        cspSource: 'vscode-webview://abc&x',
    });
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(
        html,
        /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src vscode-webview:\/\/abc&x; style-src vscode-webview:\/\/abc&x 'unsafe-inline';">/
    );
    assert.match(html, /<body class="vscode-body vscode-light">/);
    assert.match(html, /class="mpgh-body"[^>]*data-theme-mode="light"/);
    assert.match(html, /<script src="vscode-webview:\/\/abc&amp;x\/dist\/mermaid-render\.js"><\/script>/);
});

test('parseRendererMessage accepts a valid completed body', () => {
    const message = { type: 'mpgh-mermaid-render', bodyHtml: '<div class="mpgh-body"></div>' };
    assert.deepEqual(parseRendererMessage(message), { bodyHtml: '<div class="mpgh-body"></div>' });
});

test('parseRendererMessage rejects foreign or malformed payloads', () => {
    assert.equal(parseRendererMessage(undefined), undefined);
    assert.equal(parseRendererMessage(null), undefined);
    assert.equal(parseRendererMessage('mpgh-mermaid-render'), undefined);
    assert.equal(parseRendererMessage({ type: 'other', bodyHtml: 'x' }), undefined);
    assert.equal(parseRendererMessage({ type: 'mpgh-mermaid-render' }), undefined);
    assert.equal(parseRendererMessage({ type: 'mpgh-mermaid-render', bodyHtml: 42 }), undefined);
    assert.equal(parseRendererMessage({ type: 'mpgh-mermaid-render', bodyHtml: '' }), undefined);
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
