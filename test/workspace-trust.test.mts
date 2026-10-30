/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTrustGate, TRUST_GATE_BLOCK_MESSAGE } from '../src/workspace-trust.mts';

test('a trusted workspace allows the gated commands', () => {
    assert.deepEqual(evaluateTrustGate(true), { allowed: true });
});

test('an untrusted workspace blocks the gated commands with the block message', () => {
    assert.deepEqual(evaluateTrustGate(false), { allowed: false, message: TRUST_GATE_BLOCK_MESSAGE });
});
