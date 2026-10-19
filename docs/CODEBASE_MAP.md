# Codebase Map

## Overview

Markdown Preview GH restyles VS Code's built-in Markdown preview to match
GitHub's rendering: GitHub's own CSS for typography, spacing, tables, and
code blocks, plus GitHub-Flavored Markdown behaviors (alerts, task lists,
emoji shortcodes) and RTL support. It also adds per-file layout preferences,
export/print commands, and keeps Mermaid diagrams in sync with the preview
theme.

The extension hooks into the built-in preview through three contribution
points in `package.json`:

- `markdown.previewStyles` - stylesheets VS Code injects into every preview
  (`overrides.css`, `preview-base.css`, the theme files, and the syntax
  highlighting theme).
- `markdown.previewScripts` - `dist/mermaid-theme-sync.js`, a classic script
  that runs inside the preview webview.
- `markdown.markdownItPlugins` - lets `activate` return an
  `extendMarkdownIt(markdownIt)` function that receives the preview's Markdown-it
  instance.

## Theme model

The preview supports exactly two GitHub themes (`light`, `dark`) and one
setting, `markdown-preview-gh.colorTheme`, with the modes `auto` (match the
editor's light/dark color theme), `dark`, and `light`. The active theme is
implied by the mode, so the render wrapper carries a single
`data-theme-mode` attribute. A per-file override (`Light` / `Dark`) stored
in the workspace state takes priority over the global mode.

## Directory layout

- `src/` - TypeScript sources (`*.mts`) of the extension, the preview script
  (`src/preview/`), and the hand-written stylesheets (`src/styles/`).
- `dist/` - generated, gitignored runtime files: the esbuild bundles, the
  copied stylesheets, and the generated theme stylesheets. `main` and
  `browser` in `package.json` point at `dist/extension.js`.
- `build/` - TypeScript build scripts (`*.mts`): the theme pipeline, the
  bundler script, and the committed snapshot (`palettes/*.json`,
  `base-styles.css`).
- `test/` - unit tests (`*.test.mts`) for every runtime module, pipeline
  module, and the bundle output, run by the built-in `node:test` runner
  directly on the TypeScript sources.
- `tsconfig.json` - type checking only (`noEmit`).
- `docs/` - `CODEBASE_MAP.md` and local developer notes.
- `images/` - marketplace and README assets.
- `.husky/` - git hooks: `pre-commit` (lint-staged, typecheck, tests) and
  `commit-msg` (commitlint). Installed by the `prepare` script.
- `commitlint.config.js` - conventional-commit rules: required scope, fixed
  type list, and scope definitions as [name, description, files] triples
  that a commit-message generator uses to map changed files to scopes.
- `cliff.toml` - git-cliff configuration that generates `CHANGELOG.md`.
- `.prettierrc` / `.prettierignore` - formatter configuration; the snapshot
  files fetched from GitHub are excluded from formatting.

## Preview architecture

### Render wrapper

The plugin in `src/markdown-plugin.mts` overrides `markdownIt.renderer.render` and
wraps the rendered HTML:

```html
<div class="mpgh-body" dir="ltr|rtl|auto" data-vscode-context='{"resource":"<uri>"}' data-theme-mode="auto|dark|light">
    <div class="mpgh-content" data-content-width="narrow|normal|wide|full">...rendered Markdown...</div>
</div>
```

- `.mpgh-body` is the root container the generated stylesheets scope
  themselves to.
- `data-theme-mode` selects the active theme; `.mpgh-content` and
  `data-content-width` drive the layout overrides in `overrides.css`.
- `data-vscode-context` carries the document URI for the webview scripts.

### Theme activation selectors

Each generated theme file activates its variables under two selectors: the
fixed-mode selector and the editor-following selector, e.g. for `light`:

```css
[data-theme-mode=light],
.vscode-body.vscode-light [data-theme-mode=auto] { ... }
```

The base element rules in `preview-base.css` are scoped to `.mpgh-body` and
consume those variables through `var(--...)`.

### Data flow

Settings and per-file preferences are read in the extension host (by
`preview-settings.mts` and the preference helpers in `extension.mts`),
passed to the plugin through `getRenderOptions`, and materialized as
attributes on the wrapper; the injected CSS and the preview script then read
those attributes. The exported/printed page uses the same markup, so the
same stylesheets style it unchanged.

## src/ modules

### extension.mts

The extension entry point, bundled into `dist/extension.js` (`main` and
`browser` in `package.json`). It is the only module that imports `vscode`.

- `activate` registers the six commands, subscribes a configuration listener
  that refreshes the preview when one of the watched setting keys
  (`colorTheme`, `contentDirection`, `contentWidth`) changes, and returns
  `{ extendMarkdownIt }`, which installs the plugin from
  `markdown-plugin.mts`.
- `getRenderOptions(resource)` combines the global settings with the
  document's per-file overrides (stored in `workspaceState`) into the
  wrapper attributes, and is injected into the plugin.
- The export commands render the document with `markdown.api.render`, read
  every contributed stylesheet listed in the installed `package.json`
  (`readPreviewStyles`), build a standalone HTML page, store it under the
  extension's global storage, and open it in the default browser
  (`Open in Browser`) or with the print dialog (`Print...`).

### markdown-plugin.mts

The Markdown-it plugin, pure and unit-tested against a real Markdown-it
instance. `createGfmPlugin(getRenderOptions)` returns the plugin; the
injected provider returns `{ direction, width, themeMode }` for a document
URI. It installs:

- a core rule for GitHub-style alerts (`[!NOTE]` ... `[!CAUTION]`
  blockquotes render as colored callout boxes with icons; titles are
  localized to Arabic when the document direction is RTL),
- a core rule that turns `- [ ]` / `- [x]` items into disabled checkbox
  inputs,
- an inline rule that expands GitHub emoji shortcodes using
  `emoji-map.mts`,
- a `renderAttrs` override that drops block-level `dir` attributes, and
  `fence`/`code_block` renderer rules that force code blocks to LTR,
- the render override that adds the `mpgh-body` wrapper described above and
  tracks the current document's direction for the alert renderer.

### preview-settings.mts

Pure configuration reader, unit-tested without a `vscode` mock. It exports
`CONFIG_SECTION`, the valid value lists (`THEME_MODES`,
`CONTENT_DIRECTIONS`, `CONTENT_WIDTHS`), the validation helper `pick`, and
the readers `readThemeSettings(configuration)` (returns `{ mode }`) and
`readLayoutSettings(configuration)` (returns `{ direction, width }`). The
configuration object is injected through its `get(key)` method
(`ConfigurationReader`).

### color-mode.mts

Pure mode resolution for the wrapper attribute: `resolveColorMode(
globalMode, fileMode)` returns a valid per-file mode (`light`/`dark`) when
present, otherwise the global mode unchanged. Exports `validColorModes`.

### emoji-map.mts

A static table (`emojiMap`) mapping every GitHub emoji shortcode to its
emoji character, consumed by the inline rule in `markdown-plugin.mts`.

### export-html.mts

Pure helpers for the standalone export page:

- `forceLightTheme(bodyHtml)` - rewrites the root wrapper's
  `data-theme-mode` to `light` and leaves the rest of the document (user
  content) untouched.
- `buildStandaloneHtml(options)` - assembles the complete page: escaped
  title, optional `<base href>`, the inline stylesheet (sanitized against
  closing the `<style>` element), the `markdown-body` wrapper, and an
  optional auto-print script.
- `exportFileName(sourceKey, displayName)` - stable, safe file name per
  source document (FNV-1a hash suffix), so repeated exports overwrite each
  other.
- `toLocalFileUri(uri)` - maps `vscode-userdata` URIs to `file` URIs for
  opening in external applications.

### preview/mermaid-theme-sync.mts

The preview script, bundled by the build into the classic script (IIFE)
`dist/mermaid-theme-sync.js` (`markdown.previewScripts`). It keeps Mermaid
diagrams consistent with the preview theme. The built-in diagram renderer
reads the host editor theme once, synchronously, at the start of a render;
this script temporarily presents the host theme matching the preview theme
for exactly that read and restores the original state before the browser can
paint. It:

- wraps `window.dispatchEvent` so the override is in place while the
  `vscode.markdown.updateContent` event listeners run,
- watches the first (uninterceptable) render and requests a re-render with
  the override when it starts with the wrong host theme,
- restores diagram sources before re-rendering, since the renderer empties
  the diagram elements when it starts.

### preview/mermaid-theme-logic.mts

The pure decision logic of the preview script, with no DOM access: the host
theme `palettes` (CSS variable values for light/dark),
`resolveTargetBrightness({ mode, hostIsDark })`, and
`readThemeState(dataset, environment)` which maps the container's
`data-theme-mode` attribute onto that input.

## CSS layer

The hand-written stylesheets live in `src/styles/` and are copied into
`dist/` by the bundler; the generated ones are written into `dist/` by the
theme build.

### overrides.css

The hand-written override layer. It normalizes padding/width, styles links,
blockquotes, code blocks and the copy button, applies the content width
presets driven by `data-content-width`, mirrors border rules for RTL
documents, and removes preview-only chrome for printing.

### preview-base.css (generated)

The Markdown element rules extracted from GitHub's stylesheets, scoped to
`.mpgh-body`. Generated by the build from `build/base-styles.css`.

### theme-light.css / theme-dark.css (generated)

The color palettes per theme (shared block plus theme variables), activated
by the selectors described above. Generated by the build from
`build/palettes/*.json`.

### syntax-highlighting.css

A vendored highlight.js GitHub theme; its selectors target `.mpgh-body` and
its dark-mode sections follow `data-theme-mode`.

### Naming scheme

The extension's own DOM hooks use the `mpgh` prefix (classes
`.mpgh-body`, `.mpgh-content`) and the `data-theme-mode` /
`data-content-width` attributes. VS Code's own classes (`.markdown-body`,
`.vscode-body`, `.vscode-light`, `.vscode-dark`, `data-vscode-context`) and
GitHub's Markdown HTML attributes (`data-footnote-ref`, `data-tab-size`,
`data-line-number`) are consumed but never renamed.

