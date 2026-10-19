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

/**
 * Matches the opening tag of the root container emitted by the preview
 * renderer. Only this element carries the theme attributes, so only it is
 * rewritten - user-authored HTML further down the document is left intact.
 */
const rootOpenTag = /^\s*<div\s+class="mpgh-body"[^>]*>/;

/**
 * Pins the exported document to the light theme regardless of the user's
 * preview settings, since exported pages are mainly meant to be printed and
 * the light theme is the readable, ink-friendly choice.
 */
export function forceLightTheme(bodyHtml: string): string {
    return bodyHtml.replace(rootOpenTag, (tag) => tag.replace(/data-theme-mode="[^"]*"/, 'data-theme-mode="light"'));
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
}

export function buildStandaloneHtml({ title, bodyHtml, css, baseHref, autoPrint = false }: StandaloneHtmlOptions): string {
    const baseTag = baseHref ? `<base href="${escapeHtml(baseHref)}">` : '';
    const printScript = autoPrint ? `<script>window.addEventListener('load', () => window.print());</script>` : '';
    return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="light">
        <title>${escapeHtml(title)}</title>
        ${baseTag}
        <style>
${sanitizeInlineCss(css)}
        </style>
    </head>
    <body class="vscode-body vscode-light">
        <div class="markdown-body" dir="auto">
            ${forceLightTheme(bodyHtml)}
        </div>
        ${printScript}
    </body>
</html>
`;
}
