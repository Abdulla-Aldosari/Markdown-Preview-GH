/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * The Markdown-it plugin that adds GitHub-Flavored Markdown behaviors and the
 * preview render wrapper. Pure: it has no `vscode` dependency. The per-document
 * render options are injected through `getRenderOptions`, so the plugin is
 * unit-testable against a real Markdown-it instance in plain Node.
 */

import type MarkdownIt from 'markdown-it';
import { emojiMap } from './emoji-map.mts';

/** The attributes the render wrapper materializes for one document. */
export interface RenderOptions {
    /** Content direction: `ltr`, `rtl`, or `auto`. */
    direction: string;
    /** Content width preset: `narrow`, `normal`, `wide`, or `full`. */
    width: string;
    /** Resolved theme mode: `auto`, `dark`, or `light`. */
    themeMode: string;
}

/**
 * Returns the render options for a document.
 * @param resource The document URI as a string, or `''` when unknown.
 */
export type RenderOptionsProvider = (resource: string) => RenderOptions;

/** The `env` fields of a render call this plugin reads. */
interface RenderEnv {
    currentDocument?: { toString(): string };
}

/**
 * Arabic titles for GitHub-style alerts, used only when the active
 * document's content direction is explicitly "rtl".
 */
const alertTitlesAr: Record<string, string> = {
    note: 'ملاحظة',
    tip: 'نصيحة',
    important: 'هام',
    warning: 'تحذير',
    caution: 'تنبيه',
};

const alertTypes: Record<string, { title: string; icon: string }> = {
    note: {
        title: 'Note',
        icon: '<svg class="octicon octicon-info mr-2" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
    },
    tip: {
        title: 'Tip',
        icon: '<svg class="octicon octicon-light-bulb mr-2" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>',
    },
    important: {
        title: 'Important',
        icon: '<svg class="octicon octicon-report mr-2" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
    },
    warning: {
        title: 'Warning',
        icon: '<svg class="octicon octicon-alert mr-2" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
    },
    caution: {
        title: 'Caution',
        icon: '<svg class="octicon octicon-stop mr-2" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
    },
};

const alertMarker = new RegExp(`^\\[!(${Object.keys(alertTypes).join('|')})\\]`, 'i');

/**
 * Creates the Markdown-it plugin that installs Markdown Preview GH
 * extensions.
 */
/**
 * Reclassifies the Mermaid placeholders the built-in diagram extension
 * emits, so its webview renderer never finds them: `class="mermaid"` becomes
 * `mpgh-mermaid` (the class this extension's own preview script renders),
 * and the `style="all: unset;"` fences carry is dropped so an unrendered
 * diagram falls back to a normally styled code block.
 *
 * The original diagram source travels as `data-mpgh-mermaid-source`, because
 * once the preview script has rendered a diagram, the block contains SVG
 * markup and the source is gone from the DOM.
 */
export function reclassifyMermaidPlaceholders(html: string): string {
    return html
        .replace(/<pre([^>]*)class="mermaid"([^>]*)>([\s\S]*?)<\/pre>/g, (match, before, after, body) => {
            const source = decodeHtmlEntities(body);
            const attributes = after.replace(/\s*style="all:\s*unset\s*;?"?/, '');
            return `<pre${before}class="mpgh-mermaid"${attributes} data-mpgh-mermaid-source="${escapeHtmlAttribute(source)}">${body}</pre>`;
        })
        .replace(/<div class="mermaid">([\s\S]*?)<\/div>/g, (match, body) => {
            const source = decodeHtmlEntities(body);
            return `<div class="mpgh-mermaid" data-mpgh-mermaid-source="${escapeHtmlAttribute(source)}">${body}</div>`;
        });
}

