/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure extraction logic for the online theme sync phase.
 *
 * Fetched GitHub stylesheets are turned into the committed artifacts:
 * per-theme palettes, the shared palette, and the Markdown-scoped base
 * stylesheet. Everything here is deterministic for a given input and has no
 * side effects.
 */

import postcss, { type AtRule, type Declaration, type Node, type Rule } from 'postcss';

/** The two GitHub themes the preview supports. */
export const THEME_NAMES: readonly string[] = ['light', 'dark'];

/** The classification of one GitHub stylesheet URL. */
export interface CssUrlInfo {
    name: string;
    kind: 'theme' | 'primer' | 'other';
}

/** One `var(--name)` reference found in a stylesheet. */
export interface VarReference {
    name: string;
    hasFallback: boolean;
}

/** Tags that can appear in GitHub-rendered Markdown. */
const ALLOW_TAGS = new Set([
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'br',
    'b',
    'i',
    'strong',
    'em',
    'a',
    'pre',
    'code',
    'img',
    'tt',
    'div',
    'ins',
    'del',
    'sup',
    'sub',
    'p',
    'picture',
    'ol',
    'ul',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'blockquote',
    'dl',
    'dt',
    'dd',
    'kbd',
    'q',
    'samp',
    'var',
    'hr',
    'ruby',
    'rt',
    'rp',
    'li',
    'tr',
    'td',
    'th',
    's',
    'strike',
    'summary',
    'details',
    'caption',
    'figure',
    'figcaption',
    'abbr',
    'bdo',
    'cite',
    'dfn',
    'mark',
    'small',
    'source',
    'span',
    'time',
    'wbr',
    'body',
    'html',
    'g-emoji',
    'input',
]);

/** Classes that can appear in GitHub-rendered Markdown. */
const ALLOW_CLASS = new Set([
    '.anchor',
    '.g-emoji',
    '.highlight',
    '.octicon',
    '.octicon-link',
    '.contains-task-list',
    '.task-list-item',
    '.task-list-item-checkbox',
    '.octicon-info',
    '.octicon-light-bulb',
    '.octicon-report',
    '.octicon-alert',
    '.octicon-stop',
    '.markdown-alert',
    '.markdown-alert-title',
    '.markdown-alert-note',
    '.markdown-alert-tip',
    '.markdown-alert-important',
    '.markdown-alert-warning',
    '.markdown-alert-caution',
    '.mr-2',
]);

/** Anchor-link icon styling GitHub serves outside the Markdown subset. */
const OCTICON_SVG =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' version='1.1' aria-hidden='true'><path fill-rule='evenodd' d='M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z'></path></svg>";

const MANUALLY_ADDED_STYLE = `
.markdown-body .octicon {
  display: inline-block;
  fill: currentColor;
  vertical-align: text-bottom;
}

.markdown-body h1:hover .anchor .octicon-link:before,
.markdown-body h2:hover .anchor .octicon-link:before,
.markdown-body h3:hover .anchor .octicon-link:before,
.markdown-body h4:hover .anchor .octicon-link:before,
.markdown-body h5:hover .anchor .octicon-link:before,
.markdown-body h6:hover .anchor .octicon-link:before {
  width: 16px;
  height: 16px;
  content: ' ';
  display: inline-block;
  background-color: currentColor;
  -webkit-mask-image: url("data:image/svg+xml,${OCTICON_SVG}");
  mask-image: url("data:image/svg+xml,${OCTICON_SVG}");
}
`;

/**
 * Identifies a GitHub stylesheet URL. GitHub serves cache-busted filenames
 * like `light-abc123.css` and `primer-xyz.css`; the returned name strips the
 * suffix.
 *
 */
export function classifyCssUrl(url: string): CssUrlInfo | null {
    const match = url.match(/(?<=\/)[-\w]+(?=-\w+\.css$)/);
    if (!match) {
        return null;
    }
    const name = match[0];
    if (/^(light|dark)/.test(name)) {
        return { name, kind: 'theme' };
    }
    if (name.startsWith('primer')) {
        return { name, kind: 'primer' };
    }
    return { name, kind: 'other' };
}

/**
 * Extracts every custom property declaration as ordered `[name, value]`
 * pairs. The first occurrence fixes the position; the last occurrence fixes
 * the value.
 */
