/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Turns an absolute reference into one relative to the folder an exported
 * page is written to, so a link to a sibling document keeps working after
 * the export. Works on URLs, not on file system paths, so it serves every
 * scheme, including the virtual file systems of VS Code for the Web.
 *
 * Pure string logic with no `vscode` import.
 */

const schemePrefix = /^[A-Za-z][A-Za-z0-9+.-]+:/;
const driveSegment = /^[A-Za-z](?::|%3A)$/i;

/** Decodes a path segment for comparison; undecodable text is compared as is. */
function comparable(segment: string): string {
    try {
        return decodeURIComponent(segment).toLowerCase();
    } catch {
        return segment.toLowerCase();
    }
}

/**
 * Rewrites an absolute reference as a path relative to the output folder.
 * The reference stays absolute when it has another scheme or host, when it
 * lives on another drive, or when it is not an absolute URL at all.
 * @param reference The reference, already resolved to an absolute URL.
 * @param outputDirUrl The folder the page is written to, as a URL ending in `/`.
 */
export function rebaseReference(reference: string, outputDirUrl: string): string {
    if (!schemePrefix.test(reference)) {
        return reference;
    }
    let target: URL;
    let outputDir: URL;
    try {
        target = new URL(reference);
        outputDir = new URL(outputDirUrl);
    } catch {
        return reference;
    }
    if (target.protocol !== outputDir.protocol || target.host !== outputDir.host) {
        return reference;
    }
    const fromSegments = outputDir.pathname.split('/').slice(1);
    if (fromSegments[fromSegments.length - 1] === '') {
        fromSegments.pop();
    }
    const targetSegments = target.pathname.split('/').slice(1);
    const targetDirSegments = targetSegments.slice(0, -1);
    if (fromSegments.length > 0 && targetDirSegments.length > 0 && driveSegment.test(fromSegments[0]) && comparable(fromSegments[0]) !== comparable(targetDirSegments[0])) {
        return reference;
    }
    let common = 0;
    while (common < fromSegments.length && common < targetDirSegments.length && comparable(fromSegments[common]) === comparable(targetDirSegments[common])) {
        common++;
    }
    const climb = '../'.repeat(fromSegments.length - common);
    const descent = targetSegments.slice(common).join('/');
    const path = `${climb}${descent}`;
    const relative = path === '' ? './' : path;
    // A first segment that contains a colon would read as a scheme.
    const safe = /^[^/]*:/.test(relative) ? `./${relative}` : relative;
    return `${safe}${target.search}${target.hash}`;
}
