/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure logic of the temporary page server used by `Open in Browser` and
 * `Print...` in remote windows: the unguessable page path, route matching,
 * and the choice between opening a local file and serving the page. No
 * `vscode` and no Node imports, so it is unit-testable and safe for any
 * bundle; the server itself lives in `page-server.mts`.
 */

/** A page that is being served on the loopback interface of the extension host. */
export interface ServedPage {
    /** The port the server listens on (loopback only). */
    port: number;
    /** The only path that serves the page, including its random token. */
    path: string;
    /** Stops the server now. Safe to call more than once. */
    dispose(): void;
    /** Settles once the server has stopped, for any reason. */
    closed: Promise<void>;
}

/** The Node-only service the desktop entry point injects into the extension. */
export interface DesktopServices {
    /** Serves one page and returns where to find it. */
    servePage(html: string): Promise<ServedPage>;
}

/** The number of random bytes behind a page token (128 bits). */
export const pageTokenByteLength = 16;

/**
 * Builds the unguessable token of a served page.
 * @param randomBytes A cryptographically secure source of random bytes.
 */
export function createPageToken(randomBytes: (length: number) => Uint8Array): string {
    const bytes = randomBytes(pageTokenByteLength);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The path that serves the page of a token. */
export function pagePath(token: string): string {
    return `/${token}/index.html`;
}

export type PageRoute = 'page' | 'notFound';

/**
 * Decides what a request URL asks for. Only the exact page path matches; a
 * query string is ignored, everything else is not found.
 * @param requestUrl The raw request URL (`req.url`).
 */
export function matchPageRoute(requestUrl: string | undefined, token: string): PageRoute {
    if (!token || !requestUrl) {
        return 'notFound';
    }
    const queryStart = requestUrl.indexOf('?');
    const pathname = queryStart === -1 ? requestUrl : requestUrl.slice(0, queryStart);
    return pathname === pagePath(token) ? 'page' : 'notFound';
}

export type OpenMode = 'file' | 'served' | 'unsupported';

/**
 * Chooses how an exported page reaches the user's browser. A local window
 * opens the temporary file directly. A remote window cannot: the file sits
 * on the remote disk, so the page is served and the port is forwarded.
 * @param remoteName `vscode.env.remoteName`; `undefined` in a local window.
 * @param canServe Whether the Node-only server was injected (desktop bundle).
 */
export function chooseOpenMode(remoteName: string | undefined, canServe: boolean): OpenMode {
    if (!remoteName) {
        return 'file';
    }
    return canServe ? 'served' : 'unsupported';
}
