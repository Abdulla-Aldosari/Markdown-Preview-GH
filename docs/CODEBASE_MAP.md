# Codebase Map

## Overview

Markdown Preview GH restyles VS Code's built-in Markdown preview to match
GitHub's rendering: GitHub's own CSS for typography, spacing, tables, and
code blocks, plus GitHub-Flavored Markdown behaviors (alerts, task lists,
emoji shortcodes) and RTL support. It also adds per-file layout preferences,
export/print commands (baking Mermaid diagrams into the exported page as
static SVG), keeps Mermaid diagrams in sync with the preview theme, and
renders them with the same themes the mermaid.js.org website uses.

The extension hooks into the built-in preview through three contribution
points in `package.json`:

- `markdown.previewStyles` - stylesheets VS Code injects into every preview
  (`overrides.css`, `preview-base.css`, the theme files, the syntax
  highlighting theme, and `image-viewer.css`).
- `markdown.previewScripts` - `dist/mermaid-preview.js`, a small classic
  script that runs inside the preview webview and loads the Mermaid
  library lazily from `dist/mermaid/` (see the preview script section),
  and `dist/image-viewer.js`, the zoomable viewer of images and diagrams.
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
  copied stylesheets, and the generated theme stylesheets. `main` in
  `package.json` points at `dist/extension.js` and `browser` at
  `dist/extension-web.js`.
- `build/` - TypeScript build scripts (`*.mts`): the theme pipeline, the
  bundler script, and the committed snapshot (`palettes/*.json`,
  `base-styles.css`).
- `test/` - unit tests (`*.test.mts`) for every runtime module, pipeline
  module, and the bundle output, run by the built-in `node:test` runner
  directly on the TypeScript sources.
- `e2e/` - UI tests (`*.spec.ts`, `helpers.mts`, `fixtures/`) driven by
  Playwright's Electron launcher against a real VS Code window
  (`npm run test:e2e`); `playwright.config.ts` configures them.
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

The shared extension code. It is the only module with logic that imports
`vscode`, and it is reached through two thin entry files that re-export
`activate`:

- `extension-desktop.mts` - bundled for Node into `dist/extension.js`
  (`main` in `package.json`). Services that need Node built-ins are
  injected here.
- `extension-web.mts` - bundled for the browser into `dist/extension-web.js`
  (`browser` in `package.json`). It never imports a Node built-in.

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
  (`Open in Browser`) or with the print dialog (`Print...`). Documents
  containing Mermaid placeholders get the inline export bundle
  (`dist/mermaid-export.js`, read by `readMermaidExportBundle`) baked
  into the page, so the browser renders the diagrams itself and no
  temporary webview is ever opened. Dark pages also carry a light copy
  of every diagram and a print stylesheet that repaints the page with
  the light theme, so printing always produces light output while the
  visible page never changes. The page carries no `<base>` element: the
  rendered body goes through `resolveDocumentUrls` first, with the
  document's folder as the base (only for `file` documents).
- The `Export As...` submenu of the preview context menu
  (`markdown-preview-gh.exportAs`) lists `HTML Light Theme`, `HTML Dark
Theme`, `PDF`, and `PNG`; the PDF and PNG items are declared but hidden
  (`when: false`). `exportHtmlCommand` writes a self-contained HTML file
  pinned to the chosen theme through `vscode.workspace.fs`, so it also runs
  on VS Code for the Web. An argument `{ resource, target }` skips the
  save dialog (`resolveExportTarget`); without `target`, `showSaveDialog`
  suggests `<stem>.html` next to the Markdown file. The body goes through
  `prepareExportBody`, which only embeds local images (read through the
  injected `workspaceImageSource`); links and every other reference stay
  exactly as written. Images that stay links raise one combined warning.

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

- `forceTheme(bodyHtml, mode)` - rewrites the root wrapper's
  `data-theme-mode` to the given `ThemeMode` (`light`/`dark`) and leaves the
  rest of the document (user content) untouched. Exports are pinned to
  `light` today; the pipeline already accepts both modes.
- `buildStandaloneHtml(options)` - assembles the complete page: escaped
  title, the inline stylesheet (sanitized against
  closing the `<style>` element), the theme-pinned `markdown-body` wrapper,
  the matching `color-scheme` meta and body class, an optional auto-print
  script, and an always-baked `@media print` rule forcing
  `print-color-adjust: exact` (with the `-webkit-` fallback) on
  `.mpgh-body pre` so the code-block background survives printing.
