/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Resolves the HTML surface the theme audit classifies against.
 *
 * Two sources, in priority order:
 *
 * 1. `manual-surface.html` — a developer-pasted copy of the real preview
 *    HTML (rendered from `surface.md` by VS Code itself). This is the gold
 *    standard because it contains everything VS Code adds beyond plain
 *    markdown-it (heading anchors, footnotes, syntax highlighting).
 *
 * 2. `surface.md` rendered through markdown-it (configured to match VS Code)
 *    with this extension's GFM plugin installed. This is the always-available
 *    fallback and is augmented with `augmentWithVsCodeAdditions`, a small
 *    documented list of the selectors VS Code emits outside markdown-it.
 *
 * The surface is the set of tag names, class names, class-name prefixes and
 * attribute names that can appear in the preview. The audit classifies a
 * changed CSS rule as "affects the preview" only when every selector
 * component it references is present in this surface.
 */

import MarkdownIt from 'markdown-it';
import { createGfmPlugin } from '../../src/markdown-plugin.mts';

/**
 * Exact class names VS Code adds outside plain markdown-it.
 *
 * Deliberately limited to what VS Code itself emits (heading anchors,
 * footnotes, syntax highlighting). GitHub.com-only constructs such as
 * `.markdown-heading`, `.heading-element`, `.pl-*`, `g-emoji`, `.csv-data`,
 * and the image-alignment spans are NOT VS Code additions: they reach the
 * preview only when a document writes them as raw HTML, so they belong in
 * `surface.md` instead of these lists.
 */
const VS_CODE_ONLY_CLASSES = ['anchor', 'octicon-link', 'footnotes', 'footnote-ref', 'footnote-backref', 'hljs', 'highlight'];

/** Class-name prefixes produced by VS Code or this extension's plugins. */
const SURFACE_CLASS_PREFIXES = ['hljs-', 'language-', 'octicon-', 'markdown-alert-', 'task-list-'];

/** Attribute names VS Code adds outside plain markdown-it. */
const VS_CODE_ONLY_ATTRIBUTES = ['id', 'data-footnote-ref', 'data-footnote-backref'];

export interface HtmlSurface {
    tags: Set<string>;
    classes: Set<string>;
    classPrefixes: Set<string>;
    attributes: Set<string>;
}

export type SurfaceSource = 'manual' | 'markdown-it';

export interface ResolvedSurface {
    source: SurfaceSource;
    surface: HtmlSurface;
}

/** Extracts unique tag names, class names and attribute names from HTML. */
export function extractHtmlSurface(html: string): HtmlSurface {
    const tags = new Set<string>();
    const classes = new Set<string>();
    const attributes = new Set<string>();
    for (const match of html.matchAll(/<([a-zA-Z][\w-]*)([^>]*)>/g)) {
        tags.add(match[1]);
        const rawAttrs = match[2];
        const bare = rawAttrs.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        for (const attr of bare.matchAll(/([\w-]+)(?==|[\s/>])/g)) {
            attributes.add(attr[1]);
        }
        const classAttr = rawAttrs.match(/class\s*=\s*"([^"]*)"/);
        if (classAttr) {
            for (const cls of classAttr[1].split(/\s+/)) {
                if (cls) {
                    classes.add(cls);
                }
            }
        }
    }
    return { tags, classes, classPrefixes: new Set(SURFACE_CLASS_PREFIXES), attributes };
}

/** Merges the documented VS Code-only additions into a surface. */
export function augmentWithVsCodeAdditions(surface: HtmlSurface): HtmlSurface {
    const classes = new Set(surface.classes);
    for (const cls of VS_CODE_ONLY_CLASSES) {
        classes.add(cls);
    }
    const attributes = new Set(surface.attributes);
    for (const attr of VS_CODE_ONLY_ATTRIBUTES) {
        attributes.add(attr);
    }
    return { tags: surface.tags, classes, classPrefixes: surface.classPrefixes, attributes };
}

/** Builds a markdown-it instance configured to match VS Code's preview. */
function buildMarkdownIt(): MarkdownIt {
    return new MarkdownIt({ html: true, linkify: true }).use(createGfmPlugin(() => ({ direction: 'ltr', width: 'normal', themeMode: 'auto' })));
}

/** Renders `markdown` through the fallback pipeline. */
export function renderMarkdown(markdown: string): string {
    return buildMarkdownIt().render(markdown);
}

/** Resolves the markdown-it fallback surface for the given Markdown source. */
export function buildMarkdownItSurface(markdown: string): HtmlSurface {
    return augmentWithVsCodeAdditions(extractHtmlSurface(renderMarkdown(markdown)));
}

/** Resolves the surface used for classification. */
export function resolveSurface(manualHtml: string | null, fallbackMarkdown: string): ResolvedSurface {
    if (manualHtml !== null) {
        return { source: 'manual', surface: extractHtmlSurface(manualHtml) };
    }
    return { source: 'markdown-it', surface: buildMarkdownItSurface(fallbackMarkdown) };
}

/** How long a manually prepared surface stays valid before it is rejected. */
export const MANUAL_SURFACE_TTL_MS = 5 * 60 * 1000;

export interface ManualSurfaceState {
    hasContent: boolean;
    date: Date | null;
    content: string;
}

function parseDateValue(value: string): Date | null {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function parseManualSurface(html: string): ManualSurfaceState {
    const comment = html.match(/<!--([\s\S]*?)-->/)?.[1] ?? '';
    const dateMatch = comment.match(/manual-surface-date:\s*"([^"]*)"/);
    const date = parseDateValue(dateMatch ? dateMatch[1] : '');
    const content = html.replace(/<!--[\s\S]*?-->/g, '').trim();
    return { hasContent: content.length > 0, date, content };
}

export function isStale(date: Date | null, now: number, ttlMs: number): boolean {
    if (date === null) {
        return false;
    }
    return now - date.getTime() > ttlMs;
}

export function writeManualSurfaceDate(html: string, dateValue: string): string {
    if (/manual-surface-date:\s*"/.test(html)) {
        return html.replace(/(manual-surface-date:\s*)"[^"]*"/, `$1"${dateValue}"`);
    }
    return html.replace(/<!--([\s\S]*?)-->/, `<!--$1\nmanual-surface-date: "${dateValue}"\n-->`);
}

export const MANUAL_SURFACE_TEMPLATE = `<!--
manual-surface-date: ""

Markdown Preview GH - theme audit manual surface.

Paste the rendered HTML of surface.md from the VS Code Markdown preview here,
below this comment, to make the theme audit use VS Code's real output (heading
anchors, footnotes, syntax highlighting) instead of the markdown-it
approximation.

Rules:
- If this file contains HTML beyond this comment, the audit uses that HTML
  and skips rendering surface.md with markdown-it.
- The audit writes the time it consumed this content into the
  manual-surface-date line above. Content older than 5 minutes is rejected to
  avoid silently auditing against stale data. To refresh, clear the date and
  paste new content, then run the audit again.
- If this file has no HTML (only this comment), the audit renders surface.md
  through markdown-it instead.
- Keep this comment: it documents the file and carries the date.
-->
`;