## Theme pipeline (build/)

The styles are never edited by hand; they are fetched from GitHub and
processed in two strictly separated phases.

### Snapshot (committed source of truth)

- `build/palettes/shared.json` - theme-independent variables (sizes, fonts,
  weights) as an ordered name/value map plus `source`/`fetchedAt` metadata.
- `build/palettes/light.json` / `dark.json` - the per-theme color variables
  (`--fgColor-*`, `--bgColor-*`, `--borderColor-*`, syntax colors) with the
  same metadata and a `colorScheme` field.
- `build/base-styles.css` - the Markdown-scoped element rules, kept with the
  raw `.markdown-body` root selector.

### sync-themes.mts (online, manual)

The only network-touching script (`npm run sync:themes`). It fetches a public
GitHub page, discovers the stylesheet URLs, classifies them by file name
(`light*`/`dark*` carry theme variables, `primer*` carries shared variables
and Markdown rules), extracts with the pure helpers below, filters
variables to those the extracted styles reference, validates the result, and
rewrites the snapshot. It supports `--page` and `--out` arguments.

### theme-extract.mts (pure)

Extraction and validation helpers, unit-tested with fixtures:

- `classifyCssUrl(url)` - identifies theme/primer/other stylesheet URLs by
  their cache-busted file names.