- `prepareMermaidHtml(bodyHtml)` - normalizes the Mermaid placeholders
  (`pre.mermaid` / `div.mermaid`, including the reclassified
  `mpgh-mermaid` class) of a rendered document: strips the
  `style="all: unset;"` fences carry (so an unrendered fence falls back to a
  normal code block) and reports whether the document contains any diagrams.
- `buildPrintLightThemeCss(css)` - copies every CSS block whose selector
  carries a light marker (`data-theme-mode=light`, `vscode-light`,
  `prefers-color-scheme: light`) into a `@media print` block with `light`
  flipped to `dark` in the selector, so printing a dark page produces
  light output. A light-styled block without such a marker is skipped and
  keeps its colors on paper.
- `exportFileName(sourceKey, displayName)` - stable, safe file name per
  source document (FNV-1a hash suffix), so repeated exports overwrite each
  other.
- `toLocalFileUri(uri)` - maps `vscode-userdata` URIs to `file` URIs for
  opening in external applications.

### url-resolution.mts

Pure link resolution for the exported page (no `vscode` import).
`resolveDocumentUrls(html, { documentDirUrl, workspaceFolderUrl })` rewrites
the URL attributes of `img[src|srcset]`, `source[src|srcset]`, `a[href]`,
`video[src|poster]`, and `audio[src]` with `new URL(ref, base)`, so the
page works without a `<base>` element (which would also break every
`#anchor`). A reference starting with `/` is a workspace-root path and
resolves against `workspaceFolderUrl` (it stays as is when the document has
no workspace folder); every other relative reference resolves against
`documentDirUrl`. The engine's output for a workspace path on Windows
(`/d:/ws/x.png`) becomes `file:///d:/ws/x.png`. An `<img>` that carries
`data-src` is resolved from that original path and its current `src` is
discarded, because the engine caches its tokens per document and writes
`src` once, so `src` can already hold a preview-only
`vscode-resource.vscode-cdn.net` URL. A tag-level
scanner handles double-quoted, single-quoted, and unquoted values, decodes
HTML entities before resolving and re-encodes after, and skips the content
of `pre`, `code`, `script`, `style`, and comments. In-page anchors
and references with a scheme stay untouched; a protocol-relative reference
(`//host/path`) gets the `https:` protocol (`completeProtocolRelative`),
because a page opened from disk would read it as `file://host/path`; a
single-letter scheme is a Windows drive (`D:/ws/x.png` becomes
`file:///D:/ws/x.png`). With an `undefined` base (untitled or virtual
documents) no path is resolved, but protocol-relative references are still
completed. `url()` inside inline `style` attributes is not rewritten.

`rewriteDocumentReferences(html, rewrite)` is the scanner behind it: it calls
`rewrite(reference, { tag, attribute })` for every URL-carrying attribute
(one call per `srcset` candidate) and `resolveDocumentReference(reference,
bases)` resolves a single reference. `resolveDocumentUrls` is the two
combined.

### image-embedding.mts

Pure (no `vscode` import, no `Buffer`). `loadImages(urls, source, maxBytes)`
reads each distinct URL once through the injected `ImageSource` (`size`,
`read`) and returns the data URIs plus the failures (unknown extension, over
the 20 MB cap, unreadable). `imageMimeType` maps png, jpg, jpeg, gif, webp,
svg, avif, bmp, and ico by extension; `isEmbeddableUrl` rejects `http`,
`https`, `data`, and other non-file schemes; `toBase64` encodes with `btoa`
in chunks.

### export-body.mts

Pure (no `vscode` import). `prepareExportBody(html, { bases, source })`
resolves each image reference only to find the file, and embeds the local
image sources (`img[src|srcset]`, `source[srcset]`) as data URIs. Every
other reference is returned exactly as written: links (`<a href>`, even to an
image file), internet and `data:` images, and images that could not be
embedded. An image that cannot be embedded gets its original path back
(`data-src` wins over a preview-only `src`). The final place of the file is
unknown, so no link is resolved for it; the one exception is a
protocol-relative reference (`//host/path`), which gets the `https:` protocol. `isUriString` tells a URI argument
from a file system path.

### preview/mermaid-preview.mts

