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

test('the expression names the marker attribute only where it waits for it', () => {
    assert.equal(readyMarkerAttribute, 'data-mpgh-ready');
    assert.match(buildReadyExpression(true), /!true \|\| root\.hasAttribute\('data-mpgh-ready'\)/);
    assert.match(buildReadyExpression(false), /!false \|\| root\.hasAttribute/);
});
