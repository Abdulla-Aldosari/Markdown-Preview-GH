/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlockImageController, unavailableMessage, type BlockImageHost } from '../src/block-image-command.mts';
import { copyImageCommandId } from '../src/block-image-protocol.mts';

interface FakeHost extends BlockImageHost {
    commands: string[];
    listFails: boolean;
    executeError: Error | undefined;
    executed: Array<{ id: string; argument: { id: string; resource: string } }>;
    keyWrites: boolean[];
    errors: string[];
}

function createHost(commands: string[] = [copyImageCommandId]): FakeHost {
    const host: FakeHost = {
        commands,
        listFails: false,
        executeError: undefined,
        executed: [],
        keyWrites: [],
        errors: [],
        async listCommands() {
            if (host.listFails) {
                throw new Error('list failed');
            }
            return host.commands;
        },
        async executeCommand(id, argument) {
            host.executed.push({ id, argument });
            if (host.executeError) {
                throw host.executeError;
            }
            return undefined;
        },
        async setAvailable(available) {
            host.keyWrites.push(available);
        },
        showError(message) {
            host.errors.push(message);
        },
    };
    return host;
}

const clicked = { resource: 'file:///d%3A/ws/doc.md', mpghBlock: 'table', mpghIndex: 3 };

test('refresh reports availability and writes the key only when it changes', async () => {
    const host = createHost();
    const controller = createBlockImageController(host);
    assert.equal(await controller.refresh(), true);
    assert.equal(await controller.refresh(), true);
    assert.deepEqual(host.keyWrites, [true]);
    host.commands = [];
    assert.equal(await controller.refresh(), false);
    assert.equal(await controller.refresh(), false);
    assert.deepEqual(host.keyWrites, [true, false]);
    host.commands = [copyImageCommandId];
    assert.equal(await controller.refresh(), true);
    assert.deepEqual(host.keyWrites, [true, false, true]);
});

test('the first refresh writes the key even when the command is missing', async () => {
    const host = createHost([]);
    const controller = createBlockImageController(host);
    assert.equal(await controller.refresh(), false);
    assert.deepEqual(host.keyWrites, [false]);
});

test('a failing command listing counts as unavailable', async () => {
    const host = createHost();
    host.listFails = true;
    const controller = createBlockImageController(host);
    assert.equal(await controller.refresh(), false);
    assert.deepEqual(host.keyWrites, [false]);
});

test('copy asks the preview to capture the block that was clicked', async () => {
    const host = createHost();
    await createBlockImageController(host).copy('table', clicked);
    assert.deepEqual(host.errors, []);
    assert.deepEqual(host.executed, [{ id: copyImageCommandId, argument: { id: 'mpgh-capture:table:3', resource: clicked.resource } }]);
});

test('copy refuses a context that does not name its own kind', async () => {
    const host = createHost();
    const controller = createBlockImageController(host);
    await controller.copy('code', clicked);
    await controller.copy('table', undefined);
    await controller.copy('table', { ...clicked, mpghIndex: -1 });
    assert.deepEqual(host.executed, []);
    assert.equal(host.errors.length, 3);
    assert.equal(host.errors[0], 'Right-click a code block in the preview to copy it as an image.');
    assert.equal(host.errors[1], 'Right-click a table in the preview to copy it as an image.');
});

test('copy tells the user and does nothing when the preview command has gone', async () => {
    const host = createHost();
    const controller = createBlockImageController(host);
    await controller.refresh();
    host.commands = [];
    await controller.copy('table', clicked);
    assert.deepEqual(host.executed, []);
    assert.deepEqual(host.errors, [unavailableMessage]);
    assert.deepEqual(host.keyWrites, [true, false], 'the stale key is corrected');
});

test('copy reports a failing command and re-checks availability', async () => {
    const host = createHost();
    host.executeError = new Error('boom');
    const controller = createBlockImageController(host);
    await controller.copy('diagram', { ...clicked, mpghBlock: 'diagram' });
    assert.deepEqual(host.errors, ['Could not copy the diagram as an image: boom']);
    assert.deepEqual(host.keyWrites, [true]);
    host.commands = [];
    await controller.copy('diagram', { ...clicked, mpghBlock: 'diagram' });
    assert.equal(host.errors.length, 2);
    assert.equal(host.errors[1], unavailableMessage);
});

test('copy reports a rejection that is not an Error', async () => {
    const host = createHost();
    host.executeError = 'plain text' as unknown as Error;
    await createBlockImageController(host).copy('section', { ...clicked, mpghBlock: 'section' });
    assert.deepEqual(host.errors, ['Could not copy the section as an image: plain text']);
});
