/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * A temporary HTTP server that serves exactly one page on the loopback
 * interface. Used by `Open in Browser` and `Print...` in remote windows,
 * where the extension host cannot hand the browser a local file. It imports
 * Node built-ins, so only the desktop entry point may load it.
 */

import { randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPageToken, matchPageRoute, pagePath, type ServedPage } from './page-server-routes.mts';

export interface PageServerOptions {
    /** The page to serve. */
    html: string;
    /** Stops the server this long after it starts when nobody has fetched the page. */
    unservedTimeoutMs?: number;
    /** Stops the server this long after the page was last fetched. */
    servedTimeoutMs?: number;
}

const defaultUnservedTimeoutMs = 60_000;
const defaultServedTimeoutMs = 30_000;

/**
 * Starts a server that answers `GET` and `HEAD` for one unguessable path on
 * `127.0.0.1` and returns 404 for everything else. It stops on its own after
 * a timeout, and on `dispose`.
 */
export async function startPageServer(options: PageServerOptions): Promise<ServedPage> {
    const unservedTimeoutMs = options.unservedTimeoutMs ?? defaultUnservedTimeoutMs;
    const servedTimeoutMs = options.servedTimeoutMs ?? defaultServedTimeoutMs;
    const token = createPageToken(randomBytes);
    const path = pagePath(token);
    const body = Buffer.from(options.html, 'utf-8');

    let timer: NodeJS.Timeout | undefined;
    let disposed = false;
    let markClosed: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
        markClosed = resolve;
    });

    const server = http.createServer((request, response) => {
        const method = request.method ?? '';
        if (method !== 'GET' && method !== 'HEAD') {
            response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Method Not Allowed');
            return;
        }
        if (matchPageRoute(request.url, token) !== 'page') {
            response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('Not Found');
            return;
        }
        response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': body.length,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        });
        response.end(method === 'HEAD' ? undefined : body);
        if (method === 'GET') {
            arm(servedTimeoutMs);
        }
    });

    function dispose(): void {
        if (disposed) {
            return;
        }
        disposed = true;
        clearTimeout(timer);
        server.close(() => markClosed());
        server.closeAllConnections();
    }

    function arm(delayMs: number): void {
        clearTimeout(timer);
        timer = setTimeout(dispose, delayMs);
        timer.unref();
    }

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    arm(unservedTimeoutMs);

    return { port: (server.address() as AddressInfo).port, path, dispose, closed };
}