The preview script, bundled by the build into a small classic script
(IIFE) `dist/mermaid-preview.js` (`markdown.previewScripts`). The built-in
diagram renderer never sees the diagrams: the Markdown-it plugin renames
their class to `mpgh-mermaid`, so this script owns the rendering
completely. It renders every diagram with the website theme for its type
and the preview brightness, and caches the finished SVG per brightness and
source: a render cycle only redraws diagrams whose source changed, and
cached diagrams are restored without parsing, so content updates never
flicker unchanged diagrams. It:

- loads the Mermaid library lazily with
  `import(new URL('mermaid/mermaid.esm.mjs', scriptSrc))` - the official
  ESM distribution `build/bundle.mts` copies into `dist/mermaid/`, loaded
  as on-demand chunks exactly like the built-in renderer. Bundling the
  whole library into one script crashes the webview with a V8
  out-of-memory (see PROJECT_NOTES),
- renders without a container argument (`mermaid.render(id, source)`):
  passing the block itself as the container makes the flowchart renderer
  read the source from the container's textContent and fail,
- reads each diagram source from `data-mpgh-mermaid-source` (stored by the
  Markdown-it plugin), because a rendered block contains SVG markup and
  the source is gone from the DOM,
- compares `data-mpgh-cache` keys (brightness + source) instead of markup
  when restoring cached SVGs: the browser normalizes innerHTML on read,
  so a markup comparison would rewrite and destroy every cached SVG on
  every update,
- re-runs on the `vscode.markdown.updateContent` event and on DOM
  mutations, coalescing bursts through a scheduled single run,
- persists finished SVGs to localStorage (capped by the pure
  `selectLargestCacheEntries` selector) and restores them instantly when
  VS Code rebuilds the webview after the preview tab was hidden,
- honours an explicit `markdown.mermaid.*` theme choice (anything but
  `vscode`), which replaces the per-diagram injection entirely.

### preview/image-viewer.mts

The zoomable viewer, bundled into the classic script (IIFE)
`dist/image-viewer.js` (`markdown.previewScripts`). One viewer serves both
content types: a click on an image (`.mpgh-content img`) or on the drawing
of a rendered diagram (`.mpgh-mermaid[data-mpgh-rendered="1"]`) opens it.
Nothing is added to the document content; the layer is created on click,
appended to `document.body` (outside the `.markdown-body` the preview
replaces on every update), and removed on close. It:

- opens with a click, except for images inside links, icon-sized content,
  clicks with a modifier key, and clicks that end a text selection,
- shows a copy of the content at its natural size and positions it with a
  single `translate() scale()` transform: an `<img>` with the same source
  for images, a clone of the SVG for diagrams (the ids of the clone get a
  suffix so its markers never resolve through the hidden original),
