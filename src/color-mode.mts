/*-------------------------------------------------
 * Markdown Preview GH - VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure helpers for resolving the preview color mode. This module must not
 * depend on the `vscode` API so it stays unit-testable in plain Node.
 */

export type FileColorMode = 'light' | 'dark';

export const validColorModes: readonly FileColorMode[] = ['light', 'dark'];

/**
 * Resolves the effective color mode for a document. A valid per-file override
 * ('light' or 'dark') wins; otherwise the global mode is returned unchanged.
 */
export function resolveColorMode(globalMode: string, fileMode: string | null | undefined): string {
    const validFileMode = validColorModes.find((mode) => mode === fileMode);
    return validFileMode ? validFileMode : globalMode;
}
