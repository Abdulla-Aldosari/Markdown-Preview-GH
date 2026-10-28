/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Knows when a navigation has finished loading. `Page.navigate` answers as
 * soon as the new document is committed, not when it has loaded, and the
 * page the browser showed before (a blank one that is already complete) is
 * still the one a script would run in until then. The `load` lifecycle event
 * carries the `loaderId` of the navigation that `Page.navigate` returned, so
 * waiting for that exact event is the only reliable signal. Pure logic with
 * no Node and no `vscode` imports.
 */

import type { CdpEvent } from './cdp-pipe.mts';

export interface LoadTracker {
    /** Feeds every protocol event; the ones that are not this session's `load` are ignored. */
    handle(event: CdpEvent): void;
    /** Resolves once the navigation with this `loaderId` has fired `load`, even if it fired earlier. */
    whenLoaded(loaderId: string): Promise<void>;
}

/** Creates a tracker for one attached session. */
export function createLoadTracker(sessionId: string): LoadTracker {
    const loaded = new Set<string>();
    const waiting = new Map<string, Array<() => void>>();
    return {
        handle(event: CdpEvent): void {
            if (event.method !== 'Page.lifecycleEvent' || event.sessionId !== sessionId) {
                return;
            }
            const { name, loaderId } = event.params;
            if (name !== 'load' || typeof loaderId !== 'string') {
                return;
            }
            loaded.add(loaderId);
            for (const resolve of waiting.get(loaderId) ?? []) {
                resolve();
            }
            waiting.delete(loaderId);
        },
        whenLoaded(loaderId: string): Promise<void> {
            if (loaded.has(loaderId)) {
                return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
                waiting.set(loaderId, [...(waiting.get(loaderId) ?? []), resolve]);
            });
        },
    };
}
