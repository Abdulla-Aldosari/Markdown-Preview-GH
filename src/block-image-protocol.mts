/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The contract between the extension host and the preview script for copying
 * one block of the preview (a table, a code block, a diagram, or a section)
 * to the clipboard as a PNG image.
 *
 * The preview script marks every block with a context value; the context
 * menu entries of this extension test it in their `when` clauses, and the
 * values come back to the command as its argument. The host reaches the page
 * through the preview's own `copyImage` message: its `id` field names the
 * block, and the page ignores every id that is not an image element.
 *
 * Pure (no `vscode` import), shared by the extension and the preview script.
 */

/** The kinds of block that can be copied, in menu order. */
export const blockKinds = ['table', 'code', 'diagram', 'section'] as const;

export type BlockKind = (typeof blockKinds)[number];

/** The context value that names the block kind under the pointer. */
export const blockContextKey = 'mpghBlock';

/** The context value that holds the position of the block among its kind. */
export const blockIndexContextKey = 'mpghIndex';

/** The context key that is true while the preview can copy a block as an image. */
export const availabilityContextKey = 'markdownPreviewGh.canCopyBlockImage';

/** The preview's command that posts a `copyImage` message to its page. */
export const copyImageCommandId = '_markdown.copyImage';

/** The command id of each block kind; `package.json` declares the same ids. */
export const blockCommandIds: Readonly<Record<BlockKind, string>> = {
    table: 'markdown-preview-gh.copyTableAsPng',
    code: 'markdown-preview-gh.copyCodeBlockAsPng',
    diagram: 'markdown-preview-gh.copyDiagramAsPng',
    section: 'markdown-preview-gh.copySectionAsPng',
};

/** How each kind is named in messages. */
export const blockLabels: Readonly<Record<BlockKind, string>> = {
    table: 'table',
    code: 'code block',
    diagram: 'diagram',
    section: 'section',
};

const captureIdPattern = new RegExp(`^mpgh-capture:(${blockKinds.join('|')}):(\\d{1,9})$`);

/** What the page needs to find the block: its kind and its position among that kind. */
export interface CaptureTarget {
    kind: BlockKind;
    index: number;
}

/** What a command needs: the document, and the block that was clicked. */
export interface BlockRequest extends CaptureTarget {
    resource: string;
}

export function isBlockKind(value: unknown): value is BlockKind {
    return typeof value === 'string' && (blockKinds as readonly string[]).includes(value);
}

/** The `id` the host sends so that the page captures this block. */
export function encodeCaptureId(target: CaptureTarget): string {
    return `mpgh-capture:${target.kind}:${target.index}`;
}

/** The block a `copyImage` message names, or `null` for any other id (the built-in image ids included). */
export function decodeCaptureId(id: unknown): CaptureTarget | null {
    if (typeof id !== 'string') {
        return null;
    }
    const match = captureIdPattern.exec(id);
    if (!match || !isBlockKind(match[1])) {
        return null;
    }
    return { kind: match[1], index: Number(match[2]) };
}

/**
 * Reads the argument VS Code passes to a block command: the merged context
 * values of the clicked element and its ancestors. Anything that does not
 * name the expected kind (a command run from the Command Palette, a stale
 * keybinding) is rejected.
 */
export function readBlockRequest(args: unknown, expected: BlockKind): BlockRequest | null {
    if (typeof args !== 'object' || args === null) {
        return null;
    }
    const values = args as Record<string, unknown>;
    const { resource } = values;
    const index = values[blockIndexContextKey];
    if (typeof resource !== 'string' || resource === '' || values[blockContextKey] !== expected) {
        return null;
    }
    if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
        return null;
    }
    return { resource, kind: expected, index };
}

/** Whether the preview offers the command the page needs; the list comes from `getCommands(false)`. */
export function isCopyImageAvailable(commands: readonly string[]): boolean {
    return commands.includes(copyImageCommandId);
}
