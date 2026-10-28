/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Opens a page in a private headless browser and waits until it is ready,
 * speaking the Chrome DevTools Protocol over the browser's pipe. It imports
 * Node built-ins through `browser-process.mts`, so only the desktop entry
 * point may load it.
 */

import { startBrowserProcess } from './browser-process.mts';
import type { HeadlessPage, HeadlessPageOptions } from './headless-types.mts';
import { createLoadTracker } from './load-tracker.mts';
import { assertReady, buildReadyExpression, type ReadyReply } from './ready-marker.mts';

const defaultTimeoutMs = 120_000;

/**
 * Starts a private browser, opens the page, and waits until it is ready.
 * The caller owns the returned page and must `dispose` it.
 * @throws When the browser cannot start, exits early, the page fails to load, the timeout passes, or the signal aborts.
 */
export async function openHeadlessPage(options: HeadlessPageOptions): Promise<HeadlessPage> {
    const browser = await startBrowserProcess(options.executablePath);
    const { client } = browser;
    let timer: NodeJS.Timeout | undefined;
    let abortListener: (() => void) | undefined;

    const failure = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('The browser took too long to finish the page.')), options.timeoutMs ?? defaultTimeoutMs);
        abortListener = () => reject(new Error('The export was cancelled.'));
        if (options.signal?.aborted) {
            abortListener();
        } else {
            options.signal?.addEventListener('abort', abortListener, { once: true });
        }
    });
    // The race below observes it; this keeps a late rejection from being unhandled.
    failure.catch(() => undefined);

    function stopWatching(): void {
        clearTimeout(timer);
        if (abortListener) {
            options.signal?.removeEventListener('abort', abortListener);
        }
    }

    const load = async (): Promise<HeadlessPage> => {
        const { targetId } = await client.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await client.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
        // Subscribe before navigating so the `load` event can never be missed.
        const tracker = createLoadTracker(sessionId);
        const unsubscribe = client.onEvent((event) => tracker.handle(event));
        try {
            await client.send('Page.enable', {}, sessionId);
            await client.send('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId);
            const navigation = await client.send<{ loaderId?: string; errorText?: string }>('Page.navigate', { url: options.url }, sessionId);
            if (navigation.errorText) {
                throw new Error(`The page could not be loaded: ${navigation.errorText}`);
            }
            if (!navigation.loaderId) {
                throw new Error('The browser did not start loading the page.');
            }
            // Until this document has loaded, a script would still run in the blank page shown before it.
            await tracker.whenLoaded(navigation.loaderId);
        } finally {
            unsubscribe();
        }
        const ready = await client.send<ReadyReply>(
            'Runtime.evaluate',
            { expression: buildReadyExpression(options.waitForMarker), awaitPromise: true, returnByValue: true },
            sessionId
        );
        assertReady(ready);
        return {
            send: <T = unknown,>(method: string, params?: object) => client.send<T>(method, params, sessionId),
            async dispose(): Promise<void> {
                stopWatching();
                await browser.dispose();
            },
        };
    };

    try {
        return await Promise.race([load(), failure]);
    } catch (error) {
        stopWatching();
        await browser.dispose();
        throw error;
    }
}