- animates the open and close between the clicked element and the fitted
  view (a content-fit transform of the element's rectangle); content whose
  source is off screen fades, and `prefers-reduced-motion` disables every
  transition,
- fits raster images without enlarging them past their pixels and lets
  vector content (diagrams, SVG files) enlarge up to 4x while fitting;
  the zoom range is the fit up to 800%,
- zooms with the wheel and the trackpad pinch (a `ctrl` wheel) around the
  pointer, with a two-finger pinch that also pans, with the toolbar buttons,
  and with `+` / `-` / `0` / `1`; pans by dragging and with the arrow keys;
  toggles between the fit and the actual size on a double click (the
  event does not propagate, because the preview's own double click handler
  would otherwise jump to the editor),
- closes with `Esc`, the close button, or a click on the backdrop that is
  not the end of a drag,
- carries `data-theme-mode` of the preview wrapper, so the theme variables
  color the layer, and keeps its keyboard focus on the toolbar buttons
  (dialog semantics, focus restored on close),
- marks the layer with `data-vscode-context='{"mpghViewer":true}'`, which
  hides the extension's entries from the preview's context menu,
- writes the zoom label to a `data-label` attribute instead of text, so
  its updates never wake the Mermaid script's DOM observer.

The decisions live in two pure modules: `preview/viewer-eligibility.mts`
(`canOpenViewer`, `isZoomableSubject`, `isVectorImageSource`) and
`preview/viewer-geometry.mts` (fit, zoom around a point, pan limits, wheel
and pinch math, the double-click target, and the rectangle transforms of
the open and close animations).

### preview/mermaid-theme-logic.mts

The pure decision logic of the preview script, with no DOM access: the host
theme `palettes` (CSS variable values for light/dark, presented while the
renderer reads the host theme), `siteThemes` (the website's fallback theme
name per brightness: `default` / `dark`), `resolvePreviewBrightness({ mode,
hostIsDark })` (the brightness the preview displays with), and
`resolveTargetBrightness({ mode, hostIsDark })` / `readThemeState(dataset,
environment)` which drive the host-theme override.

### preview/mermaid-diagram-theme.mts

The pure per-diagram theme logic shared by the live preview and the export
renderer, with no DOM access: `detectDiagramType(source)` (the first
keyword after an optional frontmatter block and leading directives),
`selectDiagramTheme(diagramType, brightness)` (the classic `default` theme
in light mode; `redux-dark-color` for the node-based types — flowchart,
swimlane, class, er, requirement, sequence, state — and the classic `dark`
theme for everything else in dark mode), `sourceDefinesTheme(source)`
(whether a leading frontmatter config or directive already carries a
theme), `buildThemeDirective(diagramType, brightness)` (the `%%{init}%%`
directive carrying the theme name plus the pure theme variables of
`mermaid-theme-palettes.mts`), and `injectThemeDirective(source,
brightness)` which prepends the directive unless the source defines a theme
of its own.

### preview/mermaid-theme-palettes.mts

Frozen snapshots of the pure `getThemeVariables({})` values of the three
themes the diagrams use (`default`, `dark`, `redux-dark-color`), computed
from the pinned mermaid version for exactly the keys the built-in renderer
recolors with gray editor variables. Injecting them alongside the theme
name neutralizes the gray variables, so the pure website theme reaches the
diagram. Locked by `test/mermaid-theme-palettes.test.mts`; regenerated
manually with a Node one-liner against the pinned mermaid package when the
dependency is upgraded.

### preview/mermaid-export.mts

The export bootstrap, a small classic script (IIFE)
`dist/mermaid-export.js` (~10 KB). The export command bakes it inline
into the exported page together with the official minified UMD builds
(`dist/mermaid.min.js`, and `dist/zenuml.min.js` only for zenuml
documents), which expose themselves on the
`window.__esbuild_esm_mermaid_nm` namespace (`{ default: api }` slots
the bootstrap unwraps). It runs inside the browser the page was opened
in - no temporary webview exists anymore. It matches both `mermaid`
and the reclassified `mpgh-mermaid` placeholders, reads each source
from `data-mpgh-mermaid-source`, registers the zenuml plugin on
Mermaid so zenuml renders through the same API as every other diagram
type, reads the pinned `data-theme-mode` from the `.mpgh-body`
wrapper, initializes Mermaid with the fallback website theme for that
brightness, injects the per-diagram theme directive into every
non-zenuml placeholder exactly like the live preview does, and
replaces each placeholder with its rendered SVG (leaving failed
diagrams as code blocks). Dark pages render each diagram twice: a
dark copy shown on screen and a light copy
(`.mpgh-export-diagram-print`) revealed only by the print stylesheet.
The page shows a themed waiting overlay (spinner + Please Wait) until
rendering finishes; when the command was `Print...` the bundle calls
`window.print()` once the diagrams are rendered.

### preview/mermaid-render-logic.mts

The pure decision logic of the export renderer, with no DOM access:
`rendererMessageType` (the `postMessage` protocol constant),
`resolveExportBrightness(mode, prefersDark)` (pinned modes win, anything
else follows the color scheme), and `buildMermaidConfig(brightness)` (the
fallback configuration for sources the per-diagram injection leaves alone:
`startOnLoad: false`, `theme: 'default'` in light mode / `'dark'` in dark
mode, `securityLevel: 'strict'`).

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
its dark-mode sections follow `data-theme-mode`. The light `--syntax-*`
palette block carries the light activation selectors alongside the bare
`.mpgh-body` default, so the export print filter can flip the palette onto
the dark selectors at print time.

### image-viewer.css

The stylesheet of the viewer layer: the backdrop, the stage, the content,
the toolbar, and the open/close transitions. The layer is colored with the
same theme variables as the preview. The script marks the layer with
`data-kind="diagram"` or `data-kind="image"`, and the two kinds are dressed
differently: a diagram sits on a themed card (a background plus a
`box-shadow`), while an image has no card (its transparent pixels show the
backdrop) and gets a `drop-shadow` filter that follows its painted pixels.
The card of a diagram and the shadow of an image belong to the open state
(`.is-open`) and transition, so they fade in while the content flies out and
fade out while it flies back. The zoom cursor on images and
diagrams appears only after the viewer script ran, and the layer is hidden
when printing. The export page never loads it.

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

- `dist/extension.js` - the desktop entry (`src/extension-desktop.mts`): a
  single CommonJS file built for Node with `vscode` external.
- `dist/extension-web.js` - the web entry (`src/extension-web.mts`): a
  single CommonJS file built for the browser with `vscode` external.
- `dist/mermaid-preview.js` - the preview script as a small IIFE classic
  script.
- `dist/image-viewer.js` - the zoomable viewer script as a small IIFE
  classic script.
- `dist/mermaid-export.js` - the small export bootstrap (IIFE classic
  script) baked inline into exported pages that contain diagrams.
- `dist/mermaid.min.js` - the official minified UMD build of the whole
  Mermaid library, baked inline into exported pages that contain
  diagrams.
- `dist/zenuml.min.js` - the official minified UMD build of the zenuml
  plugin, baked inline only into exported pages that contain zenuml.
- `dist/zenuml.js` - a standalone ES module carrying Mermaid plus the
  zenuml diagram definition, loaded lazily by the preview only when a
  zenuml block exists.
- `dist/mermaid/` - the official Mermaid ESM distribution
  (`mermaid.esm.mjs` plus its `chunks/mermaid.esm/` set), copied verbatim by
  `copyMermaidLibrary(outDir)`. The other chunk sets of the distribution
  (`mermaid.core`, `mermaid.esm.min`) are never loaded and are not copied.
  Both webview scripts import it lazily;
  bundling the whole library into one script instead crashes the webview
  with a V8 out-of-memory.

`createBuildOptions({ production, outDir })` returns the esbuild
configurations, `copyStaticStylesheets(outDir)` copies the stylesheets and
`copyMermaidLibrary(outDir)` copies the Mermaid distribution; all three
are exported for the bundle test. `--production` minifies and omits
source maps; `--watch` rebuilds on change.

## Settings

Declared in `package.json` under `configuration`:

- `markdown-preview-gh.colorTheme` - `auto` | `dark` | `light` (default
  `auto`): which GitHub theme the preview displays.
- `markdown-preview-gh.contentDirection` - `ltr` | `rtl` | `auto` (default
  `ltr`).
- `markdown-preview-gh.contentWidth` - `narrow` | `normal` | `wide` |
  `full` (default `normal`).
- `markdown-preview-gh.diagnosticLogging` - boolean (default `false`):
  enables the `Markdown Preview GH` output channel for troubleshooting.

Per-file overrides (`contentDirection`, `contentWidth`, `colorMode`) live in
`ctx.workspaceState` under the `filePreferences` key, keyed by document URI,
and are managed by the context menu commands.

## Commands and menus

Seven commands (`commands` and `webview/context` in `package.json`):

- `setContentDirection`, `setContentWidth`, `setColorMode`,
  `resetPreferences` - per-file overrides via Quick Picks.
- `openInBrowser`, `print` - standalone export to the browser.
- `openFileOnGitHub` - opens the current file on github.com.

The context menu entries appear in the preview (`webviewId ==
'markdown.preview' && !mpghViewer`); the export commands also appear in the
Command Palette for Markdown files (desktop only). The `mpghViewer` context
key comes from the image viewer layer (`data-vscode-context`), so none of
these entries is offered while the pointer is over a zoomed image or diagram:
the commands act on a document and receive no document URI from the layer.
The built-in cut, copy, and paste entries stay. Every `webview/context`
entry must carry `!mpghViewer`; `test/webview-context-menu.test.mts` locks it.

`openFileOnGitHub` is hidden unless the context key
`markdownPreviewGh.isGitHubRepo` is set. The extension maintains that key
through the built-in git extension API (`vscode.git`): whenever the active
Markdown editor changes or a Markdown document opens, it resolves the
document's repository, looks for a github.com remote (preferring `origin`),
and sets the key with `setContext`. Files that cannot exist on github.com
are filtered out in two layers: a fast scan of the repository's change
lists (untracked and ignored entries, matched case-insensitively on URI
paths), and the decisive `getObjectDetails('HEAD', relativePath)` check,
which hides gitignored files and files that were never committed - `git
status` does not report ignored files through the API at all. The key is
left untouched when the active editor is not a Markdown document (webview
focus, Output panel, other editors), so the entry stays visible for the
previews on screen; a listener on the repository's state re-runs the check
whenever `git status` finishes. Remote parsing and URL building live in
the pure `src/github-url.mts` module.

## Tests

One test file per module, all run with `npm test`:

- `test/color-mode.test.mts` - per-file mode resolution.
- `test/export-html.test.mts` - `forceTheme`, `prepareMermaidHtml`,
  `buildStandaloneHtml`, `buildRendererPageHtml`, `parseRendererMessage`,
  `exportFileName`, `toLocalFileUri`, HTML escaping.
- `test/url-resolution.test.mts` - every resolution rule: anchors,
  relative and root paths, schemes, Windows drives, `srcset`, quoting
  styles, entities, encoded and Arabic names, and skipped raw content.
- `test/image-embedding.test.mts` - MIME mapping, embeddable schemes, the
  size cap, de-duplication, failures, and base64 equality with `Buffer`.
- `test/export-body.test.mts` - the whole body preparation: embedding,
  `data-src`, `srcset`, missing images, links left as written, independence
  from the save folder, and code samples.
- `test/github-url.test.mts` - GitHub remote parsing (HTTPS, SSH, scp-like
  forms, sub-group owners), remote selection, repository-relative paths,
  blob URL building, and the untracked/ignored change-list filter with
  case-insensitive path matching.
- `test/github-command.test.mts` - the Open File on GitHub wiring end to
  end: the extension bundle loaded with a vscode stand-in and a fake git
  API, driving activation, editor switches, the state listener, the HEAD
  existence check, and the command itself.
- `test/mermaid-theme-logic.test.mts` - the pure logic of the preview
  script.
- `test/mermaid-diagram-theme.test.mts` - diagram type detection, the
  theme selection per brightness, the directive builder, and the injection
  with its user-config exemptions.
- `test/mermaid-theme-palettes.test.mts` - the frozen pure theme variable
  snapshots and their key coverage.
- `test/mermaid-render-logic.test.mts` - the pure logic of the export
  renderer: brightness resolution and lock tests for the fallback config
  of both brightnesses.
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
- `test/viewer-geometry.test.mts` - the pure geometry of the viewer: fit,
  zoom around a point, pan limits, wheel and pinch math, double-click
  targets, and the animation rectangles.
- `test/viewer-eligibility.test.mts` - which clicks open the viewer, and
  vector source detection.
- `test/webview-context-menu.test.mts` - the `webview/context` entries of
  `package.json`: every command outside the `Export As...` submenu is
  listed, every entry (commands and the submenu) is hidden while the viewer
  layer is under the pointer, and the submenu holds the four formats in
  order with PDF and PNG hidden.
- `test/preview-settings.test.mts` - the injected configuration readers.
- `test/bundle.test.mts` - the bundle output: the extension bundle requires
  only `vscode` and exports `activate`, the preview script and the Mermaid
  renderer are classic scripts, the renderer bundle executes end-to-end in a
  `require`-less browser-like sandbox, and the stylesheets are copied
  unchanged.
- `e2e/image-viewer.spec.ts` - a UI test that opens the built-in preview
  of `fixtures/image-viewer.md` in a real VS Code window and drives the
  viewer: image and diagram opening, the layer's context menu (built-in
  entries only), wheel zoom, fit reset, `Esc`, and the linked-image
  exemption.
- `e2e/export-links.spec.ts` - builds exported pages from the
  `export-*.md` fixtures (markdown-it plus the real plugin, with the
  engine's cached image rule simulated: the first render writes `src` and
  `data-src`, with or without a resource provider) and opens them in
  Playwright's Chromium: every local and remote image loads in both the
  cold-cache and the preview-rendered-first case, a missing one does not,
  `#anchor` links only change the hash, and sibling-document links point at
  the right file. No VS Code window is needed.
- `e2e/export-html.spec.ts` - a real VS Code window with keybindings bound
  to the `Export As...` HTML commands with `{ resource, target }`: it presses
  them, then opens the written files in Playwright's Chromium and checks the
  pinned theme, embedded local images (including `srcset`), the remote image
  kept as a link, the missing image keeping its written path, and links left
  as written when the file is saved at a different folder depth.
- `e2e/mermaid-themes.spec.ts` - UI tests (`npm run test:e2e`) that launch
  a real VS Code window with the extension, open the built-in preview of a
  fixture covering every diagram type, and pin the computed colors of the
  reported regressions to the pure website themes in dark and light mode.

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