/** Decodes the HTML entities Markdown-it escapes into fence bodies. */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Escapes a source string so it can travel inside an HTML attribute. */
function escapeHtmlAttribute(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function createGfmPlugin(getRenderOptions: RenderOptionsProvider): (markdownIt: MarkdownIt) => void {
    return (markdownIt) => installGfmExtensions(markdownIt, getRenderOptions);
}

function installGfmExtensions(markdownIt: MarkdownIt, getRenderOptions: RenderOptionsProvider): void {
    /**
     * Tracks the content direction of the document currently being rendered,
     * so renderer rules (e.g. alert titles) can react to it without threading
     * the value through every function call.
     */
    let currentRenderDirection = 'ltr';

    markdownIt.core.ruler.after('block', 'github-alerts', (state) => {
        const tokens = state.tokens;
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i].type !== 'blockquote_open') {
                continue;
            }
            const open = tokens[i];
            const startIndex = i;
            let depth = 0;
            while (i < tokens.length) {
                if (tokens[i].type === 'blockquote_open') {
                    depth += 1;
                } else if (tokens[i].type === 'blockquote_close') {
                    depth -= 1;
                    if (depth === 0) {
                        break;
                    }
                }
                i += 1;
            }
            if (i >= tokens.length) {
                continue;
            }
            const close = tokens[i];
            const firstInline = tokens.slice(startIndex, i + 1).find((token) => token.type === 'inline');
            if (!firstInline) {
                continue;
            }
            const match = firstInline.content.match(alertMarker);
            if (!match) {
                continue;
            }
            const type = match[1].toLowerCase();
            const alert = alertTypes[type];
            firstInline.content = firstInline.content.slice(match[0].length).trimStart();
            open.type = 'alert_open';
            open.tag = 'div';
            open.meta = { type, title: alert.title, icon: alert.icon };
            close.type = 'alert_close';
            close.tag = 'div';
        }
    });

    markdownIt.core.ruler.after('inline', 'github-task-lists', (state) => {
        const tokens = state.tokens;
        for (let i = 2; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type !== 'inline' || !token.children || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') {
                continue;
            }
            const match = token.content.match(/^\s*\[([ xX])\]/);
            if (!match) {
                continue;
            }
            const checked = match[1] !== ' ';
            tokens[i - 2].attrJoin('class', 'task-list-item');

            const targetLevel = tokens[i - 2].level - 1;
            for (let j = i - 3; j >= 0; j--) {
                if (tokens[j].level === targetLevel) {
                    const className = tokens[j].attrGet('class');
                    if (!className || !className.split(' ').includes('contains-task-list')) {
                        tokens[j].attrJoin('class', 'contains-task-list');
                    }
                    break;
                }
            }

            const checkbox = new state.Token('html_inline', '', 0);
            checkbox.content = `<input type="checkbox" disabled${checked ? ' checked' : ''} class="task-list-item-checkbox" aria-label="${checked ? 'Completed task' : 'Incomplete task'}">`;
            token.children.unshift(checkbox);
            token.content = token.content.replace(/^\s*\[[ xX]\]/, '');
            if (token.children[1]) {
                token.children[1].content = token.children[1].content.replace(/^\s*\[[ xX]\]/, '');
            }
        }
    });

    markdownIt.core.ruler.after('inline', 'github-emoji', (state) => {
        const pattern = /:([a-z0-9_+-]+):/gi;
        for (const token of state.tokens) {
            if (token.type !== 'inline' || !token.children) {
                continue;
            }
            for (const child of token.children) {
                if (child.type === 'text') {
                    child.content = child.content.replace(pattern, (full: string, name: string) => emojiMap[name.toLowerCase()] || full);
                }
            }
        }
    });

    markdownIt.renderer.rules.alert_open = (tokens, idx) => {
        const { type, title, icon }: { type: string; title: string; icon: string } = tokens[idx].meta;
        // Alert titles follow the document's direction like every other block element
        // (see renderAttrs override below) and are translated to Arabic only when the
        // active content direction is explicitly "rtl". The CSS class names stay in
        // English since they are technical identifiers, not user-facing text.
        const displayTitle = currentRenderDirection === 'rtl' ? alertTitlesAr[type] || title : title;
        return `<div class="markdown-alert markdown-alert-${type}"><p class="markdown-alert-title">${icon}${displayTitle}</p>`;
    };

    // VS Code's source map plugin adds `dir="auto"` to every block element AFTER our
    // core rules run, so we neutralize it at render time by skipping the `dir` attribute.
    // The root container's `dir` (set below) then controls the direction uniformly.
    markdownIt.renderer.renderAttrs = function (token) {
        if (!token.attrs) {
            return '';
        }
        let result = '';
        for (let i = 0; i < token.attrs.length; i++) {
            if (token.attrs[i][0] === 'dir') {
                continue;
            }
            result += ` ${markdownIt.utils.escapeHtml(token.attrs[i][0])}="${markdownIt.utils.escapeHtml(token.attrs[i][1])}"`;
        }
        return result;
    };

    // Code is always authored in a left-to-right script regardless of the
    // document's overall direction, so <pre> blocks must always render ltr.
    for (const ruleName of ['fence', 'code_block']) {
        const original = markdownIt.renderer.rules[ruleName] || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
        markdownIt.renderer.rules[ruleName] = (...args) => original(...args).replace(/<pre(?![a-zA-Z-])/, '<pre dir="ltr"');
    }

    const render = markdownIt.renderer.render;
    markdownIt.renderer.render = (...args) => {
        const env: RenderEnv | undefined = args[2];
        const doc = env && env.currentDocument;
        const resource = doc ? doc.toString() : '';
        const { direction, width, themeMode } = getRenderOptions(resource);
        currentRenderDirection = direction;
        const context = markdownIt.utils.escapeHtml(JSON.stringify({ resource }));
        const html = reclassifyMermaidPlaceholders(render.apply(markdownIt.renderer, args));
        return `<div class="mpgh-body" dir="${direction}" data-vscode-context='${context}' data-theme-mode="${themeMode}">
                    <div class="mpgh-content" data-content-width="${width}">${html}</div>
                </div>`;
    };
}
