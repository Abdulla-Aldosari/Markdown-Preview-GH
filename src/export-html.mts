/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure helpers that turn rendered preview HTML into a standalone page that
 * can be opened in an external browser or printed. This module must not
 * depend on the `vscode` API so it stays unit-testable in plain Node.
 */

const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

/** The theme a standalone page is pinned to. */
export type ThemeMode = 'light' | 'dark';

/**
 * Matches the opening tag of the root container emitted by the preview
 * renderer. Only this element carries the theme attributes, so only it is
 * rewritten - user-authored HTML further down the document is left intact.
 */
const rootOpenTag = /^\s*<div\s+class="mpgh-body"[^>]*>/;

/**
 * Pins the exported document to the given theme regardless of the user's
 * preview settings, so the page carries a single, explicit theme.
 */
export function forceTheme(bodyHtml: string, mode: ThemeMode): string {
    return bodyHtml.replace(rootOpenTag, (tag) => tag.replace(/data-theme-mode="[^"]*"/, `data-theme-mode="${mode}"`));
}

/**
 * Prevents stylesheet content from closing the surrounding <style> element.
 */
function sanitizeInlineCss(css: string): string {
    return css.replace(/<\/style/gi, '<\\/style');
}

/**
 * Stable, dependency-free 32-bit FNV-1a hash. Used to derive a fixed export
 * file name per source document so repeated exports overwrite each other
 * instead of accumulating files.
 */
export function hashString(value: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param sourceKey Unique identifier of the source document (its URI).
 * @param displayName Human-readable file name of the source document.
 */
export function exportFileName(sourceKey: string, displayName: string): string {
    const stem = displayName
        .replace(/\.[^.]*$/, '')
        .replace(/[^\p{L}\p{N}_.-]+/gu, '-')
        .replace(/^-+|-+$/g, '');
    return `${stem || 'document'}-${hashString(sourceKey)}.html`;
}

/**
 * URI schemes that VS Code stores on the local disk. `vscode-userdata` is a
 * virtual scheme VS Code uses for its user data folder (including extension
 * global storage); it maps one-to-one onto a `file` URI with the same path.
 * The operating system does not recognize it, so it must be converted before
 * the URI is handed to an external application.
 */
const localDiskSchemes: readonly string[] = ['vscode-userdata'];

/** The subset of `vscode.Uri` that `toLocalFileUri` depends on. */
export interface SchemeUri<T> {
    readonly scheme: string;
    with(change: { scheme: string }): T;
}

/**
 * Converts a URI that lives on the local disk into a plain `file` URI that
 * external applications (e.g. the browser) can open.
 * @returns `undefined` when the URI is not on the local disk.
 */
export function toLocalFileUri<T extends SchemeUri<T>>(uri: T): T | undefined {
    if (uri.scheme === 'file') {
        return uri;
    }
    return localDiskSchemes.includes(uri.scheme) ? uri.with({ scheme: 'file' }) : undefined;
}

export interface StandaloneHtmlOptions {
    title: string;
    bodyHtml: string;
    css: string;
    baseHref?: string;
    autoPrint?: boolean;
    /** The theme the page is pinned to. Defaults to `light`. */
    theme?: ThemeMode;
}

export function buildStandaloneHtml({ title, bodyHtml, css, baseHref, autoPrint = false, theme = 'light' }: StandaloneHtmlOptions): string {
    const baseTag = baseHref ? `<base href="${escapeHtml(baseHref)}">` : '';
    const printScript = autoPrint ? `<script>window.addEventListener('load', () => window.print());</script>` : '';
    return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="${theme}">
        <title>${escapeHtml(title)}</title>
        ${baseTag}
        <style>
${sanitizeInlineCss(css)}
        </style>
    </head>
    <body class="vscode-body vscode-${theme}">
        <div class="markdown-body" dir="auto">
            ${forceTheme(bodyHtml, theme)}
        </div>
        ${printScript}
    </body>
</html>
`;
}

/**
 * Matches the opening tag of a Mermaid placeholder the preview renderer
 * emits: a `pre.mermaid` code fence or a `div.mermaid` custom container.
 */
const mermaidBlockTag = /<(pre|div)\s[^>]*class="[^"]*\bmermaid\b[^"]*"[^>]*>/g;

/** The inline style that strips all code-block styling from a Mermaid fence. */
const mermaidUnsetStyle = /\s+style="all:\s*unset;"/;

export interface PreparedMermaidBody {
    html: string;
    /** True when the document contains at least one Mermaid placeholder. */
    hasMermaid: boolean;
}

/**
 * Normalizes the Mermaid placeholders of a rendered document before export.
 * The `style="all: unset;"` the preview emits on `pre.mermaid` would leave a
 * fence as bare, unstyled text; removing it lets the regular code-block
 * styles apply, which is also the graceful fallback when a diagram fails to
 * render.
 */
export function prepareMermaidHtml(bodyHtml: string): PreparedMermaidBody {
    let hasMermaid = false;
    const html = bodyHtml.replace(mermaidBlockTag, (tag) => {
        hasMermaid = true;
        return tag.startsWith('<pre') ? tag.replace(mermaidUnsetStyle, '') : tag;
    });
    return { html, hasMermaid };
}

export interface RendererPageOptions {
    /** The rendered document body, before its diagrams are baked in. */
    bodyHtml: string;
    /** The theme the renderer page (and the export) is pinned to. */
    theme: ThemeMode;
    /** Webview URI of the bundled renderer script. */
    scriptUri: string;
    /** The webview CSP source, used to allow the local renderer script. */
    cspSource: string;
}

/**
 * Builds the HTML of the hidden webview page that renders the Mermaid
 * diagrams at export time. The page loads the bundled renderer script from
 * the extension itself; nothing from this page ships with the export.
 */
export function buildRendererPageHtml({ bodyHtml, theme, scriptUri, cspSource }: RendererPageOptions): string {
    return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline';">
    </head>
    <body class="vscode-body vscode-${theme}">
        ${forceTheme(bodyHtml, theme)}
        <script src="${escapeHtml(scriptUri)}"></script>
    </body>
</html>
`;
}

/** The message the renderer script sends back with the finished body. */
export interface RendererCompleteMessage {
    bodyHtml: string;
}

/**
 * Validates a message received from the hidden renderer webview. Returns the
 * completed body HTML, or `undefined` when the payload is not the expected
 * message.
 */
export function parseRendererMessage(message: unknown): RendererCompleteMessage | undefined {
    if (!message || typeof message !== 'object') {
        return undefined;
    }
    const record = message as Record<string, unknown>;
    if (record.type !== 'mpgh-mermaid-render' || typeof record.bodyHtml !== 'string' || record.bodyHtml.length === 0) {
        return undefined;
    }
    return { bodyHtml: record.bodyHtml };
}