export function extractVariables(cssText: string): Map<string, string> {
    const pairs = new Map<string, string>();
    postcss.parse(cssText).walkDecls((declaration) => {
        if (declaration.variable) {
            pairs.set(declaration.prop, declaration.value);
        }
    });
    return pairs;
}

/**
 * Finds every `var(--name)` reference in declaration values, marking which
 * ones carry a fallback (`var(--name, fallback)`).
 */
export function findVarReferences(cssText: string): VarReference[] {
    const references: VarReference[] = [];
    postcss.parse(cssText).walkDecls((declaration) => {
        for (const match of declaration.value.matchAll(/var\((--[\w-]+)([,)])/g)) {
            references.push({ name: match[1], hasFallback: match[2] === ',' });
        }
    });
    return references;
}

/**
 * Collects the set of variable names referenced by a stylesheet.
 */
export function collectUsedVariables(cssText: string): Set<string> {
    return new Set(findVarReferences(cssText).map((reference) => reference.name));
}

/**
 * Whether the rule sits under an at-rule other than `@layer` (those rules
 * are conditionally applied and are dropped, matching how GitHub's page CSS
 * wraps its feature queries).
 */
function isUnderNonLayerAtRule(rule: Rule): boolean {
    let node: Node | undefined = rule.parent;
    while (node) {
        if (node.type === 'atrule' && (node as AtRule).name !== 'layer') {
            return true;
        }
        node = node.parent;
    }
    return false;
}

/**
 * Strips `html ` / `body ` / `:root ` prefixes from a selector.
 */
function fixSelector(selector: string): string {
    if (selector.startsWith('html ') || selector.startsWith('body ')) {
        return selector.slice(5);
    }
    if (selector.startsWith(':root ')) {
        return selector.slice(6);
    }
    return selector;
}

/**
 * Normalizes a declaration:
 * - collapses `var(--fgColor-x, var(--color-fg-x))` fallbacks to the new
 *   variable name only
 * - adds the unprefixed `appearance` next to `-webkit-appearance`
 */
function fixDeclaration(declaration: Declaration): void {
    if (declaration.value.includes('Color')) {
        declaration.value = declaration.value.replace(/var\(([^,]+),\s*(var\(--color-.+?\))\)/, 'var($1)');
    }
    if (declaration.prop === '-webkit-appearance') {
        declaration.after(postcss.decl({ prop: 'appearance', value: declaration.value }));
    }
}

/**
 * Keeps only the rules that can take effect in rendered Markdown and drops
 * the rest of the page chrome. Selectors scoped under `.markdown-body` are
 * kept as-is; bare selectors must be fully allow-listed.
 */
