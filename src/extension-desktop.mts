/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Entry point of the desktop bundle (`main` in `package.json`), built for
 * Node. Services that need Node built-ins are injected here, so they can
 * never reach the web bundle.
 */

import type * as vscode from 'vscode';
import { activate as activateExtension } from './extension.mts';
import { startPageServer } from './page-server.mts';
import type { DesktopServices } from './page-server-routes.mts';

const services: DesktopServices = {
    servePage: (html) => startPageServer({ html }),
};

/** Activates the extension with the Node-only services of the desktop host. */
export function activate(context: vscode.ExtensionContext): ReturnType<typeof activateExtension> {
    return activateExtension(context, services);
}
