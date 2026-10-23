/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Resolves every relative reference of a rendered document to an absolute
 * URL, so an exported page works without a `<base>` element. A `<base>`
 * would also turn every in-page `#anchor` into a link to the folder; this
 * module leaves anchors untouched instead.
 *
 * Pure string logic with no `vscode` import, so it also runs on VS Code for
 * the Web.
 */

/** URL-carrying attributes, per tag, that hold exactly one URL. */
const urlAttributes: Readonly<Record<string, ReadonlySet<string>>> = {
    img: new Set(['src']),
    source: new Set(['src']),
    a: new Set(['href']),
    video: new Set(['src', 'poster']),
    audio: new Set(['src']),
};

/** URL-carrying attributes, per tag, that hold a `srcset` candidate list. */
const srcsetAttributes: Readonly<Record<string, ReadonlySet<string>>> = {
    img: new Set(['srcset']),
    source: new Set(['srcset']),
};

/** Elements whose content is never scanned: code samples, scripts, styles. */
const rawContentElements: ReadonlySet<string> = new Set(['pre', 'code', 'script', 'style']);

const whitespace = /\s/;
const tagName = /[A-Za-z][A-Za-z0-9-]*/y;
const windowsDrivePath = /^[A-Za-z]:[\\/]/;
/** The engine's output for a workspace path on Windows, e.g. `/d:/ws/img.png`. */
const slashedWindowsDrivePath = /^\/[A-Za-z]:[\\/]/;
const anyScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/;

const namedEntities: Readonly<Record<string, string>> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };

/** Decodes the entities a Markdown renderer can emit inside an attribute value. */
function decodeAttributeValue(value: string): string {
    return value.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+));/g, (entity, decimal?: string, hex?: string, name?: string) => {
        if (name !== undefined) {
            return namedEntities[name] ?? entity;
        }
        const codePoint = decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? '', 16);
        return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    });
}

/** Encodes a value so it is safe inside a double-quoted attribute. */
function encodeAttributeValue(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The folders relative references are resolved against. */
export interface UrlResolutionBases {
    /** The folder of the document as a URL ending in `/`. */
    documentDirUrl: string;
    /**
     * The workspace folder of the document as a URL ending in `/`. Without
     * it a reference that starts with `/` cannot be placed and stays as is.
     */
    workspaceFolderUrl?: string;
}

/**
 * Resolves a single reference. A reference that starts with `/` is a
 * workspace-root path (what the preview does), every other relative
 * reference is resolved against the document folder.
 * @returns the reference unchanged when it must not be touched.
 */
function resolveReference(reference: string, bases: UrlResolutionBases): string {
    const trimmed = reference.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        return reference;
    }
    try {
        if (windowsDrivePath.test(trimmed)) {
            return new URL(`file:///${trimmed.replace(/\\/g, '/')}`).href;
        }
        if (anyScheme.test(trimmed)) {
            return reference;
        }
        if (slashedWindowsDrivePath.test(trimmed)) {
            return new URL(`file://${trimmed}`).href;
        }
        if (trimmed.startsWith('/')) {
            return bases.workspaceFolderUrl === undefined ? reference : new URL(trimmed.replace(/^\/+/, ''), bases.workspaceFolderUrl).href;
        }
        return new URL(trimmed, bases.documentDirUrl).href;
    } catch {
        return reference;
    }
}

/**
 * Resolves each candidate URL of a `srcset` value, keeping the descriptors.
 * @returns the value unchanged when no candidate needed resolving.
 */
function resolveSrcset(value: string, bases: UrlResolutionBases): string {
    const candidates: string[] = [];
    let changed = false;
    let index = 0;
    while (index < value.length) {
        while (index < value.length && (whitespace.test(value[index]) || value[index] === ',')) {
            index++;
        }
        if (index >= value.length) {
            break;
        }
        const urlStart = index;
        while (index < value.length && !whitespace.test(value[index])) {
            index++;
        }
        let url = value.slice(urlStart, index);
        let descriptor = '';
        if (url.endsWith(',')) {
            url = url.replace(/,+$/, '');
        } else {
            const descriptorStart = index;
            while (index < value.length && value[index] !== ',') {
                index++;
            }
            descriptor = value.slice(descriptorStart, index).trim();
        }
        const resolved = resolveReference(url, bases);
        changed ||= resolved !== url;
        candidates.push(descriptor === '' ? resolved : `${resolved} ${descriptor}`);
    }
    return changed ? candidates.join(', ') : value;
}

interface ParsedAttribute {
    name: string;
    valueStart: number;
    valueEnd: number;
    quoted: boolean;
}

interface ParsedStartTag {
    /** Index just past the closing `>` (or the end of input when unterminated). */
    end: number;
    attributes: ParsedAttribute[];
}

