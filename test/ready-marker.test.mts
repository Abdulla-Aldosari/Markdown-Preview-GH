/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReadyExpression, readyMarkerAttribute } from '../src/headless/ready-marker.mts';

test('the expression is valid JavaScript for both modes', () => {
    for (const waitForMarker of [true, false]) {
        assert.doesNotThrow(() => new Function(`return ${buildReadyExpression(waitForMarker)};`));
    }
});

test('the expression subscribes before its first check, so a marker set at any moment is seen', () => {
    const expression = buildReadyExpression(true);
    const observe = expression.indexOf('observer.observe(');
    const firstCheck = expression.lastIndexOf('check();');
    assert.ok(observe !== -1 && firstCheck !== -1);
    assert.ok(observe < firstCheck, 'the observer must exist before the first check');
    assert.ok(expression.includes("addEventListener('load', check)"), 'the load event re-runs the check');
});

/** Runs the expression against a minimal document and returns whether it resolved. */
async function resolves(waitForMarker: boolean, document: { readyState: string; marked: boolean }): Promise<'resolved' | 'pending'> {
    const listeners: Array<() => void> = [];
    const observers: Array<() => void> = [];
    const root = { hasAttribute: () => document.marked, observed: false };
    const sandbox = {
        document: { readyState: document.readyState, documentElement: root },
        window: { addEventListener: (_name: string, listener: () => void) => listeners.push(listener), removeEventListener: () => undefined },
        MutationObserver: class {
            constructor(callback: () => void) {
                observers.push(callback);
            }
            observe(): void {
                root.observed = true;
            }
            disconnect(): void {}
        },
    };
    const run = new Function('document', 'window', 'MutationObserver', `return ${buildReadyExpression(waitForMarker)};`) as (
        d: unknown,
        w: unknown,
        m: unknown
    ) => Promise<boolean>;
    const promise = run(sandbox.document, sandbox.window, sandbox.MutationObserver);
    let state: 'resolved' | 'pending' = 'pending';
    void promise.then(() => (state = 'resolved'));
    await Promise.resolve();
    if (state === 'pending' && document.readyState !== 'complete') {
        sandbox.document.readyState = 'complete';
        listeners.forEach((listener) => listener());
        await Promise.resolve();
    }
    if (state === 'pending' && document.marked) {
        observers.forEach((callback) => callback());
        await Promise.resolve();
    }
    return state;
}

test('a page without diagrams resolves once it has loaded', async () => {
    assert.equal(await resolves(false, { readyState: 'complete', marked: false }), 'resolved');
    assert.equal(await resolves(false, { readyState: 'loading', marked: false }), 'resolved', 'after the load event');
});

test('a page with diagrams stays pending until the marker is set', async () => {
    assert.equal(await resolves(true, { readyState: 'complete', marked: false }), 'pending');
    assert.equal(await resolves(true, { readyState: 'complete', marked: true }), 'resolved');
});

test('the expression names the marker attribute only where it waits for it', () => {
    assert.equal(readyMarkerAttribute, 'data-mpgh-ready');
    assert.match(buildReadyExpression(true), /!true \|\| root\.hasAttribute\('data-mpgh-ready'\)/);
    assert.match(buildReadyExpression(false), /!false \|\| root\.hasAttribute/);
});
