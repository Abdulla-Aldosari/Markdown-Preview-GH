/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The extension entry point: wires the `vscode` API to the pure modules.
 * Registers the commands, refreshes the preview on setting changes, stores
 * per-file preferences, and returns the Markdown-it hook.
 */

import * as vscode from 'vscode';
import type MarkdownIt from 'markdown-it';
import { resolveColorMode, validColorModes } from './color-mode.mts';
import { buildRendererPageHtml, buildStandaloneHtml, exportFileName, parseRendererMessage, prepareMermaidHtml, toLocalFileUri } from './export-html.mts';
import { createGfmPlugin, type RenderOptions } from './markdown-plugin.mts';
import { CONFIG_SECTION, CONTENT_DIRECTIONS, CONTENT_WIDTHS, readLayoutSettings, readThemeSettings } from './preview-settings.mts';

type CommandArgs = { resource?: string } | undefined;

type PreferenceKey = 'contentDirection' | 'contentWidth' | 'colorMode';

type FilePreferences = Partial<Record<PreferenceKey, string>>;

const filePreferencesKey = 'filePreferences';

let preferencesStore: vscode.Memento | undefined;

let extensionContext: vscode.ExtensionContext | undefined;

const directionLabels: Record<string, string> = {
    ltr: 'LTR (Left to Right)',
    rtl: 'RTL (Right to Left)',
    auto: 'Auto (Detect from content)',
};

const widthLabels: Record<string, string> = {
    narrow: 'Narrow (640px)',
    normal: 'Normal (838px) - GitHub width',
    wide: 'Wide (1024px)',
    full: 'Full (1200px)',
};

const colorModeLabels: Record<string, string> = {
    light: 'Light',
    dark: 'Dark',
};

function readConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(CONFIG_SECTION, null);
}

function getFilePreferencesMap(): Record<string, FilePreferences> {
    if (!preferencesStore) {
        return {};
    }
    return preferencesStore.get<Record<string, FilePreferences>>(filePreferencesKey, {});
}

/**
 * Returns the content direction to use for a document: its per-file
 * override when present, otherwise the global setting.
 * @param resource The document URI as a string.
 */
function getContentDirection(resource: string | undefined): string {
    if (resource) {
        const prefs = getFilePreferencesMap()[resource];
        if (prefs && prefs.contentDirection) {
            return prefs.contentDirection;
        }
    }
    return readLayoutSettings(readConfiguration()).direction;
}

/**
 * Returns the content width to use for a document: its per-file override
 * when present, otherwise the global setting.
 * @param resource The document URI as a string.
 */
function getContentWidth(resource: string | undefined): string {
    if (resource) {
        const prefs = getFilePreferencesMap()[resource];
        if (prefs && prefs.contentWidth) {
            return prefs.contentWidth;
        }
    }
    return readLayoutSettings(readConfiguration()).width;
}

/**
 * Returns the color mode override stored for a document, if any.
 * @param resource The document URI as a string.
 */
function getColorMode(resource: string | undefined): string | undefined {
    if (!resource) {
        return undefined;
    }
    const prefs = getFilePreferencesMap()[resource];
    return prefs ? prefs.colorMode : undefined;
}

/**
 * Resolves the attributes the preview render wrapper carries for a
 * document, combining the global settings with its per-file overrides.
 * @param resource The document URI as a string, or `''` when unknown.
 */
function getRenderOptions(resource: string): RenderOptions {
    return {
        direction: getContentDirection(resource),
        width: getContentWidth(resource),
        themeMode: resolveColorMode(readThemeSettings(readConfiguration()).mode, getColorMode(resource)),
    };
}

/**
 * Stores a per-file preference override for the given document.
 * @param resource The document URI as a string.
 * @param key The preference to set.
 * @param value The new value.
 */
function setFilePreference(resource: string, key: PreferenceKey, value: string): void {
    if (!preferencesStore) {
        return;
    }
    const all = preferencesStore.get<Record<string, FilePreferences>>(filePreferencesKey, {});
    const filePrefs = all[resource] || {};
    filePrefs[key] = value;
    all[resource] = filePrefs;
    preferencesStore.update(filePreferencesKey, all);
}

/**
 * Removes all per-file preference overrides stored for a document.
 * @param resource The document URI as a string.
 */
function resetFilePreferences(resource: string): void {
    if (!preferencesStore) {
        return;
    }
    const all = preferencesStore.get<Record<string, FilePreferences>>(filePreferencesKey, {});
    if (all[resource]) {
        delete all[resource];
        preferencesStore.update(filePreferencesKey, all);
    }
}

/**
 * Activates the extension: registers the six commands, subscribes a
 * configuration listener that refreshes the preview when the watched
 * settings change, and returns the Markdown-it extension hook.
 * @param context The extension context of the active session.
 */