- `extractVariables(cssText)` - collects custom property declarations into
  an ordered map (first occurrence fixes position, last fixes value).
- `findVarReferences(cssText)` / `collectUsedVariables(cssText)` - locate
  `var(--x)` references and mark fallback-bearing ones.
- `extractMarkdownRules(cssTexts)` - keeps only rules that can take effect
  in rendered Markdown (`.markdown-body`-scoped selectors kept unconditionally, bare selectors allow-listed),
  drops rules under non-`@layer` at-rules, merges duplicates last-wins,
  re-scopes selectors, and serializes the result with the anchor-link
  styles.
- `validatePalettes(shared, palettes, baseStylesCss)` - asserts identical
  key sets across themes and that every unresolvable `var(--x)` reference
  carries a fallback.
- `THEME_NAMES` - the two supported themes.

### theme-compose.mts (pure)

Deterministic composition from the snapshot:

- `composeThemeStylesheet({ themeName, colorScheme, sharedPairs,
themePairs })` - emits one theme file: the hoisted shared block followed
  by the theme block under the activation selectors.
- `composeBaseStylesheet(baseStylesCss)` - scopes the base rules to
  `.mpgh-body` (`PREVIEW_BODY_CLASS`).

### generate-theme-css.mts (offline, deterministic)

Reads only the committed snapshot and writes `dist/theme-light.css`,
`dist/theme-dark.css`, and `dist/preview-base.css`. The same snapshot always
produces byte-identical output; `vscode:prepublish` runs it automatically.
The generated files are gitignored and rebuildable at any time.

### theme-audit/ (dev tool, offline)

`build/theme-audit/audit.mts` reviews a pending theme sync . Pure, unit-tested helpers:

- `parseCssDeclarations(css)` / `diffStyles(old, new)` - per-selector
  declaration maps; reports added/removed/modified rules and properties,
  ignoring reordering.
- `diffVariables(old, new, file)` - palette variable changes.
- `tokenizeSelector(selector)` / `stripBodyScope(selector)` /
  `selectorAffects(selector, surface)` - whether a selector can match the
  resolved HTML surface.
- `variableAffects(name, baseCss, srcContents)` - whether a variable is
  referenced by the base stylesheet or the extension source.
- `computeThemeHashes(...)` - recomputes the hash-lock values.

`build/theme-audit/markdown-surface.mts` resolves the HTML surface (the
`manual-surface.html` override or the `surface.md` fallback rendered through
markdown-it) via `extractHtmlSurface`, `parseManualSurface`, `isStale`, and
`writeManualSurfaceDate`. `surface.md` is a broad corpus of GFM and raw-HTML
constructs (definition lists, figures, `g-emoji`, image-alignment spans, CSV
tables, form controls, explicit `ol[type=...]`, etc.); the VS Code-only
additions (heading anchors, footnotes, highlight.js) are kept separately in
the augmentation lists here rather than in `surface.md`.

