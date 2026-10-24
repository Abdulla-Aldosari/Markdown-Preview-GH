/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Types shared by the headless engine (Node only) and the extension code that
 * receives it through injection. Type declarations only: this module has no
 * runtime content and imports nothing.
 */

export interface HeadlessPageOptions {
    /** The browser executable to launch. */
    executablePath: string;
    /** The page to load (a `file:` or `http:` URL). */
    url: string;
    /** Also wait for the page's ready marker, because it draws diagrams. */
    waitForMarker: boolean;
    /** Stops everything and rejects after this long. Defaults to two minutes. */
    timeoutMs?: number;
    /** Stops everything and rejects when it aborts. */
    signal?: AbortSignal;
}

/** A loaded page in a private headless browser instance. */
export interface HeadlessPage {
    /** Sends a protocol command to the loaded page and resolves with its result. */
    send<T = unknown>(method: string, params?: object): Promise<T>;
    /** Closes the browser and deletes its temporary profile. Safe to call more than once. */
    dispose(): Promise<void>;
}
