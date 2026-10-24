/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

// @ts-check
'use strict';

// 1. Defining the project's core scopes.
// Each entry is a triple: [name, description, files].
// [description, files] are used by AI tools to determine the correct scope.
// - name:        the exact scope string allowed in commit headers.
// - description: what the scope covers.
// - files:       repo-relative file paths or directory prefixes (a trailing
//                "/" means all files in that directory) that deterministically
//                map a changed file to this scope. An empty array means the
//                scope has no single home file.
const baseScopes = [
    // dist/ runtime modules
    [
        'extension',
        'activate()/deactivate(), command registration, context menus, and per-file preferences',
        ['src/extension.mts', 'src/extension-desktop.mts', 'src/extension-web.mts'],
    ],
    ['markdownPlugin', 'the Markdown-it plugin: alerts, task lists, emoji, code direction, and the render wrapper', ['src/markdown-plugin.mts']],
    ['previewSettings', 'configuration reading: theme modes and layout settings', ['src/preview-settings.mts']],
    ['colorMode', 'resolving the active light/dark color mode', ['src/color-mode.mts']],
    ['emojiMap', 'GitHub emoji shortcode table', ['src/emoji-map.mts']],
    ['exportHtml', 'standalone HTML export and browser/print commands', ['src/export-html.mts']],
    ['urlResolution', 'resolving relative links in the exported page to absolute URLs without a base element', ['src/url-resolution.mts']],
    ['exportBody', 'preparing the body of an exported HTML file: local image embedding and its pure helpers', ['src/export-body.mts', 'src/image-embedding.mts']],
    ['githubUrl', 'GitHub remote parsing and GitHub file URL building', ['src/github-url.mts']],
    [
        'mermaid-preview',
        'the Mermaid preview webview script and its pure decision logic: diagram theming, SVG caching, sequential rendering, lazy library loading, and the export renderer',
        [
            'src/preview/mermaid-diagram-theme.mts',
            'src/preview/mermaid-export.mts',
            'src/preview/mermaid-preview.mts',
            'src/preview/mermaid-render-logic.mts',
            'src/preview/mermaid-theme-logic.mts',
            'src/preview/mermaid-theme-palettes.mts',
            'src/preview/mermaid-zenuml.mts',
        ],
    ],
    [
        'imageViewer',
        'the zoomable viewer of images and Mermaid diagrams in the preview: the click-to-open layer, zoom and pan geometry, eligibility rules, and its stylesheet',
        ['src/preview/image-viewer.mts', 'src/preview/viewer-geometry.mts', 'src/preview/viewer-eligibility.mts', 'src/styles/image-viewer.css'],
    ],

    // Theme pipeline (build/)
    ['palettes', 'the committed variable snapshot', ['build/palettes/']],
    ['syncThemes', 'the online fetch phase that rewrites the snapshot', ['build/sync-themes.mts']],
    ['themeExtract', 'pure CSS/variable extraction and validation', ['build/theme-extract.mts']],
    ['themeCompose', 'pure stylesheet composition logic', ['build/theme-compose.mts']],
    ['generateThemeCss', 'the offline deterministic build', ['build/generate-theme-css.mts']],
    ['theme', 'the theme pipeline as a whole: snapshot, sync, compose, generated output', []],

    // Bundling
    ['bundle', 'the esbuild bundling of src/ into dist/', ['build/bundle.mts']],

    // CSS layer
    ['css', 'committed preview stylesheets that are not part of the theme pipeline or the image viewer', ['src/styles/overrides.css', 'src/styles/syntax-highlighting.css']],

    // test/
    ['tests', 'the node:test suites', ['test/']],
    ['e2e', 'the end-to-end Playwright suite that drives a real VS Code window', ['e2e/']],

    // docs/ and assets
    ['docs', 'project documentation under docs/', ['docs/']],
    ['readme', 'changes to the text/content of README.md itself', ['README.md']],
    ['assets', 'adding or replacing image files used by the extension or its documentation', ['images/']],
    ['license', 'changes to the LICENSE file', ['LICENSE']],
    ['changelog', 'CHANGELOG.md content', ['CHANGELOG.md']],

    // General / cross-cutting
    ['deps', 'adding, removing, or bumping a dependency in package-lock.json (usually alongside package.json)', ['package-lock.json']],
    ['package', 'package.json metadata, scripts, manifest, or lint-staged config', ['package.json']],
    ['config', 'a config file with no dedicated scope of its own', ['.gitignore', '.vscodeignore', 'tsconfig.json']],
    ['commitlint', 'commit type/scope rules for this project', ['commitlint.config.js']],
    ['husky', 'git hook scripts', ['.husky/']],
    ['cliff', 'cliff.toml changelog-generation configuration', ['cliff.toml']],
    ['prettier', 'formatting configuration', ['.prettierrc', '.prettierignore']],
    ['lintStaged', 'lint-staged configuration inside package.json', []],
    ['vscode', 'editor/debugger configuration', ['.vscode/']],
    ['release', 'release commits: initial releases and version bumps', []],
    ['format', 'a repo-wide formatting-only pass with no logic or behavior change', []],
];

// 2. Append a negative variant of every base scope prefixed with "-" (e.g. "-readme").
// Negative scopes are reserved for small internal feat/fix/perf commits that must be
// excluded from the auto-generated CHANGELOG by git-cliff. The skip rule that performs
// the exclusion lives in "cliff.toml" -> commit_parsers, in the project root.
// Only the first element (name) of each triple is mapped here; descriptions and
// file lists are consumed by the commit-message generator, not by commitlint.
const allowedScopes = [...baseScopes.map(([name]) => name), ...baseScopes.map(([name]) => `-${name}`)];

// 3. Custom rule: a negative scope (e.g. "-readme") is reserved for small
// internal commits and may only be used with feat, fix, or perf.
/** @type {import('@commitlint/types').Plugin} */
const negativeScopeTypesPlugin = {
    rules: {
        'negative-scope-types': (parsed) => {
            const type = parsed && parsed.type ? parsed.type : '';
            const scope = parsed && parsed.scope ? parsed.scope : '';

            if (scope.startsWith('-') && !['feat', 'fix', 'perf'].includes(type)) {
                return [false, `negative scope "${scope}" is only allowed with types feat, fix, or perf`];
            }

            return [true];
        },
    },
};

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
    extends: ['@commitlint/config-conventional'],
    plugins: [negativeScopeTypesPlugin],
    // Exported for the commit-message generator so it can map changed files
    // to scopes deterministically; commitlint ignores unknown keys.
    baseScopes,
    rules: {
        // `2` means "error" (refuse to commit).
        // `never` means the scope is never allowed to be empty (required).
        'scope-empty': [2, 'never'],

        // Header (type + scope + subject) must not exceed 70 characters.
        'header-max-length': [2, 'always', 70],

        // Each line in the commit body must not exceed 70 characters.
        'body-max-line-length': [2, 'always', 70],

        // Allowed commit types (fixed, do not change).
        'type-enum': [2, 'always', ['feat', 'fix', 'perf', 'style', 'refactor', 'docs', 'test', 'chore', 'build', 'ci', 'revert']],

        // Project scopes using the dynamically generated list.
        'scope-enum': [2, 'always', allowedScopes],

        // Negative scopes are reserved for small internal feat/fix/perf commits.
        'negative-scope-types': [2, 'always'],
    },
};
