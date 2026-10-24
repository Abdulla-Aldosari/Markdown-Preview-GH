/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Prepares the rendered body of an exported HTML file. The only change is
 * that local images are embedded as data URIs, which makes them part of the
 * file. Every other reference (links, internet images, images that could
 * not be embedded) is left exactly as the author wrote it: the final place
 * of the file is unknown, so no link can be resolved for it.
 *
 * Pure logic with no `vscode` import; file access is injected.
 */

import { isEmbeddableUrl, loadImages, type EmbedFailure, type ImageSource } from './image-embedding.mts';
import { resolveDocumentReference, rewriteDocumentReferences, type ReferenceSite, type UrlResolutionBases } from './url-resolution.mts';

export interface ExportBodyOptions {
    /** The document and workspace folders, used to find the images to embed. `undefined` embeds nothing. */
    bases: UrlResolutionBases | undefined;
    /** Reads the local images. */
    source: ImageSource;
}

export interface ExportBody {
    html: string;
    /** Images that stayed links, with the reason. */
    failures: EmbedFailure[];
    /** The number of distinct images that were embedded. */
    embeddedCount: number;
}

/** Whether a reference is an image source worth embedding. */
function isImageSite(site: ReferenceSite): boolean {
    return (site.tag === 'img' && (site.attribute === 'src' || site.attribute === 'srcset')) || (site.tag === 'source' && site.attribute === 'srcset');
}

/**
 * Embeds the local images of a rendered body. The original path of an image
 * (`data-src`) wins over its `src`, which can hold a preview-only URL, so an
 * image that cannot be embedded gets its original path back.
 */
export async function prepareExportBody(html: string, options: ExportBodyOptions): Promise<ExportBody> {
    const resolve = (reference: string): string => (options.bases === undefined ? reference : resolveDocumentReference(reference, options.bases));
    const candidates = new Set<string>();
    rewriteDocumentReferences(html, (reference, site) => {
        const resolved = resolve(reference);
        if (isImageSite(site) && isEmbeddableUrl(resolved)) {
            candidates.add(resolved);
        }
        return reference;
    });
    const { dataUris, failures } = await loadImages(candidates, options.source);
    const output = rewriteDocumentReferences(html, (reference, site) => {
        const embedded = isImageSite(site) ? dataUris.get(resolve(reference)) : undefined;
        return embedded ?? reference;
    });
    return { html: output, failures, embeddedCount: dataUris.size };
}

/**
 * Whether a command argument is a URI string (`file:///...`, `vscode-vfs://...`)
 * rather than a file system path. A one-letter prefix is a drive letter.
 */
export function isUriString(value: string): boolean {
    return /^[A-Za-z][A-Za-z0-9+.-]+:/.test(value);
}
