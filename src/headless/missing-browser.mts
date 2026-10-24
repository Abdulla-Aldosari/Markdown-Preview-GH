/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * What the user is told, and offered, when PDF or PNG export finds no usable
 * browser. Pure text and command mapping; the notification itself lives in
 * `extension.mts`.
 */

import type { BrowserLookup } from './browser-locator.mts';
import type { MachineDescription } from './machine-label.mts';

export const openSettingsLabel = 'Open Settings';
export const exportHtmlLabel = 'Export as HTML instead';
export const openInBrowserLabel = 'Open in Browser (then Save as PDF)';

export type RasterOrDocumentFormat = 'PDF' | 'PNG';

export interface MissingBrowserNotice {
    message: string;
    /** The button labels, in display order. */
    actions: string[];
}

export interface FollowUpCommand {
    command: string;
    args: unknown[];
}

/**
 * Builds the notification for a failed browser lookup.
 * @param lookup A lookup that did not find a browser.
 * @param format The export that needs the browser. Only PDF offers the print-from-browser route.
 * @param machine The machine the search ran on. A remote one is named and the message says the browser must be installed there, so it is not mistaken for the user's own computer.
 */
export function describeMissingBrowser(
    lookup: Exclude<BrowserLookup, { kind: 'found' }>,
    format: RasterOrDocumentFormat,
    machine: MachineDescription = { label: 'this computer', remote: false }
): MissingBrowserNotice {
    const where = machine.remote ? `on ${machine.label} (not on your local computer)` : `on ${machine.label}`;
    const setting = 'markdown-preview-gh.export.browserPath';
    const install = machine.remote ? 'Install one there' : 'Install one';
    const message =
        lookup.kind === 'settingMissing'
            ? `Cannot export as ${format}: the browser set in "${setting}" was not found ${where} (${lookup.path}).`
            : `Cannot export as ${format}: no Chromium-based browser (Microsoft Edge, Google Chrome, or Chromium) was found ${where}. ${install}, or set "${setting}".`;
    return { message, actions: format === 'PDF' ? [openSettingsLabel, exportHtmlLabel, openInBrowserLabel] : [openSettingsLabel, exportHtmlLabel] };
}

/**
 * Maps a button the user chose to the command it runs.
 * @param resource The document URI as a string, so the follow-up command targets the same file.
 */
export function followUpCommand(label: string | undefined, resource: string): FollowUpCommand | undefined {
    switch (label) {
        case openSettingsLabel:
            return { command: 'workbench.action.openSettings', args: ['markdown-preview-gh.export.browserPath'] };
        case exportHtmlLabel:
            return { command: 'markdown-preview-gh.exportHtmlLight', args: [{ resource }] };
        case openInBrowserLabel:
            return { command: 'markdown-preview-gh.openInBrowser', args: [{ resource }] };
        default:
            return undefined;
    }
}
