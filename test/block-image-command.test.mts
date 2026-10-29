/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlockImageController, scaleNoticeAction, scaleNoticeMessage, unavailableMessage, type BlockImageHost } from '../src/block-image-command.mts';
import { copyImageCommandId, type BlockImageScale } from '../src/block-image-protocol.mts';

interface FakeHost extends BlockImageHost {
    commands: string[];
    listFails: boolean;
    executeError: Error | undefined;
    executed: Array<{ id: string; argument: { id: string; resource: string } }>;
    keyWrites: boolean[];
    errors: string[];
    scale: BlockImageScale;
    radius: number;
    explicit: boolean;
    noticeShown: boolean;
    noticeReply: boolean;
    notices: Array<{ message: string; action: string }>;
    settingsOpened: number;
    markFails: boolean;
}

function createHost(commands: string[] = [copyImageCommandId]): FakeHost {
    const host: FakeHost = {
        commands,
        listFails: false,
        executeError: undefined,
        executed: [],
        keyWrites: [],
        errors: [],
        scale: 1,
        radius: 10,
        explicit: false,
        noticeShown: false,
        noticeReply: false,
        notices: [],
        settingsOpened: 0,
        markFails: false,
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
        readScale() {
            return host.scale;
        },
        readRadius() {
            return host.radius;
        },
        isScaleExplicit() {
            return host.explicit;
        },
        scaleNoticeShown() {
            return host.noticeShown;
        },
        async markScaleNoticeShown() {
            if (host.markFails) {
                throw new Error('state failed');
            }
            host.noticeShown = true;
        },
        async showScaleNotice(message, action) {
            host.notices.push({ message, action });
            return host.noticeReply;
        },
        async openScaleSettings() {
            host.settingsOpened++;
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
    assert.deepEqual(host.executed, [{ id: copyImageCommandId, argument: { id: 'mpgh-capture:table:3:1:10', resource: clicked.resource } }]);
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

test('copy asks for the scale and radius of the settings', async () => {
    const host = createHost();
    host.scale = 2.5;
    host.radius = 6;
    await createBlockImageController(host).copy('table', clicked);
    assert.equal(host.executed[0].argument.id, 'mpgh-capture:table:3:2.5:6');
});

/** Lets the notice, which is not waited for, run to its end. */
async function settle(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
}

test('the first copy at the default scale tells the user once how to enlarge the image', async () => {
    const host = createHost();
    const controller = createBlockImageController(host);
    await controller.copy('table', clicked);
    await settle();
    assert.deepEqual(host.notices, [{ message: scaleNoticeMessage, action: scaleNoticeAction }]);
    assert.equal(host.noticeShown, true);
    await controller.copy('table', clicked);
    await controller.copy('code', { ...clicked, mpghBlock: 'code' });
    await settle();
    assert.equal(host.notices.length, 1, 'never again');
});

test('the notice names the setting and the actual size, and says zoom does not change it', () => {
    assert.match(scaleNoticeMessage, /scale 1/);
    assert.match(scaleNoticeMessage, /Block Image Scale/);
    assert.match(scaleNoticeMessage, /zoom/i);
    assert.match(scaleNoticeMessage, /display scal/i);
    assert.equal(scaleNoticeAction, 'Open Settings');
});

test('the notice never comes back in a window that remembers it', async () => {
    const host = createHost();
    host.noticeShown = true;
    await createBlockImageController(host).copy('table', clicked);
    await settle();
    assert.deepEqual(host.notices, []);
});

test('no notice for a user who chose a scale, whatever it is, the default included', async () => {
    for (const scale of [1, 2] as const) {
        const host = createHost();
        host.scale = scale;
        host.explicit = true;
        await createBlockImageController(host).copy('table', clicked);
        await settle();
        assert.deepEqual(host.notices, [], `explicit scale ${scale}`);
        assert.equal(host.noticeShown, false, 'the notice stays available');
    }
});

test('no notice when the scale is not the default, even if it was never written', async () => {
    const host = createHost();
    host.scale = 3;
    await createBlockImageController(host).copy('table', clicked);
    await settle();
    assert.deepEqual(host.notices, []);
});

test('no notice for a copy that failed or was refused', async () => {
    const failing = createHost();
    failing.executeError = new Error('boom');
    await createBlockImageController(failing).copy('table', clicked);
    const refused = createHost();
    await createBlockImageController(refused).copy('code', clicked);
    const gone = createHost([]);
    await createBlockImageController(gone).copy('table', clicked);
    await settle();
    for (const host of [failing, refused, gone]) {
        assert.deepEqual(host.notices, []);
        assert.equal(host.noticeShown, false);
    }
});

test('the notice opens the settings only when its action is chosen', async () => {
    const dismissed = createHost();
    await createBlockImageController(dismissed).copy('table', clicked);
    await settle();
    assert.equal(dismissed.settingsOpened, 0);
    const chosen = createHost();
    chosen.noticeReply = true;
    await createBlockImageController(chosen).copy('table', clicked);
    await settle();
    assert.equal(chosen.settingsOpened, 1);
});

test('a notice that cannot be remembered is not shown, and the copy still succeeds', async () => {
    const host = createHost();
    host.markFails = true;
    const controller = createBlockImageController(host);
    await controller.copy('table', clicked);
    await controller.copy('table', clicked);
    await settle();
    assert.deepEqual(host.notices, [], 'it would repeat at every copy');
    assert.deepEqual(host.errors, [], 'a copy that worked reports no error');
    assert.equal(host.executed.length, 2);
});
