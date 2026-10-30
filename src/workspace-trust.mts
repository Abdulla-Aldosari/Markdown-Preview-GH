/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The decision gate for the commands that turn a Markdown document into a
 * standalone page: Export As, Open in Browser, and Print. Those pages carry
 * no content security policy, so raw HTML such as `<script>` from the
 * document would run when the page is opened in a browser or rendered by the
 * headless browser. Those commands are therefore blocked until the workspace
 * is trusted. Pure: it reads no `vscode` API, so the decision is unit-testable.
 */

export type TrustGateResult = { allowed: true } | { allowed: false; message: string };

/** The message shown when a trust-gated command is blocked in an untrusted workspace. */
export const TRUST_GATE_BLOCK_MESSAGE = 'Export As, Open in Browser, and Print are disabled until this workspace is trusted.';

/**
 * Whether a trust-gated command may run in the current workspace.
 * @param isTrusted The value of `vscode.workspace.isTrusted`.
 */
export function evaluateTrustGate(isTrusted: boolean): TrustGateResult {
    if (isTrusted) {
        return { allowed: true };
    }
    return { allowed: false, message: TRUST_GATE_BLOCK_MESSAGE };
}
