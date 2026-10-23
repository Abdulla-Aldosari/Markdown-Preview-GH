/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Reads local images and turns them into data URIs, so an exported page
 * carries its images. File access is injected through `ImageSource`, and
 * the base64 encoder avoids `Buffer`, so the module is testable in plain
 * Node and runs on VS Code for the Web.
 */

/** The largest image that is embedded; a bigger one stays a link. */
export const MAX_EMBEDDED_IMAGE_BYTES = 20 * 1024 * 1024;

const mimeTypes: Readonly<Record<string, string>> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
};

/** Schemes that are never read from disk: the web, inline data, and non-files. */
const unreadableSchemes: ReadonlySet<string> = new Set(['http', 'https', 'data', 'blob', 'mailto', 'tel', 'javascript', 'about']);

/** The file access the module needs, injected by the caller. */
export interface ImageSource {
    /** Resolves with the size in bytes; rejects when the file cannot be read. */
    size(url: string): Promise<number>;
    /** Resolves with the file content; rejects when the file cannot be read. */
    read(url: string): Promise<Uint8Array>;
}

/** An image that stayed a link, with the reason. */
export interface EmbedFailure {
    url: string;
    reason: string;
}

export interface LoadedImages {
    /** The data URI of every image that was embedded, keyed by its URL. */
    dataUris: Map<string, string>;
    failures: EmbedFailure[];
}

/**
 * Whether an absolute reference points at a local resource that can be
 * read and embedded. Web, data, and one-letter (drive) schemes are not.
 */
export function isEmbeddableUrl(reference: string): boolean {
    const scheme = /^([A-Za-z][A-Za-z0-9+.-]+):/.exec(reference);
    return scheme !== null && !unreadableSchemes.has(scheme[1].toLowerCase());
}

/**
 * The MIME type of an image, taken from the extension of its URL.
 * @returns `undefined` for an unknown extension.
 */
export function imageMimeType(url: string): string | undefined {
    const path = url.split(/[?#]/)[0];
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot === -1 ? undefined : mimeTypes[name.slice(dot + 1).toLowerCase()];
}

/** Encodes bytes as base64 without `Buffer`, in chunks that fit one call. */
export function toBase64(bytes: Uint8Array): string {
    const chunkSize = 0x8000;
    const parts: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        parts.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return btoa(parts.join(''));
}

/**
 * Reads every distinct image once and returns the data URIs. An image that
 * has an unknown type, is too large, or cannot be read is reported in
 * `failures` and left out.
 */
export async function loadImages(urls: Iterable<string>, source: ImageSource, maxBytes: number = MAX_EMBEDDED_IMAGE_BYTES): Promise<LoadedImages> {
    const dataUris = new Map<string, string>();
    const failures: EmbedFailure[] = [];
    for (const url of new Set(urls)) {
        const mimeType = imageMimeType(url);
        if (mimeType === undefined) {
            failures.push({ url, reason: 'unsupported image type' });
            continue;
        }
        try {
            if ((await source.size(url)) > maxBytes) {
                failures.push({ url, reason: `larger than ${Math.round(maxBytes / (1024 * 1024))} MB` });
                continue;
            }
            const bytes = await source.read(url);
            if (bytes.length > maxBytes) {
                failures.push({ url, reason: `larger than ${Math.round(maxBytes / (1024 * 1024))} MB` });
                continue;
            }
            dataUris.set(url, `data:${mimeType};base64,${toBase64(bytes)}`);
        } catch {
            failures.push({ url, reason: 'file not found or unreadable' });
        }
    }
    return { dataUris, failures };
}