function collectMarkdownRules(cssText: string, rules: Rule[]): void {
    postcss.parse(cssText).walkRules((rule) => {
        if (isUnderNonLayerAtRule(rule)) {
            return;
        }
        if (rule.some((node) => node.type === 'decl' && node.value.includes('prettylights'))) {
            if (!rule.selector.includes('.QueryBuilder')) {
                rules.push(rule.clone());
            }
            return;
        }
        const keptSelectors: string[] = [];
        for (const selector of rule.selectors) {
            const candidate = selector.trim();
            if (candidate.startsWith('.markdown-body')) {
                keptSelectors.push(candidate);
                continue;
            }
            if (/^[:[\w]/.test(candidate)) {
                if (candidate === '[hidden][hidden]') {
                    continue;
                }
                if (candidate.includes('[data-') && !candidate.includes('[data-color-mode')) {
                    continue;
                }
                const tag = candidate.match(/^\w[-\w]*/)?.[0];
                if (tag && !ALLOW_TAGS.has(tag)) {
                    continue;
                }
                const klass = candidate.match(/\.[-\w]+/)?.[0];
                if (klass && !ALLOW_CLASS.has(klass)) {
                    continue;
                }
                keptSelectors.push(candidate);
                continue;
            }
            const klass = candidate.match(/^\.[-\w]+/)?.[0];
            if (klass && ALLOW_CLASS.has(klass)) {
                keptSelectors.push(candidate);
            }
        }
        if (keptSelectors.length === 0) {
            return;
        }
        const kept = rule.clone();
        kept.selectors = keptSelectors.map(fixSelector);
        kept.walkDecls(fixDeclaration);
        rules.push(kept);
    });
}

/**
 * Re-scopes selectors to `.markdown-body`, merges rules that share a
 * selector (last declaration wins, keeping the first position), and drops
 * custom property declarations from style rules.
 */
function mergeMarkdownRules(rules: Rule[]): Rule[] {
    const bySelector = new Map<string, Rule>();
    for (const rule of rules) {
        rule.selectors = rule.selectors.map((selector) => {
            if (/^(:root|html|body|\[data-color-mode])$/.test(selector)) {
                return '.markdown-body';
            }
            return selector.startsWith('.markdown-body') ? selector : `.markdown-body ${selector}`;
        });
        const key = rule.selectors.join(',\n');
        const existing = bySelector.get(key);
        if (existing) {
            existing.append(rule.nodes);
        } else {
            bySelector.set(key, rule);
        }
    }
    const merged: Rule[] = [];
    for (const rule of bySelector.values()) {
        const kept: Rule['nodes'] = [];
        const position = new Map<string, number>();
        for (const node of rule.nodes) {
            if (node.type === 'decl') {
                if (node.prop.startsWith('--')) {
                    continue;
                }
                const index = position.get(node.prop);
                if (index !== undefined) {
                    kept[index] = node;
                } else {
                    position.set(node.prop, kept.length);
                    kept.push(node);
                }
            } else {
                kept.push(node);
            }
        }
        rule.removeAll();
        rule.append(kept);
        if (kept.length > 0) {
            merged.push(rule);
        }
    }
    return merged;
}

/**
 * Serializes the merged rules with a stable two-space format and injects
 * the anchor-link styles after the root body block.
 */
function serializeMarkdownRules(rules: Rule[]): string {
    let css = rules
        .map((rule) => {
            const body = rule.nodes
                .map((node) => {
                    if (node.type === 'decl') {
                        return `  ${node.prop}: ${node.value};`;
                    }
                    if (node.type === 'comment') {
                        return `  /* ${node.text} */`;
                    }
                    return '';
                })
                .join('\n');
            return `${rule.selectors.join(',\n')} {\n${body}\n}`;
        })
        .join('\n\n');
    css += '\n';
    const rootBegin = css.indexOf('.markdown-body {');
    const rootEnd = css.indexOf('}', rootBegin) + 2;
    return `${css.slice(0, rootEnd)}${MANUALLY_ADDED_STYLE}${css.slice(rootEnd)}`;
}

/**
 * Extracts the Markdown-scoped base stylesheet from GitHub page stylesheets.
 */
export function extractMarkdownRules(cssTexts: string[]): string {
    const rules: Rule[] = [];
    for (const cssText of cssTexts) {
        collectMarkdownRules(cssText, rules);
    }
    return serializeMarkdownRules(mergeMarkdownRules(rules));
}

/**
 * Verifies that every theme palette declares the same variable keys and
 * that the base stylesheet references only variables the palettes provide
 * (references with a fallback value are safe regardless).
 */
export function validatePalettes(shared: Map<string, string>, palettes: Map<string, Map<string, string>>, baseStylesCss: string): void {
    const themeNames = [...palettes.keys()];
    const first = palettes.get(themeNames[0]);
    if (!first) {
        throw new Error(`No palette for theme "${themeNames[0]}"`);
    }
    for (const name of themeNames.slice(1)) {
        const other = palettes.get(name);
        if (!other) {
            throw new Error(`No palette for theme "${name}"`);
        }
        const missing = [...first.keys()].filter((key) => !other.has(key));
        const extra = [...other.keys()].filter((key) => !first.has(key));
        if (missing.length > 0 || extra.length > 0) {
            throw new Error(`Palette "${name}" does not match "${themeNames[0]}": missing ${missing.join(', ') || 'none'}, extra ${extra.join(', ') || 'none'}`);
        }
    }
    const known = new Set([...shared.keys(), ...first.keys()]);
    const unresolved = findVarReferences(baseStylesCss)
        .filter((reference) => !reference.hasFallback && !known.has(reference.name))
        .map((reference) => reference.name);
    if (unresolved.length > 0) {
        throw new Error(`Base styles reference variables missing from the palettes: ${[...new Set(unresolved)].join(', ')}`);
    }
}
