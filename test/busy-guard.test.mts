/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBusyGuard } from '../src/busy-guard.mts';

test('a busy key cannot be entered again until it is released', () => {
    const guard = createBusyGuard();
    const release = guard.tryEnter('a');
    assert.equal(typeof release, 'function');
    assert.equal(guard.tryEnter('a'), undefined);
    release?.();
    assert.equal(typeof guard.tryEnter('a'), 'function');
});

test('different keys are independent', () => {
    const guard = createBusyGuard();
    assert.equal(typeof guard.tryEnter('a'), 'function');
    assert.equal(typeof guard.tryEnter('b'), 'function');
});

test('a stale release does not free a key that was entered again', () => {
    const guard = createBusyGuard();
    const first = guard.tryEnter('a');
    first?.();
    const second = guard.tryEnter('a');
    first?.();
    assert.equal(guard.tryEnter('a'), undefined, 'the second holder still owns the key');
    second?.();
    assert.equal(typeof guard.tryEnter('a'), 'function');
});
