/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Test support: gives the current test process a private temporary directory.
 * `node --test` runs test files in parallel processes that share the system
 * temporary directory, so a test that counts leftover browser profiles would
 * otherwise see the profile of a browser another file is still running. Not a
 * test file itself.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Points `os.tmpdir()` of this process at a fresh directory and returns it.
 * Call it once, before any code creates temporary files.
 */
export function isolateTempDir(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mpgh-test-tmp-'));
    process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
    process.env['TEMP'] = directory;
    process.env['TMP'] = directory;
    process.env['TMPDIR'] = directory;
    return directory;
}