/** Reads the attributes of a start tag whose name ends at `position`. */
function parseStartTag(html: string, position: number): ParsedStartTag {
    const attributes: ParsedAttribute[] = [];
    let index = position;
    while (index < html.length) {
        while (index < html.length && (whitespace.test(html[index]) || html[index] === '/')) {
            index++;
        }
        if (index >= html.length) {
            break;
        }
        if (html[index] === '>') {
            return { end: index + 1, attributes };
        }
        const nameStart = index;
        while (index < html.length && !whitespace.test(html[index]) && !`=>/"'`.includes(html[index])) {
            index++;
        }
        if (index === nameStart) {
            index++;
            continue;
        }
        const name = html.slice(nameStart, index).toLowerCase();
        let lookahead = index;
        while (lookahead < html.length && whitespace.test(html[lookahead])) {
            lookahead++;
        }
        if (html[lookahead] !== '=') {
            continue;
        }
        index = lookahead + 1;
        while (index < html.length && whitespace.test(html[index])) {
            index++;
        }
        const quote = html[index];
        if (quote === '"' || quote === "'") {
            const close = html.indexOf(quote, index + 1);
            if (close === -1) {
                break;
            }
            attributes.push({ name, valueStart: index + 1, valueEnd: close, quoted: true });
            index = close + 1;
        } else {
            const valueStart = index;
            while (index < html.length && !whitespace.test(html[index]) && html[index] !== '>') {
                index++;
            }
            attributes.push({ name, valueStart, valueEnd: index, quoted: false });
        }
    }
    return { end: html.length, attributes: [] };
}

/** Rewrites the URL attributes of one start tag and returns the new tag text. */
function rewriteStartTag(html: string, tagStart: number, name: string, parsed: ParsedStartTag, bases: UrlResolutionBases): string {
    const single = urlAttributes[name];
    const lists = srcsetAttributes[name];
    const pieces: string[] = [];
    let copied = tagStart;
    // The Markdown engine records the path as written in `data-src` and caches
    // its tokens per document, so `src` may already hold a preview-only URL
    // (or a workspace path) that depends on who rendered the document first.
    // `data-src` is the one value that never changes.
    const dataSrc = parsed.attributes.find((attribute) => attribute.name === 'data-src');
    const originalSrc = dataSrc ? decodeAttributeValue(html.slice(dataSrc.valueStart, dataSrc.valueEnd)) : undefined;
    for (const attribute of parsed.attributes) {
        const isSingle = single?.has(attribute.name) ?? false;
        const isList = lists?.has(attribute.name) ?? false;
        if (!isSingle && !isList) {
            continue;
        }
        const decoded = decodeAttributeValue(html.slice(attribute.valueStart, attribute.valueEnd));
        const reference = name === 'img' && attribute.name === 'src' && originalSrc !== undefined ? originalSrc : decoded;
        const next = isList ? resolveSrcset(decoded, bases) : resolveReference(reference, bases);
        if (next === decoded) {
            continue;
        }
        const from = attribute.quoted ? attribute.valueStart - 1 : attribute.valueStart;
        const to = attribute.quoted ? attribute.valueEnd + 1 : attribute.valueEnd;
        pieces.push(html.slice(copied, from), `"${encodeAttributeValue(next)}"`);
        copied = to;
    }
    pieces.push(html.slice(copied, parsed.end));
    return pieces.join('');
}

/**
 * Rewrites every relative reference in the rendered HTML to an absolute URL
 * against the given folders. In-page anchors, protocol-relative references,
 * and references that already carry a scheme are left as they are. An
 * `<img>` that carries `data-src` is resolved from that original path.
 *
 * @param bases The document and workspace folders. `undefined` (untitled or
 *        virtual documents) leaves the HTML as is.
 */
export function resolveDocumentUrls(html: string, bases: UrlResolutionBases | undefined): string {
    if (bases === undefined) {
        return html;
    }
    const output: string[] = [];
    let index = 0;
    while (index < html.length) {
        const tagStart = html.indexOf('<', index);
        if (tagStart === -1) {
            break;
        }
        output.push(html.slice(index, tagStart));
        if (html.startsWith('<!--', tagStart)) {
            const close = html.indexOf('-->', tagStart + 4);
            const end = close === -1 ? html.length : close + 3;
            output.push(html.slice(tagStart, end));
            index = end;
            continue;
        }
        tagName.lastIndex = tagStart + 1;
        const nameMatch = tagName.exec(html);
        if (!nameMatch) {
            output.push('<');
            index = tagStart + 1;
            continue;
        }
        const name = nameMatch[0].toLowerCase();
        const parsed = parseStartTag(html, tagName.lastIndex);
        output.push(rewriteStartTag(html, tagStart, name, parsed, bases));
        index = parsed.end;
        if (rawContentElements.has(name)) {
            const closePattern = new RegExp(`</${name}[\\s>/]`, 'ig');
            closePattern.lastIndex = index;
            const closeMatch = closePattern.exec(html);
            const end = closeMatch ? closeMatch.index : html.length;
            output.push(html.slice(index, end));
            index = end;
        }
    }
    output.push(html.slice(index));
    return output.join('');
}
