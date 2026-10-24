/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeMachine } from '../src/headless/machine-label.mts';
import { readHostInfo } from '../src/headless/host-info.mts';

test('a local window is this computer and not remote', () => {
    assert.deepEqual(describeMachine(undefined, { hostName: 'HOME-PC' }), { label: 'this computer', remote: false });
    assert.deepEqual(describeMachine('', undefined), { label: 'this computer', remote: false });
});

test('WSL is named by its distribution, falling back to the host name', () => {
    assert.deepEqual(describeMachine('wsl', { hostName: 'HOME-PC', wslDistro: 'Ubuntu-22.04' }), { label: 'WSL: Ubuntu-22.04', remote: true });
    assert.deepEqual(describeMachine('wsl', { hostName: 'HOME-PC' }), { label: 'WSL: HOME-PC', remote: true });
});

test('SSH, containers, Codespaces, and tunnels are named by their host name', () => {
    assert.equal(describeMachine('ssh-remote', { hostName: 'build-01' }).label, 'the SSH host "build-01"');
    assert.equal(describeMachine('dev-container', { hostName: 'abc123' }).label, 'the container "abc123"');
    assert.equal(describeMachine('attached-container', { hostName: 'abc123' }).label, 'the container "abc123"');
    assert.equal(describeMachine('codespaces', { hostName: 'cs-1' }).label, 'the Codespace "cs-1"');
    assert.equal(describeMachine('tunnel', { hostName: 'laptop' }).label, 'the tunnel machine "laptop"');
    for (const name of ['ssh-remote', 'dev-container', 'codespaces', 'tunnel']) {
        assert.equal(describeMachine(name, { hostName: 'h' }).remote, true, name);
    }
});

test('an unknown remote kind still names the machine and the kind', () => {
    assert.deepEqual(describeMachine('future-remote', { hostName: 'h1' }), { label: 'the remote machine "h1" (future-remote)', remote: true });
});

test('missing host facts never leave the label empty', () => {
    assert.equal(describeMachine('ssh-remote', undefined).label, 'the SSH host "unknown host"');
    assert.equal(describeMachine('ssh-remote', { hostName: '' }).label, 'the SSH host "unknown host"');
});

test('readHostInfo reports this machine', () => {
    const info = readHostInfo();
    assert.ok(info.hostName.length > 0);
    assert.equal(info.wslDistro, process.env['WSL_DISTRO_NAME'] || undefined);
});
