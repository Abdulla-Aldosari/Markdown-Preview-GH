/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    BrowserExitError,
    createBrowserExitError,
    createOutputTail,
    describeBrowserExit,
    describePdfFailure,
    guideUrlFor,
    isSandboxFailure,
    openGuideLabel,
    outputTailLimit,
    sandboxGuideUrl,
} from '../src/headless/browser-exit.mts';

const encoder = new TextEncoder();

/** Standard error of Chromium in a container without a setuid helper. */
const noUsableSandbox =
    '[15394:15394:1028/204704.373805:ERROR:content/browser/zygote_host/zygote_host_impl_linux.cc:130] No usable sandbox! If this is a Debian system, please install the chromium-sandbox package to solve this problem.\n';

/** Standard error of Chromium in a container whose setuid helper may not create namespaces. */
const helperRefused = [
    'Failed to move to new namespace: PID namespaces supported, Network namespace supported, but failed: errno = Operation not permitted',
    '[32961:32961:1028/223508.929438:FATAL:content/browser/zygote_host/zygote_host_impl_linux.cc:228] Zygote process exited prematurely with exit code 1',
    '[1028/223508.936260:ERROR:third_party/crashpad/crashpad/util/file/file_io_posix.cc:145] open /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq: No such file or directory (2)',
    '',
].join('\n');

test('the output tail keeps only the last characters', () => {
    const tail = createOutputTail(10);
    tail.push(encoder.encode('0123456789'));
    tail.push(encoder.encode('abcdef'));
    assert.equal(tail.text(), '6789abcdef');
});

test('the output tail has a default limit', () => {
    const tail = createOutputTail();
    tail.push(encoder.encode('x'.repeat(outputTailLimit + 100)));
    assert.equal(tail.text().length, outputTailLimit);
});

test('the output tail decodes a character split across chunks', () => {
    const tail = createOutputTail();
    const bytes = encoder.encode('é!');
    tail.push(bytes.subarray(0, 1));
    tail.push(bytes.subarray(1));
    assert.equal(tail.text(), 'é!');
});

test('both sandbox failures are recognized and ordinary output is not', () => {
    assert.ok(isSandboxFailure(noUsableSandbox));
    assert.ok(isSandboxFailure(helperRefused));
    assert.ok(!isSandboxFailure('error while loading shared libraries: libnss3.so'));
    assert.ok(!isSandboxFailure(''));
});

test('an exit code is reported with the last output lines', () => {
    const message = describeBrowserExit(127, null, 'first\n\nsecond\nthird\nerror while loading shared libraries: libnss3.so\n');
    assert.equal(message, 'The browser exited unexpectedly (exit code 127). Browser output: second | third | error while loading shared libraries: libnss3.so');
});

test('a signal is named instead of an unknown exit code', () => {
    assert.equal(describeBrowserExit(null, 'SIGABRT', ''), 'The browser exited unexpectedly (signal SIGABRT).');
});

test('a missing code and signal stay unknown', () => {
    assert.equal(describeBrowserExit(null, null, ''), 'The browser exited unexpectedly (exit code unknown).');
});

test('a blocked sandbox is explained and the guide is left to a button', () => {
    for (const [code, signal, output] of [
        [1, null, noUsableSandbox],
        [null, 'SIGABRT', helperRefused],
    ] as const) {
        const message = describeBrowserExit(code, signal, output);
        assert.match(message, /^The browser exited unexpectedly \((exit code 1|signal SIGABRT)\)\./);
        assert.match(message, /sandbox could not start/);
        assert.match(message, /Docker container/);
        assert.doesNotMatch(message, /https?:/, 'the link is a button, never text inside the message');
        assert.doesNotMatch(message, /Browser output/, 'the long raw output is replaced by the explanation');
    }
});

test('an exit error remembers whether the sandbox was the cause', () => {
    const blocked = createBrowserExitError(1, null, noUsableSandbox);
    assert.ok(blocked instanceof Error);
    assert.ok(blocked instanceof BrowserExitError);
    assert.equal(blocked.sandboxBlocked, true);
    assert.equal(blocked.message, describeBrowserExit(1, null, noUsableSandbox));
    assert.equal(createBrowserExitError(null, 'SIGABRT', helperRefused).sandboxBlocked, true);
    assert.equal(createBrowserExitError(127, null, 'libnss3.so: cannot open shared object file').sandboxBlocked, false);
});

test('a blocked sandbox offers the guide button on the PDF failure notice', () => {
    const notice = describePdfFailure(createBrowserExitError(1, null, noUsableSandbox));
    assert.ok(notice.message.startsWith('Failed to export Markdown as PDF: The browser exited unexpectedly (exit code 1). Its sandbox could not start'));
    assert.deepEqual(notice.actions, [openGuideLabel]);
});

test('every other PDF failure offers no button', () => {
    assert.deepEqual(describePdfFailure(createBrowserExitError(127, null, 'some other error\n')).actions, []);
    assert.deepEqual(describePdfFailure(new Error('The browser took too long to finish the page.')), {
        message: 'Failed to export Markdown as PDF: The browser took too long to finish the page.',
        actions: [],
    });
    assert.deepEqual(describePdfFailure('plain text'), { message: 'Failed to export Markdown as PDF: plain text', actions: [] });
});

test('only the guide button opens the guide', () => {
    assert.equal(guideUrlFor(openGuideLabel), sandboxGuideUrl);
    assert.equal(guideUrlFor('Open Settings'), undefined);
    assert.equal(guideUrlFor(undefined), undefined);
});

test('the guide link points at a heading that exists in the guide', () => {
    const [page, anchor] = sandboxGuideUrl.split('#');
    assert.equal(page, 'https://github.com/Abdulla-Aldosari/Markdown-Preview-GH/blob/main/docs/guide/troubleshooting.md');
    const guide = fs.readFileSync(new URL('../docs/guide/troubleshooting.md', import.meta.url), 'utf8');
    const anchors = [...guide.matchAll(/^#{1,6} (.+)$/gm)].map((match) =>
        match[1]
            .toLowerCase()
            .replace(/[^a-z0-9 -]/g, '')
            .replace(/ /g, '-')
    );
    assert.ok(anchors.includes(anchor), `no heading produces #${anchor}`);
});

test('a long output is shortened from the start', () => {
    const message = describeBrowserExit(1, null, `${'y'.repeat(2_000)}\n`);
    const quoted = message.slice(message.indexOf('Browser output: ') + 'Browser output: '.length);
    assert.ok(quoted.startsWith('...'));
    assert.equal(quoted.length, 503);
});
