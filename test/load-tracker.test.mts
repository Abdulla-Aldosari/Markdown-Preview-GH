/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoadTracker } from '../src/headless/load-tracker.mts';

type State = 'pending' | 'loaded';

function watch(promise: Promise<void>): { state(): State } {
    let state: State = 'pending';
    void promise.then(() => (state = 'loaded'));
    return { state: () => state };
}

const load = (loaderId: string, sessionId = 's1') => ({ method: 'Page.lifecycleEvent', params: { name: 'load', loaderId }, sessionId });

test('whenLoaded waits for the load event of that exact navigation', async () => {
    const tracker = createLoadTracker('s1');
    const watcher = watch(tracker.whenLoaded('page'));
    tracker.handle(load('blank'));
    await Promise.resolve();
    assert.equal(watcher.state(), 'pending', 'the load of the page shown before must not count');
    tracker.handle(load('page'));
    await Promise.resolve();
    assert.equal(watcher.state(), 'loaded');
});

test('a load that fired before the wait started still resolves it', async () => {
    const tracker = createLoadTracker('s1');
    tracker.handle(load('page'));
    await tracker.whenLoaded('page');
});

test('events of another session, other lifecycle names, and malformed events are ignored', async () => {
    const tracker = createLoadTracker('s1');
    const watcher = watch(tracker.whenLoaded('page'));
    tracker.handle(load('page', 'other'));
    tracker.handle({ method: 'Page.lifecycleEvent', params: { name: 'DOMContentLoaded', loaderId: 'page' }, sessionId: 's1' });
    tracker.handle({ method: 'Page.frameNavigated', params: { name: 'load', loaderId: 'page' }, sessionId: 's1' });
    tracker.handle({ method: 'Page.lifecycleEvent', params: { name: 'load' }, sessionId: 's1' });
    await Promise.resolve();
    assert.equal(watcher.state(), 'pending');
});

test('several waiters for the same navigation are all released', async () => {
    const tracker = createLoadTracker('s1');
    const first = watch(tracker.whenLoaded('page'));
    const second = watch(tracker.whenLoaded('page'));
    tracker.handle(load('page'));
    await Promise.resolve();
    assert.equal(first.state(), 'loaded');
    assert.equal(second.state(), 'loaded');
});
