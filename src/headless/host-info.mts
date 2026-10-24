/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Reads the facts about the machine the extension host runs on. It imports a
 * Node built-in, so only the desktop entry point may load it.
 */

import os from 'node:os';
import type { HostInfo } from './machine-label.mts';

/** The host name and, inside WSL, the distribution name. */
export function readHostInfo(): HostInfo {
    return { hostName: os.hostname(), wslDistro: process.env['WSL_DISTRO_NAME'] || undefined };
}