### bundle.mts (bundling)

Bundles `src/` with esbuild and copies `src/styles/*.css` into `dist/`:

- `dist/extension.js` - a single CommonJS file with `vscode` external, so
  the same file runs in the desktop and the web extension host.
- `dist/mermaid-theme-sync.js` - the preview script as an IIFE classic
  script.

`createBuildOptions({ production, outDir })` returns the esbuild
configurations and `copyStaticStylesheets(outDir)` copies the stylesheets;
both are exported for the bundle test. `--production` minifies and omits
source maps; `--watch` rebuilds on change.

## Settings

Declared in `package.json` under `configuration`:

- `markdown-preview-gh.colorTheme` - `auto` | `dark` | `light` (default
  `auto`): which GitHub theme the preview displays.
- `markdown-preview-gh.contentDirection` - `ltr` | `rtl` | `auto` (default
  `ltr`).
- `markdown-preview-gh.contentWidth` - `narrow` | `normal` | `wide` |
  `full` (default `normal`).

Per-file overrides (`contentDirection`, `contentWidth`, `colorMode`) live in
`ctx.workspaceState` under the `filePreferences` key, keyed by document URI,
and are managed by the context menu commands.

## Commands and menus

Six commands (`commands` and `webview/context` in `package.json`):

- `setContentDirection`, `setContentWidth`, `setColorMode`,
  `resetPreferences` - per-file overrides via Quick Picks.
- `openInBrowser`, `print` - standalone export to the browser.

The context menu entries appear in the preview (`webviewId ==
'markdown.preview'`); the export commands also appear in the Command Palette
for Markdown files (desktop only).

## Tests

One test file per module, all run with `npm test`:

- `test/color-mode.test.mts` - per-file mode resolution.
- `test/export-html.test.mts` - `forceLightTheme`, `buildStandaloneHtml`,
  `exportFileName`, `toLocalFileUri`, HTML escaping.
- `test/mermaid-theme-logic.test.mts` - the pure logic of the preview
  script.
- `test/markdown-plugin.test.mts` - the GFM plugin (task lists, alerts,
  emoji, code direction, the render wrapper) against a real Markdown-it
  instance, with the render options injected.
- `test/theme-extract.test.mts` - extraction and validation helpers.
- `test/theme-compose.test.mts` - composition templates plus the hash lock:
  the composed output must equal recorded SHA-256 hashes, so any snapshot
  change fails the test until the new output is deliberately reviewed and
  the hashes are updated.
- `test/theme-audit.test.mts` - the audit diff/classification/surface helpers,
  the manual-surface freshness guard, and a coverage test that locks the
  `surface.md` corpus (tags, classes, attributes) so the surface cannot
  silently shrink.
- `test/preview-settings.test.mts` - the injected configuration readers.
- `test/bundle.test.mts` - the bundle output: the extension bundle requires
  only `vscode` and exports `activate`, the preview script is a classic
  script, and the stylesheets are copied unchanged.

## Workflows

- `npm run build` - regenerate the stylesheets from the committed snapshot
  (offline, deterministic) and bundle `src/` into `dist/`.
- `npm run watch` - rebundle `src/` on every change.
- `npm run sync:themes` - fetch GitHub's current CSS and rewrite the snapshot
  (online, manual; review the `build/palettes` diff afterwards).
- `npm run typecheck` - `tsc -p tsconfig.json` (`strict`, no emit).
- `npm test` - every `test/**/*.test.mts` file.
- `npm run package` - `vsce package` (runs `vscode:prepublish`, i.e. the
  production build, first).
- `npm run prettier` - format the whole project with prettier.
- `npm run prettier:check` - verify formatting without writing.
- `npm run changelog` - regenerate `CHANGELOG.md` with git-cliff.

## Commit tooling

Every commit goes through two `.husky` hooks. `commit-msg` validates the
message with commitlint: a scope is required, the header and each body line
stay within 70 characters, and both the type and the scope must come from
the lists in `commitlint.config.js`. `pre-commit` runs lint-staged (prettier
on staged files), the type check, and the full test suite.

`commitlint.config.js` defines each scope as a [name, description, files]
triple and exports the list, so a commit-message generator can map changed
files to the correct scope deterministically.

`cliff.toml` generates `CHANGELOG.md` from the same commits. Only `feat`,
`fix`, and `perf` commits appear there; breaking changes always appear in
their own group. A negative scope (e.g. `-theme`) marks a small internal
commit that is excluded from the changelog and is only valid with `feat`,
`fix`, or `perf`.
