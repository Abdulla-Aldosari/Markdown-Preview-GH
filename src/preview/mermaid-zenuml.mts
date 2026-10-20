/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Standalone bundle entry for ZenUML support. Mermaid itself ships no
 * zenuml diagram type; the built-in VS Code renderer carries the same
 * external diagram definition this file registers, so the preview can
 * render `zenuml` sources as well.
 *
 * The build emits this file (Mermaid plus the ZenUML diagram definition)
 * as an ES module at `dist/zenuml.js`. The preview loads it lazily, and
 * only when the document actually contains a zenuml block, so the extra
 * weight never affects documents without one.
 *
 */

import mermaid from 'mermaid';
import zenuml from '@mermaid-js/mermaid-zenuml';

mermaid.registerExternalDiagrams([zenuml]);

export default mermaid;
