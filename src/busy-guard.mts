/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * A guard that lets only one task per key run at a time. A command that
 * takes a while (preparing a page) uses it to ignore repeated invocations
 * for the same document instead of queueing them. Pure logic with no
 * `vscode` import.
 */

export interface BusyGuard {
    /**
     * Marks a key as busy.
     * @returns A function that releases the key, or `undefined` when the key
     * is already busy.
     */
    tryEnter(key: string): (() => void) | undefined;
}

export function createBusyGuard(): BusyGuard {
    const busy = new Set<string>();
    return {
        tryEnter(key: string): (() => void) | undefined {
            if (busy.has(key)) {
                return undefined;
            }
            busy.add(key);
            let released = false;
            return () => {
                if (!released) {
                    released = true;
                    busy.delete(key);
                }
            };
        },
    };
}
