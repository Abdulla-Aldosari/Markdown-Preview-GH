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

import {
    blockLabels,
    copyImageCommandId,
    defaultBlockImageScale,
    encodeCaptureId,
    isCopyImageAvailable,
    readBlockRequest,
    type BlockImageScale,
    type BlockKind,
} from './block-image-protocol.mts';

/** What the controller needs from the editor. */
export interface BlockImageHost {
    /** Every registered command id, internal ones included. */
    listCommands(): Promise<readonly string[]>;
    /** Runs a command with the single argument the preview expects. */
    executeCommand(id: string, argument: { id: string; resource: string }): Promise<unknown>;
    /** Sets the context key the menu entries test. */
    setAvailable(available: boolean): Promise<void>;
    showError(message: string): void;
    /** The scale the image is made at, from the settings. */
    readScale(): BlockImageScale;
    /** The corner radius the image is made with, from the settings. */
    readRadius(): number;
    /** Whether the user wrote a value for the scale setting, even one equal to the default. */
    isScaleExplicit(): boolean;
    /** Whether the one-time notice about the scale was already shown. */
    scaleNoticeShown(): boolean;
    /** Remembers that the notice was shown, for good. */
    markScaleNoticeShown(): Promise<void>;
    /** Shows the notice with one action; resolves to true when the action was chosen. */
    showScaleNotice(message: string, action: string): Promise<boolean>;
    /** Opens the settings at the scale setting. */
    openScaleSettings(): Promise<void>;
}

export interface BlockImageController {
    /** Recomputes availability and updates the context key when it changed. */
    refresh(): Promise<boolean>;
    /** Runs the command of one block kind with the argument VS Code passed to it. */
    copy(kind: BlockKind, args: unknown): Promise<void>;
}

export const unavailableMessage = 'Copying as an image is not available in this version of VS Code.';

/** The one-time notice shown after a copy at the default scale, and its action. */
export const scaleNoticeMessage =
    'Block images are copied at their actual size (scale 1). VS Code zoom and your display scaling do not change it, so the image can look smaller than the preview on your screen. To make it larger, change "Block Image Scale" in the settings.';
export const scaleNoticeAction = 'Open Settings';

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

    /**
     * Tells the user once that images are made at the actual size and where to
     * change it. The notice is for someone who never touched the setting, and it
     * is remembered before it is shown, so it never comes back. The reply of the
     * user is not waited for: the copy is already done.
     */
    async function announceScale(scale: BlockImageScale): Promise<void> {
        if (scale !== defaultBlockImageScale || host.isScaleExplicit() || host.scaleNoticeShown()) {
            return;
        }
        try {
            await host.markScaleNoticeShown();
        } catch {
            // A notice that cannot be remembered would come back at every copy, so it is not shown; the copy itself is done.
            return;
        }
        void host
            .showScaleNotice(scaleNoticeMessage, scaleNoticeAction)
            .then((chosen) => (chosen ? host.openScaleSettings() : undefined))
            .catch(() => undefined);
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
        const scale = host.readScale();
        const radius = host.readRadius();
        try {
            await host.executeCommand(copyImageCommandId, { id: encodeCaptureId(request, scale, radius), resource: request.resource });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            host.showError(`Could not copy the ${label} as an image: ${message}`);
            await refresh();
            return;
        }
        await announceScale(scale);
    }

    return { refresh, copy };
}
