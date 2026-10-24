/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateBrowser, type LocatorEnvironment } from '../src/headless/browser-locator.mts';

function environment(overrides: Partial<LocatorEnvironment> & { files?: string[]; onPath?: string[] }): LocatorEnvironment {
    const files = new Set(overrides.files ?? []);
    const onPath = overrides.onPath ?? [];
    return {
        platform: overrides.platform ?? 'win32',
        env: overrides.env ?? {},
        exists: (candidate) => files.has(candidate),
        findOnPath: (name) => (onPath.includes(name) ? `/usr/bin/${name}` : undefined),
    };
}

const windowsEnv = { 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' };
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

test('a filled setting that exists wins over detection', () => {
    const lookup = locateBrowser('D:\\b\\chrome.exe', environment({ env: windowsEnv, files: ['D:\\b\\chrome.exe', edge] }));
    assert.deepEqual(lookup, { kind: 'found', path: 'D:\\b\\chrome.exe', source: 'setting' });
});

test('a filled setting that does not exist is reported and never replaced', () => {
    const lookup = locateBrowser('  D:\\missing.exe  ', environment({ env: windowsEnv, files: [edge] }));
    assert.deepEqual(lookup, { kind: 'settingMissing', path: 'D:\\missing.exe' });
});

test('an empty or blank setting falls back to detection', () => {
    assert.equal(locateBrowser('   ', environment({ env: windowsEnv, files: [edge] })).kind, 'found');
    assert.equal(locateBrowser(undefined, environment({ env: windowsEnv, files: [edge] })).kind, 'found');
});

test('Windows prefers Edge over Chrome', () => {
    assert.deepEqual(locateBrowser(undefined, environment({ env: windowsEnv, files: [chrome, edge] })), { kind: 'found', path: edge, source: 'detected' });
});

test('Windows falls back to Chrome and then to nothing', () => {
    assert.deepEqual(locateBrowser(undefined, environment({ env: windowsEnv, files: [chrome] })), { kind: 'found', path: chrome, source: 'detected' });
    assert.deepEqual(locateBrowser(undefined, environment({ env: windowsEnv })), { kind: 'notFound' });
});

test('Windows with no known install roots finds nothing', () => {
    assert.deepEqual(locateBrowser(undefined, environment({ env: {} })), { kind: 'notFound' });
});

test('macOS looks in the Applications bundles', () => {
    const mac = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    assert.deepEqual(locateBrowser(undefined, environment({ platform: 'darwin', files: [mac] })), { kind: 'found', path: mac, source: 'detected' });
    assert.deepEqual(locateBrowser(undefined, environment({ platform: 'darwin' })), { kind: 'notFound' });
});

test('Linux walks the executable names on PATH in order', () => {
    assert.deepEqual(locateBrowser(undefined, environment({ platform: 'linux', onPath: ['chromium', 'microsoft-edge'] })), {
        kind: 'found',
        path: '/usr/bin/chromium',
        source: 'detected',
    });
    assert.deepEqual(locateBrowser(undefined, environment({ platform: 'linux', onPath: ['google-chrome', 'chromium'] })), {
        kind: 'found',
        path: '/usr/bin/google-chrome',
        source: 'detected',
    });
    assert.deepEqual(locateBrowser(undefined, environment({ platform: 'linux' })), { kind: 'notFound' });
});
