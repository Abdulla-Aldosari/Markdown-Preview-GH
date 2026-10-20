import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPrintLightThemeCss,
    buildStandaloneHtml,
    escapeHtml,
    exportFileName,
    forceTheme,
    prepareMermaidHtml,
    resolveExportThemeMode,
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

test('resolveExportThemeMode maps pinned modes directly', () => {
    assert.equal(resolveExportThemeMode('light', true), 'light');
    assert.equal(resolveExportThemeMode('light', false), 'light');
    assert.equal(resolveExportThemeMode('dark', true), 'dark');
    assert.equal(resolveExportThemeMode('dark', false), 'dark');
});

test('resolveExportThemeMode follows the host for any other mode', () => {
    assert.equal(resolveExportThemeMode('auto', true), 'dark');
    assert.equal(resolveExportThemeMode('auto', false), 'light');
    assert.equal(resolveExportThemeMode('', false), 'light');
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

test('buildPrintLightThemeCss repaints dark selectors with the light variables for print', () => {
    const css = `
[data-theme-mode=light],
.vscode-body.vscode-light [data-theme-mode=auto] {
    color-scheme: light;
    --fgColor-danger: #d1242f;
    --bgColor-muted: #f6f8fa;
}
[data-theme-mode=dark],
.vscode-body.vscode-dark [data-theme-mode=auto] {
    color-scheme: dark;
    --fgColor-danger: #ff7b72;
    --bgColor-muted: #21262d;
}`;
    const print = buildPrintLightThemeCss(css);
    assert.match(print, /@media print/);
    assert.match(print, /html\[data-theme-mode='dark'\]/);
    assert.match(print, /body\.vscode-dark/);
    assert.match(print, /body\.vscode-high-contrast/);
    assert.match(print, /--fgColor-danger: #d1242f;/);
    assert.match(print, /--bgColor-muted: #f6f8fa;/);
    assert.match(print, /color-scheme: light;/);
    assert.doesNotMatch(print, /#ff7b72/, 'dark values must not leak into the print block');
});

test('buildPrintLightThemeCss returns nothing when no light block exists', () => {
    assert.equal(buildPrintLightThemeCss('body { color: red; }'), '');
});

test('buildPrintLightThemeCss also extracts minified single-line light blocks', () => {
    const print = buildPrintLightThemeCss('[data-theme-mode=light] { --bgColor-default: #ffffff; --fgColor-default: #1f2328; }');
    assert.match(print, /--bgColor-default: #ffffff;/);
    assert.match(print, /--fgColor-default: #1f2328;/);
});

test('buildStandaloneHtml with diagrams embeds the bundle, the overlay and the themed body background', () => {
    const html = buildStandaloneHtml({
        title: 't',
        bodyHtml: mermaidBody,
        css: '',
        theme: 'dark',
        autoPrint: true,
        mermaidScript: '/* mermaid bundle */',
    });
    assert.match(html, /class="mpgh-export-wait"/);
    assert.match(html, /mpgh-export-wait-spinner/);
    assert.match(html, /Please Wait&hellip;/);
    assert.match(html, /window\.MPGH_EXPORT = \{ print: true \}/);
    assert.match(html, /<script>\n\/\* mermaid bundle \*\//);
    assert.match(html, /body \{\n\s*background-color: var\(--bgColor-default\);\n\s*\}/);
    assert.match(html, /\.mpgh-export-diagram-print \{\s*display: none;/);
    assert.doesNotMatch(html, /window\.addEventListener\('load'/, 'the bundle handles printing itself');
});

test('buildStandaloneHtml without diagrams stays a plain page with no overlay', () => {
    const html = buildStandaloneHtml({ title: 't', bodyHtml: renderedBody, css: '', autoPrint: true });
    assert.doesNotMatch(html, /mpgh-export-wait/);
    assert.doesNotMatch(html, /MPGH_EXPORT/);
    assert.match(html, /window\.addEventListener\('load', \(\) => window\.print\(\)\)/);
    assert.match(html, /background-color: var\(--bgColor-default\)/);
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
test('prepareMermaidHtml detects the reclassified preview placeholders', () => {
    const body = `<div class="mpgh-body">
        <pre class="mpgh-mermaid" data-mpgh-mermaid-source="graph TD\n    A --&gt; B">graph TD\n    A --&gt; B</pre>
        <div class="mpgh-mermaid">sequenceDiagram\n    A-&gt;&gt;B: hi</div>
    </div>`;
    const { html, hasMermaid } = prepareMermaidHtml(body);
    assert.equal(hasMermaid, true);
    assert.match(html, /<pre class="mpgh-mermaid" data-mpgh-mermaid-source=/);
    assert.match(html, /<div class="mpgh-mermaid">sequenceDiagram/);
});
