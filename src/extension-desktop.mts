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

export { activate } from './extension.mts';
