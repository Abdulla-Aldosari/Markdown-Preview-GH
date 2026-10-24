/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The browser process: finding an installed browser and starting, wiring, and
 * stopping a private headless instance whose DevTools pipe feeds a protocol
 * client. It imports Node built-ins, so only the desktop entry point may load
 * it.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { locateBrowser, type BrowserLookup } from './browser-locator.mts';
import { createCdpClient, type CdpClient } from './cdp-pipe.mts';

const graceMs = 2_000;

/** The first executable named `name` on `PATH`, or `undefined`. */
function findOnPath(name: string): string | undefined {
    const separator = process.platform === 'win32' ? ';' : ':';
    for (const directory of (process.env['PATH'] ?? '').split(separator)) {
        if (!directory) {
            continue;
        }
        const candidate = path.join(directory, name);
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            if (fs.statSync(candidate).isFile()) {
                return candidate;
            }
        } catch {
            // Not here; keep looking.
        }
    }
    return undefined;
}

/** Looks for a browser on this machine. */
export function detectBrowser(configuredPath: string | undefined): BrowserLookup {
    return locateBrowser(configuredPath, {
        platform: process.platform,
        env: process.env,
        exists: (candidate) => {
            try {
                return fs.statSync(candidate).isFile();
            } catch {
                return false;
            }
        },
        findOnPath,
    });
}

/**
 * The launch arguments. `--edge-skip-compat-layer-relaunch` stops Edge from
 * re-launching itself through its compatibility layer, which makes the first
 * process exit at once and closes the pipe.
 */
export function buildBrowserArguments(profileDirectory: string): string[] {
    return [
        '--headless=new',
        '--remote-debugging-pipe',
        '--edge-skip-compat-layer-relaunch',
        '--no-first-run',
        '--disable-extensions',
        '--disable-gpu',
        `--user-data-dir=${profileDirectory}`,
        'about:blank',
    ];
}

export interface BrowserProcess {
    /** The protocol client wired to the browser's pipe. */
    client: CdpClient;
    /** Stops the browser and deletes its temporary profile. Safe to call more than once. */
    dispose(): Promise<void>;
}

/** Deletes a profile directory; Windows can hold it briefly after the browser exits. */
async function removeProfile(directory: string): Promise<void> {
    try {
        await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
        // A leftover temporary directory is harmless and the operating system cleans it up.
    }
}

/**
 * Starts a private headless browser with a temporary profile.
 * @throws When the process cannot be created.
 */
export async function startBrowserProcess(executablePath: string): Promise<BrowserProcess> {
    const profileDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mpgh-browser-'));
    let child: ChildProcess;
    try {
        child = spawn(executablePath, buildBrowserArguments(profileDirectory), {
            stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
    } catch (error) {
        await removeProfile(profileDirectory);
        throw error;
    }
    const input = child.stdio[3] as Writable;
    const output = child.stdio[4] as Readable;
    const client = createCdpClient((text) => {
        input.write(text);
    });
    output.on('data', (chunk: Buffer) => client.receive(chunk));
    input.on('error', () => undefined);

    const exited = new Promise<void>((resolve) => {
        child.once('exit', (code) => {
            client.close(new Error(`The browser exited unexpectedly (exit code ${code ?? 'unknown'}).`));
            resolve();
        });
        child.once('error', (error) => {
            client.close(new Error(`The browser could not be started: ${error.message}`));
            resolve();
        });
    });

    let disposed = false;
    return {
        client,
        async dispose(): Promise<void> {
            if (disposed) {
                return;
            }
            disposed = true;
            client.close(new Error('The browser was closed.'));
            if (child.exitCode === null && child.signalCode === null) {
                child.kill();
                const forced = setTimeout(() => child.kill('SIGKILL'), graceMs);
                await exited;
                clearTimeout(forced);
            }
            await removeProfile(profileDirectory);
        },
    };
}
