/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The extension-side behavior of the "Copy This ... As PNG" commands, free of
 * the `vscode` module: everything it needs from the editor comes through an
 * injected host, so the decisions are unit-tested in plain Node.
 *
 * The commands rely on a command of the built-in Markdown preview that is not
 * part of the public API. The controller keeps a context key in step with its
 * presence, so the menu entries disappear when it is missing, and every copy
 * re-checks it so a stale key never turns into a silent failure.
 */

import { blockLabels, copyImageCommandId, encodeCaptureId, isCopyImageAvailable, readBlockRequest, type BlockKind } from './block-image-protocol.mts';

/** What the controller needs from the editor. */
export interface BlockImageHost {
    /** Every registered command id, internal ones included. */
    listCommands(): Promise<readonly string[]>;
    /** Runs a command with the single argument the preview expects. */
    executeCommand(id: string, argument: { id: string; resource: string }): Promise<unknown>;
    /** Sets the context key the menu entries test. */
    setAvailable(available: boolean): Promise<void>;
    showError(message: string): void;
}

export interface BlockImageController {
    /** Recomputes availability and updates the context key when it changed. */
    refresh(): Promise<boolean>;
    /** Runs the command of one block kind with the argument VS Code passed to it. */
    copy(kind: BlockKind, args: unknown): Promise<void>;
}

export const unavailableMessage = 'Copying as an image is not available in this version of VS Code.';

export function createBlockImageController(host: BlockImageHost): BlockImageController {
    let known: boolean | undefined;

    async function refresh(): Promise<boolean> {
        let available = false;
        try {
            available = isCopyImageAvailable(await host.listCommands());
        } catch {
            available = false;
        }
        if (available !== known) {
            known = available;
            await host.setAvailable(available);
        }
        return available;
    }

    async function copy(kind: BlockKind, args: unknown): Promise<void> {
        const label = blockLabels[kind];
        const request = readBlockRequest(args, kind);
        if (!request) {
            host.showError(`Right-click a ${label} in the preview to copy it as an image.`);
            return;
        }
        if (!(await refresh())) {
            host.showError(unavailableMessage);
            return;
        }
        try {
            await host.executeCommand(copyImageCommandId, { id: encodeCaptureId(request), resource: request.resource });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            host.showError(`Could not copy the ${label} as an image: ${message}`);
            await refresh();
        }
    }

    return { refresh, copy };
}
