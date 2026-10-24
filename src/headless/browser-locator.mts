/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure search for an installed Chromium-based browser. The file system, the
 * platform, the environment, and the `PATH` lookup are injected, so every
 * platform can be tested on any machine.
 */

export interface LocatorEnvironment {
    /** `process.platform`. */
    platform: string;
    /** `process.env`. */
    env: Record<string, string | undefined>;
    /** Whether a file exists at an absolute path. */
    exists(path: string): boolean;
    /** The full path of an executable found on `PATH`, if any. */
    findOnPath(name: string): string | undefined;
}

export type BrowserLookup =
    | { kind: 'found'; path: string; source: 'setting' | 'detected' }
    /** The `browserPath` setting is filled in, but nothing exists there. */
    | { kind: 'settingMissing'; path: string }
    | { kind: 'notFound' };

const linuxExecutableNames: readonly string[] = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];

const macBundles: readonly string[] = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

/** Windows install locations, Edge first (it ships with the system), then Chrome and Chromium. */
function windowsCandidates(env: Record<string, string | undefined>): string[] {
    const roots = [env['PROGRAMFILES(X86)'], env['PROGRAMFILES'], env['LOCALAPPDATA']].filter((root): root is string => Boolean(root));
    return [
        ...roots.map((root) => `${root}\\Microsoft\\Edge\\Application\\msedge.exe`),
        ...roots.map((root) => `${root}\\Google\\Chrome\\Application\\chrome.exe`),
        ...roots.map((root) => `${root}\\Chromium\\Application\\chrome.exe`),
    ];
}

/**
 * Finds the browser to drive.
 * @param configuredPath The `markdown-preview-gh.export.browserPath` setting. When it is filled in it is the only candidate: a wrong path is reported, never silently replaced.
 */
export function locateBrowser(configuredPath: string | undefined, environment: LocatorEnvironment): BrowserLookup {
    const configured = configuredPath?.trim();
    if (configured) {
        return environment.exists(configured) ? { kind: 'found', path: configured, source: 'setting' } : { kind: 'settingMissing', path: configured };
    }
    if (environment.platform === 'win32') {
        const path = windowsCandidates(environment.env).find((candidate) => environment.exists(candidate));
        return path ? { kind: 'found', path, source: 'detected' } : { kind: 'notFound' };
    }
    if (environment.platform === 'darwin') {
        const path = macBundles.find((candidate) => environment.exists(candidate));
        return path ? { kind: 'found', path, source: 'detected' } : { kind: 'notFound' };
    }
    for (const name of linuxExecutableNames) {
        const path = environment.findOnPath(name);
        if (path) {
            return { kind: 'found', path, source: 'detected' };
        }
    }
    return { kind: 'notFound' };
}
