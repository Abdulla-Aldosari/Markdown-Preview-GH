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
 * Resolves the theme an exported page must be pinned to: `light` and `dark`
 * imply their theme directly; anything else follows the host color theme,
 * so the export matches what the preview currently shows.
 */
export function resolveExportThemeMode(mode: string, hostIsDark: boolean): ThemeMode {
    if (mode === 'light' || mode === 'dark') {
        return mode;
    }
    return hostIsDark ? 'dark' : 'light';
}

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
    /**
     * The inline Mermaid bootstrap baked into the page. Included only for
     * documents with diagrams; the page then shows a themed waiting overlay
     * until the diagrams are rendered.
     */
    mermaidScript?: string;
    /**
     * The minified UMD Mermaid library, baked inline before the bootstrap.
     * Required whenever `mermaidScript` is present.
     */
    mermaidLibrary?: string;
    /**
     * The minified UMD zenuml plugin library, baked inline only for
     * documents that contain zenuml diagrams.
     */
    zenumlLibrary?: string;
}

/**
 * Builds the print stylesheet addition that repaints the page with the light
 * theme: every CSS block whose selector targets the light theme (variables,
 * syntax-highlighting token colors, and any other explicit colors) is copied
 * into a `@media print` block with `light` flipped to `dark` in its
 * selector, so printing a dark page produces fully light output while the
 * visible page never changes.
 */
export function buildPrintLightThemeCss(css: string): string {
    const blocks: string[] = [];
    const blockPattern = /([^{}]+)\{([\s\S]*?)\}/g;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(css)) !== null) {
        const selector = match[1];
        if (!/data-theme-mode\s*=\s*["']?light|vscode-light|prefers-color-scheme:\s*light/.test(selector)) {
            continue;
        }
        blocks.push(`    ${selector.replace(/light/g, 'dark')} {\n${match[2]}\n    }`);
    }
    if (blocks.length === 0) {
        return '';
    }
    return `\n@media print {\n${blocks.join('\n')}\n}\n`;
}

/** The stylesheet the page carries only when diagrams must be rendered. */
function mermaidExportCss(): string {
    return `\n        /* Waiting overlay shown until the diagrams are rendered. */\n        .mpgh-export-wait {\n            position: fixed;\n            inset: 0;\n            display: flex;\n            flex-direction: column;\n            align-items: center;\n            justify-content: center;\n            gap: 16px;\n            background-color: var(--bgColor-default);\n            z-index: 1000;\n        }\n\n        .mpgh-export-wait-spinner {\n            width: 48px;\n            height: 48px;\n            border: 4px solid var(--borderColor-default);\n            border-top-color: var(--fgColor-accent);\n            border-radius: 50%;\n            animation: mpgh-export-spin 0.8s linear infinite;\n        }\n\n        @keyframes mpgh-export-spin {\n            to {\n                transform: rotate(360deg);\n            }\n        }\n\n        .mpgh-export-wait-text {\n            margin: 0;\n            color: var(--fgColor-muted);\n            font-family: system-ui, sans-serif;\n            font-size: 14px;\n        }\n\n        /* Dark pages carry a light copy of every diagram for printing. */\n        .mpgh-export-diagram,\n        .mpgh-export-diagram-screen,\n        .mpgh-export-diagram-print {\n            display: block;\n        }\n\n        .mpgh-export-diagram-print {\n            display: none;\n        }\n\n        @media print {\n            .mpgh-export-diagram-screen {\n                display: none !important;\n            }\n\n            .mpgh-export-diagram-print {\n                display: block;\n            }\n        }\n`;
}

/** The waiting overlay markup, removed by the bundle once rendering ends. */
function mermaidWaitingOverlayHtml(): string {
    return `<div class="mpgh-export-wait">\n            <div class="mpgh-export-wait-spinner"></div>\n            <p class="mpgh-export-wait-text">Please Wait&hellip;</p>\n        </div>`;
}

/** The inline scripts the page carries when it must render diagrams. */
function mermaidExportHtml(autoPrint: boolean, mermaidScript: string, mermaidLibrary: string, zenumlLibrary?: string): string {
    return `${mermaidWaitingOverlayHtml()}
        <script>window.MPGH_EXPORT = { print: ${autoPrint ? 'true' : 'false'} };</script>
        <script>
${mermaidLibrary}
        </script>
        <script>
${zenumlLibrary ?? ''}
        </script>
        <script>
${mermaidScript}
        </script>`;
}

export function buildStandaloneHtml({
    title,
    bodyHtml,
    css,
    baseHref,
    autoPrint = false,
    theme = 'light',
    mermaidScript,
    mermaidLibrary,
    zenumlLibrary,
}: StandaloneHtmlOptions): string {
    const baseTag = baseHref ? `<base href="${escapeHtml(baseHref)}">` : '';
    const printScript = autoPrint && !mermaidScript ? `<script>window.addEventListener('load', () => window.print());</script>` : '';
    const mermaidHtml = mermaidScript && mermaidLibrary ? mermaidExportHtml(autoPrint, mermaidScript, mermaidLibrary, zenumlLibrary) : '';
    return `<!DOCTYPE html>\n<html data-theme-mode="${theme}">\n    <head>\n        <meta charset="utf-8">\n        <meta name="viewport" content="width=device-width, initial-scale=1">\n        <meta name="color-scheme" content="${theme}">\n        <title>${escapeHtml(title)}</title>\n        ${baseTag}\n        <style>\n${sanitizeInlineCss(css)}\n        body {\n            background-color: var(--bgColor-default);\n        }\n${mermaidScript ? mermaidExportCss() : ''}${buildPrintLightThemeCss(css)}\n        </style>\n    </head>\n    <body class="vscode-body vscode-${theme}">\n        <div class="markdown-body" dir="auto">\n            ${forceTheme(bodyHtml, theme)}\n        </div>\n        ${mermaidHtml}${printScript}\n    </body>\n</html>\n`;
}

/**
 * Matches the opening tag of a Mermaid placeholder the preview renderer
 * emits: a `pre.mermaid` code fence or a `div.mermaid` custom container.
 */
const mermaidBlockTag = /<(pre|div)\s[^>]*class="[^"]*\b(?:mermaid|mpgh-mermaid)\b[^"]*"[^>]*>/g;

/** The inline style that strips all code-block styling from a Mermaid fence. */
const mermaidUnsetStyle = /\s+style="all:\s*unset;"/;

/**
 * Matches the source attribute of a placeholder whose diagram source starts
 * with the zenuml type, which requires the separate zenuml library.
 */
const zenumlSourceTag = /data-mpgh-mermaid-source\s*=\s*["'][^"']*zenuml\b/i;

export interface PreparedMermaidBody {
    html: string;
    /** True when the document contains at least one Mermaid placeholder. */
    hasMermaid: boolean;
    /** True when the document contains at least one zenuml diagram. */
    hasZenuml: boolean;
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
    return { html, hasMermaid, hasZenuml: zenumlSourceTag.test(html) };
}