export function activate(context: vscode.ExtensionContext): { extendMarkdownIt(markdownIt: MarkdownIt): MarkdownIt } {
    preferencesStore = context.workspaceState;
    extensionContext = context;

    const watchedKeys = ['colorTheme', 'contentDirection', 'contentWidth'].map((key) => `${CONFIG_SECTION}.${key}`);
    /**
     * Refreshes the preview when one of the watched setting keys changes.
     */
    function refreshPreviewOnSettingChange(event: vscode.ConfigurationChangeEvent): void {
        if (watchedKeys.some((key) => event.affectsConfiguration(key))) {
            vscode.commands.executeCommand('markdown.preview.refresh');
        }
    }

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(refreshPreviewOnSettingChange));

    context.subscriptions.push(
        vscode.commands.registerCommand('markdown-preview-gh.setContentDirection', setContentDirectionCommand),
        vscode.commands.registerCommand('markdown-preview-gh.setContentWidth', setContentWidthCommand),
        vscode.commands.registerCommand('markdown-preview-gh.resetPreferences', resetPreferencesCommand),
        vscode.commands.registerCommand('markdown-preview-gh.setColorMode', setColorModeCommand),
        vscode.commands.registerCommand('markdown-preview-gh.openInBrowser', (args: unknown) => exportDocumentCommand(args, false)),
        vscode.commands.registerCommand('markdown-preview-gh.print', (args: unknown) => exportDocumentCommand(args, true))
    );

    const gfmPlugin = createGfmPlugin(getRenderOptions);
    return {
        /**
         * Receives the preview's Markdown-it instance.
         */
        extendMarkdownIt(markdownIt: MarkdownIt): MarkdownIt {
            return markdownIt.use(gfmPlugin);
        },
    };
}

/**
 * Shows a quick pick for the content direction and stores the picked value
 * as a per-file preference, then refreshes the preview.
 * @param args The command arguments carrying the document URI.
 */
async function setContentDirectionCommand(args: CommandArgs): Promise<void> {
    const resource = args && args.resource ? String(args.resource) : undefined;
    const current = getContentDirection(resource);
    const picked = await vscode.window.showQuickPick(
        CONTENT_DIRECTIONS.map((value) => ({
            label: directionLabels[value],
            value,
            description: value === current ? 'Current' : undefined,
        })),
        { placeHolder: 'Content direction for this file' }
    );
    if (!picked || !resource) {
        return;
    }
    setFilePreference(resource, 'contentDirection', picked.value);
    await vscode.commands.executeCommand('markdown.preview.refresh');
}

/**
 * Shows a quick pick for the color mode and stores the picked value as a
 * per-file preference, then refreshes the preview.
 * @param args The command arguments carrying the document URI.
 */
async function setColorModeCommand(args: CommandArgs): Promise<void> {
    const resource = args && args.resource ? String(args.resource) : undefined;
    const current = getColorMode(resource);
    const picked = await vscode.window.showQuickPick(
        validColorModes.map((value) => ({
            label: colorModeLabels[value],
            value,
            description: value === current ? 'Current' : undefined,
        })),
        { placeHolder: 'Theme for this file' }
    );
    if (!picked || !resource) {
        return;
    }
    setFilePreference(resource, 'colorMode', picked.value);
    await vscode.commands.executeCommand('markdown.preview.refresh');
}

/**
 * Shows a quick pick for the content width and stores the picked value as a
 * per-file preference, then refreshes the preview.
 * @param args The command arguments carrying the document URI.
 */
async function setContentWidthCommand(args: CommandArgs): Promise<void> {
    const resource = args && args.resource ? String(args.resource) : undefined;
    const current = getContentWidth(resource);
    const picked = await vscode.window.showQuickPick(
        CONTENT_WIDTHS.map((value) => ({
            label: widthLabels[value],
            value,
            description: value === current ? 'Current' : undefined,
        })),
        { placeHolder: 'Content width for this file' }
    );
    if (!picked || !resource) {
        return;
    }
    setFilePreference(resource, 'contentWidth', picked.value);
    await vscode.commands.executeCommand('markdown.preview.refresh');
}

/**
 * Removes the per-file preferences of the document the command was invoked
 * for, then refreshes the preview.
 * @param args The command arguments carrying the document URI.
 */
async function resetPreferencesCommand(args: CommandArgs): Promise<void> {
    const resource = args && args.resource ? String(args.resource) : undefined;
    if (!resource) {
        return;
    }
    resetFilePreferences(resource);
    await vscode.commands.executeCommand('markdown.preview.refresh');
}

/**
 * Resolves the Markdown document a command was invoked for. Commands can be
 * triggered from the preview context menu (`{ resource: string }`), from an
 * editor menu (a `vscode.Uri`), or from the Command Palette (no argument).
 */
