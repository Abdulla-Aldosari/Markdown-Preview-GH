/*-------------------------------------------------
 * Markdown Preview GH - VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { createGfmPlugin, type RenderOptions } from '../src/markdown-plugin.mts';

const defaultOptions: RenderOptions = { direction: 'ltr', width: 'normal', themeMode: 'auto' };

/**
 * Creates a Markdown-it instance with the plugin installed. The injected
 * provider records every resource it is asked about.
 */
function createRenderer(options: RenderOptions = defaultOptions): { md: MarkdownIt; requested: string[] } {
    const requested: string[] = [];
    const md = new MarkdownIt().use(
        createGfmPlugin((resource) => {
            requested.push(resource);
            return options;
        })
    );
    return { md, requested };
}

/**
 * Renders Markdown through the extension's plugin and returns only the
 * rendered content, without the wrapper elements the plugin adds.
 */
function render(source: string, options: RenderOptions = defaultOptions): string {
    return createRenderer(options)
        .md.render(source)
        .replace(/^[\s\S]*?<div class="mpgh-content"[^>]*>/, '')
        .replace(/<\/div>\s*<\/div>\s*$/, '');
}

test('task lists render a disabled checked checkbox for [x]', () => {
    const html = render('- [x] done\n');
    assert.match(html, /<li class="task-list-item">/);
    assert.match(html, /<input type="checkbox" disabled checked class="task-list-item-checkbox" aria-label="Completed task">/);
});

test('task lists render a disabled unchecked checkbox for [ ]', () => {
    const html = render('- [ ] todo\n');
    assert.match(html, /<input type="checkbox" disabled class="task-list-item-checkbox" aria-label="Incomplete task">/);
    assert.doesNotMatch(html, /disabled checked/);
});

test('task lists accept an uppercase X as checked', () => {
    const html = render('- [X] upper\n');
    assert.match(html, /disabled checked class="task-list-item-checkbox"/);
});

test('task lists remove the marker from the item text', () => {
    const html = render('- [x] done\n- [ ] todo\n');
    assert.doesNotMatch(html, /\[x\]/i);
    assert.doesNotMatch(html, /\[ \]/);
    assert.match(html, /> done<\/li>/);
    assert.match(html, /> todo<\/li>/);
});

test('task lists mark the parent list with contains-task-list', () => {
    const html = render('- [x] done\n- plain\n');
    assert.match(html, /<ul class="contains-task-list">/);
});

test('task lists mark nested task lists independently', () => {
    const html = render('- [X] upper\n  - [ ] nested\n');
    assert.equal(html.match(/<ul class="contains-task-list">/g)?.length, 2);
    assert.equal(html.match(/class="task-list-item-checkbox"/g)?.length, 2);
});

test('task lists work in ordered lists', () => {
    const html = render('1. [ ] ordered\n');
    assert.match(html, /<ol class="contains-task-list">/);
    assert.match(html, /task-list-item-checkbox/);
});

test('task lists leave regular list items untouched', () => {
    const html = render('- [x] done\n- plain\n');
    assert.match(html, /<li>plain<\/li>/);
});

test('task lists ignore markers outside of list items', () => {
    const html = render('[x] not a list\n');
    assert.match(html, /<p>\[x\] not a list<\/p>/);
    assert.doesNotMatch(html, /task-list-item-checkbox/);
});

test('task lists ignore malformed markers', () => {
    const html = render('- [] empty\n');
    assert.match(html, /<li>\[\] empty<\/li>/);
    assert.doesNotMatch(html, /task-list-item-checkbox/);
});

test('the render wrapper carries the injected render options', () => {
    const { md } = createRenderer({ direction: 'rtl', width: 'wide', themeMode: 'dark' });
    const html = md.render('text\n');
    assert.match(html, /^<div class="mpgh-body" dir="rtl" data-vscode-context='[^']*' data-theme-mode="dark">/);
    assert.match(html, /<div class="mpgh-content" data-content-width="wide"><p>text<\/p>/);
});

test('the render wrapper asks the provider about the current document', () => {
    const { md, requested } = createRenderer();
    const html = md.render('x\n', { currentDocument: { toString: () => 'file:///c%3A/a.md' } });
    assert.deepEqual(requested, ['file:///c%3A/a.md']);
    assert.match(html, /data-vscode-context='\{&quot;resource&quot;:&quot;file:\/\/\/c%3A\/a\.md&quot;\}'/);
});

test('the render wrapper uses an empty resource when no document is given', () => {
    const { md, requested } = createRenderer();
    md.render('x\n');
    assert.deepEqual(requested, ['']);
});

test('alerts render as GitHub callouts with the English title', () => {
    const html = render('> [!WARNING]\n> Careful\n');
    assert.match(html, /<div class="markdown-alert markdown-alert-warning"><p class="markdown-alert-title"><svg class="octicon octicon-alert mr-2"/);
    assert.match(html, /<\/svg>Warning<\/p>/);
    assert.match(html, /<p>Careful<\/p>\s*<\/div>/);
    assert.doesNotMatch(html, /blockquote/);
});

test('alert titles are localized to Arabic only for rtl documents', () => {
    const rtl = render('> [!NOTE]\n> x\n', { direction: 'rtl', width: 'normal', themeMode: 'auto' });
    assert.match(rtl, /<\/svg>\u0645\u0644\u0627\u062d\u0638\u0629<\/p>/);
    const auto = render('> [!NOTE]\n> x\n', { direction: 'auto', width: 'normal', themeMode: 'auto' });
    assert.match(auto, /<\/svg>Note<\/p>/);
});

test('blockquotes without an alert marker stay blockquotes', () => {
    assert.match(render('> plain\n'), /<blockquote>\s*<p>plain<\/p>\s*<\/blockquote>/);
});

test('emoji shortcodes expand and unknown shortcodes stay as written', () => {
    const html = render(':tada: :Rocket: :not_an_emoji:\n');
    assert.match(html, /<p>\u{1F389} \u{1F680} :not_an_emoji:<\/p>/u);
});

test('code blocks always render left to right without block dir attributes', () => {
    const md = createRenderer({ direction: 'rtl', width: 'normal', themeMode: 'auto' }).md;
    md.core.ruler.push('add-dir', (state) => {
        for (const token of state.tokens) {
            if (token.type === 'paragraph_open') {
                token.attrSet('dir', 'auto');
            }
        }
    });
    const html = md.render('para\n\n```js\nx\n```\n\n    indented\n');
    assert.match(html, /<p>para<\/p>/, 'block dir attributes are dropped');
    assert.equal(html.match(/<pre dir="ltr">/g)?.length, 2);
});
