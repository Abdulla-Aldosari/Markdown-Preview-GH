/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure helpers that explain why the headless browser stopped: a bounded tail
 * of its standard error and the message built from its exit code or signal.
 * No Node and no `vscode` imports; the process lives in `browser-process.mts`.
 */

/** The guide section that explains and fixes a blocked browser sandbox. */
export const sandboxGuideUrl = 'https://github.com/Abdulla-Aldosari/Markdown-Preview-GH/blob/main/docs/guide/troubleshooting.md#the-browser-exits-in-a-dev-container';

/** The button of the notification that opens the guide section. */
export const openGuideLabel = 'Open Troubleshooting Guide';

/** How much of the browser's standard error is kept, in characters. */
export const outputTailLimit = 8_192;

/** How many of the last output lines a message quotes. */
const quotedLineCount = 3;

/** The longest quoted output a message carries, in characters. */
const quotedOutputLimit = 500;

export interface OutputTail {
    /** Feeds raw bytes; a character split across chunks is decoded once complete. */
    push(chunk: Uint8Array): void;
    /** The last characters received, at most the limit. */
    text(): string;
}

/** Keeps only the end of a stream, so a chatty browser never grows memory. */
export function createOutputTail(limit: number = outputTailLimit): OutputTail {
    const decoder = new TextDecoder('utf-8');
    let kept = '';
    return {
        push(chunk: Uint8Array): void {
            kept = `${kept}${decoder.decode(chunk, { stream: true })}`;
            if (kept.length > limit) {
                kept = kept.slice(kept.length - limit);
            }
        },
        text(): string {
            return kept;
        },
    };
}

/**
 * Whether the output says Chromium could not start its Linux sandbox: no
 * namespace and no setuid helper at all, or a helper that the environment
 * refused to let create its namespaces.
 */
export function isSandboxFailure(output: string): boolean {
    return /No usable sandbox|Failed to move to new namespace/.test(output);
}

/** The last non-empty lines of the output, joined on one line and shortened. */
function quoteOutput(output: string): string {
    const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(-quotedLineCount);
    const quoted = lines.join(' | ');
    return quoted.length > quotedOutputLimit ? `...${quoted.slice(quoted.length - quotedOutputLimit)}` : quoted;
}

/**
 * The error message for a browser that exited before the export finished.
 * @param code The exit code, or `null` when a signal ended the process.
 * @param signal The signal that ended the process, or `null`.
 * @param output The tail of the browser's standard error.
 */
export function describeBrowserExit(code: number | null, signal: string | null, output: string): string {
    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
    const summary = `The browser exited unexpectedly (${reason}).`;
    if (isSandboxFailure(output)) {
        return `${summary} Its sandbox could not start: this environment blocks the Linux namespaces it needs, as a Docker container does by default.`;
    }
    const quoted = quoteOutput(output);
    return quoted ? `${summary} Browser output: ${quoted}` : summary;
}

/** A browser exit that remembers whether the cause was a blocked sandbox, so the notification can offer the guide. */
export class BrowserExitError extends Error {
    readonly sandboxBlocked: boolean;

    constructor(message: string, sandboxBlocked: boolean) {
        super(message);
        this.name = 'BrowserExitError';
        this.sandboxBlocked = sandboxBlocked;
    }
}

/** The error for a browser that exited before the export finished; see `describeBrowserExit` for the arguments. */
export function createBrowserExitError(code: number | null, signal: string | null, output: string): BrowserExitError {
    return new BrowserExitError(describeBrowserExit(code, signal, output), isSandboxFailure(output));
}

export interface PdfFailureNotice {
    message: string;
    /** The button labels, in display order; empty when nothing can be offered. */
    actions: string[];
}

/** The notification for a failed PDF export. A blocked browser sandbox also offers the guide. */
export function describePdfFailure(error: unknown): PdfFailureNotice {
    const detail = error instanceof Error ? error.message : String(error);
    const sandboxBlocked = typeof error === 'object' && error !== null && (error as { sandboxBlocked?: unknown }).sandboxBlocked === true;
    return { message: `Failed to export Markdown as PDF: ${detail}`, actions: sandboxBlocked ? [openGuideLabel] : [] };
}

/** The address a notification button opens, or `undefined` when the label opens nothing. */
export function guideUrlFor(label: string | undefined): string | undefined {
    return label === openGuideLabel ? sandboxGuideUrl : undefined;
}