function resolveTargetUri(args: unknown): vscode.Uri | undefined {
    if (args instanceof vscode.Uri) {
        return args;
    }
    if (args && typeof args === 'object' && 'resource' in args && typeof args.resource === 'string' && args.resource) {
        return vscode.Uri.parse(args.resource);
    }
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'markdown') {
        return editor.document.uri;
    }
    return undefined;
}

/**
 * Reads and concatenates every stylesheet the extension contributes to the
 * Markdown preview, so the exported page is styled exactly like the preview.
 */
async function readPreviewStyles(ctx: vscode.ExtensionContext): Promise<string> {
    const decoder = new TextDecoder('utf-8');
    const manifestUri = vscode.Uri.joinPath(ctx.extensionUri, 'package.json');
    const manifest = JSON.parse(decoder.decode(await vscode.workspace.fs.readFile(manifestUri)));
    const stylePaths: string[] = (manifest.contributes && manifest.contributes['markdown.previewStyles']) || [];
    const contents = await Promise.all(
        stylePaths.map(async (stylePath) => {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(ctx.extensionUri, stylePath));
            return decoder.decode(bytes);
        })
    );
    return contents.join('\n');
}

/** How long the export waits for the hidden renderer webview to answer. */
const mermaidRenderTimeoutMs = 10_000;

/**
 * Renders the Mermaid diagrams of a rendered document body inside a hidden,
 * temporary webview (the only place with a real text-layout engine at export
 * time), and returns the body with the finished SVGs baked in. When the
 * webview cannot deliver a result in time, the prepared body (diagrams as
 * plain code blocks) is returned instead.
 */
async function renderMermaidInHiddenWebview(ctx: vscode.ExtensionContext, bodyHtml: string): Promise<string> {
    return new Promise<string>((resolve) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let panel: vscode.WebviewPanel;
        try {
            panel = vscode.window.createWebviewPanel(
                'markdown-preview-gh.mermaidRenderer',
                'Markdown Preview GH: Rendering diagrams…',
                { viewColumn: vscode.ViewColumn.Active, preserveFocus: true },
                { enableScripts: true }
            );
        } catch {
            resolve(bodyHtml);
            return;
        }
        const finish = (html: string): void => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            panel.dispose();
            resolve(html);
        };
        timeout = setTimeout(() => finish(bodyHtml), mermaidRenderTimeoutMs);
        panel.webview.onDidReceiveMessage((message) => finish(parseRendererMessage(message)?.bodyHtml ?? bodyHtml), undefined, ctx.subscriptions);
        panel.onDidDispose(() => finish(bodyHtml));
        panel.webview.html = buildRendererPageHtml({
            bodyHtml,
            theme: 'light',
            scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'mermaid-render.js')).toString(),
            cspSource: panel.webview.cspSource,
        });
    });
}

/**
 * Renders the target document with VS Code's Markdown engine (which applies
 * this extension's plugin), writes it as a standalone HTML page into the
 * extension's global storage, and opens it in the default browser.
 * @param autoPrint Open the browser's print dialog once loaded.
 */
async function exportDocumentCommand(args: unknown, autoPrint: boolean): Promise<void> {
    const ctx = extensionContext;
    if (!ctx) {
        return;
    }
    const uri = resolveTargetUri(args);
    if (!uri) {
        vscode.window.showErrorMessage('Open a Markdown file to use this command.');
        return;
    }
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        const bodyHtml = await vscode.commands.executeCommand<unknown>('markdown.api.render', document);
        if (typeof bodyHtml !== 'string') {
            throw new Error('The Markdown renderer did not return any HTML.');
        }
        const prepared = prepareMermaidHtml(bodyHtml);
        const finalBodyHtml = prepared.hasMermaid ? await renderMermaidInHiddenWebview(ctx, prepared.html) : prepared.html;
        const css = await readPreviewStyles(ctx);
        const displayName = uri.path.split('/').pop() || 'document';
        const baseHref = uri.scheme === 'file' ? `${vscode.Uri.joinPath(uri, '..').toString()}/` : undefined;
        const html = buildStandaloneHtml({ title: displayName, bodyHtml: finalBodyHtml, css, baseHref, autoPrint });

        await vscode.workspace.fs.createDirectory(ctx.globalStorageUri);
        const outputUri = vscode.Uri.joinPath(ctx.globalStorageUri, exportFileName(uri.toString(), displayName));
        await vscode.workspace.fs.writeFile(outputUri, new TextEncoder().encode(html));

        const fileUri = toLocalFileUri(outputUri);
        if (!fileUri) {
            vscode.window.showErrorMessage(`The exported page is not stored on the local disk and cannot be opened in the browser: ${outputUri.toString()}`);
            return;
        }
        const opened = await vscode.env.openExternal(fileUri);
        if (!opened) {
            vscode.window.showErrorMessage(`Could not open the exported page in the browser: ${fileUri.fsPath}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to export Markdown preview: ${message}`);
    }
}
