<!-- LOGO_START -->
<p align="center">
  <img src="images/logo256.png" width="80" alt="Markdown Preview GH" />
</p>
<!-- LOGO_END -->

<h1 align="center">Markdown Preview GH</h1>

Your everyday Markdown preview, styled exactly like GitHub. Full GFM support, GitHub's light and dark themes, Mermaid diagrams, RTL support, and more — right inside VS Code.

![Markdown Preview GH example](images/readme/main-screen.png)

## Features

### GitHub-accurate styling

- Renders the preview using GitHub's own CSS, including typography, spacing, tables, and code blocks.
- Ships with GitHub's light and dark themes.
- By default, the theme automatically matches your current VS Code color theme (light/dark); it can also be pinned to the light or dark theme.
- Fully customizable via your own [`markdown.styles`](https://code.visualstudio.com/Docs/languages/markdown#_using-your-own-css) CSS. Target `.mpgh-body` instead of `body` so your rules don't get overridden by the extension's theme.

#### Code blocks

Fenced code blocks render with GitHub's exact syntax highlighting and spacing.

![Code block example](images/readme/code-block-example.png)

### GitHub-Flavored Markdown (GFM) extensions

#### Alerts

`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, and `[!CAUTION]` blockquotes are rendered with GitHub's colored callout boxes and icons, not plain blockquotes.

![Alerts example](images/readme/alerts-example.png)

#### Task lists

`- [ ]` / `- [x]` list items render as real (disabled) checkboxes, matching GitHub's rendered issue/PR style.

![Task list example](images/readme/task-list-example.png)

#### Emoji shortcodes

`:tada:`, `:rocket:`, `:bug:`, and the rest of GitHub's shortcode set are converted to their emoji automatically.

![Emoji shortcodes example](images/readme/emoji-example.png)

### Mermaid diagrams

Fenced `mermaid` code blocks render as diagrams, and they automatically follow the preview's theme - the editor-matched, light, or dark theme, including per-file theme overrides.

![Mermaid example](images/readme/mermaid-example.png)

### Right-to-left (RTL) language support

- Set the content direction of the preview to `LTR`, `RTL`, or `Auto` (detected from the document content).
- Code blocks always render left-to-right regardless of the surrounding document direction, since source code is always authored LTR.
- When the active direction is RTL, alert titles (Note, Tip, Important, Warning, Caution) are automatically localized to Arabic.

![RTL language support example](images/readme/rtl-language-example.png)

### Per-file layout preferences

Content direction, content width, and theme can be overridden on a **per-file basis**, independently of your global settings:

- Right-click inside the preview to access the extension actions directly.
- **Content Direction...** - choose `LTR`, `RTL`, or `Auto` for the current file only.
- **Content Width...** - choose `Narrow` (640px), `Normal` (838px, GitHub's own width), `Wide` (1024px), or `Full` (1200px) for the current file only.
- **Theme...** - choose `Light` or `Dark` for the current file only.
- **Reset Preferences for this file** - clears any per-file overrides and falls back to your global settings.

Per-file preferences are remembered across sessions for that file, without affecting any other file or your workspace defaults.

### Open in browser and print

- **Open in Browser** - exports the rendered document, with all of its GitHub styling, as a standalone HTML page and opens it in your default browser.
- **Print...** - does the same and opens the browser's print dialog automatically, so you can print the document or save it as PDF.

Both commands are available directly from the preview context menu and from the Command Palette while a Markdown file is active. Exported pages always use GitHub's light theme, and relative images are resolved against the Markdown file's folder. Mermaid diagrams are rendered into the export as static SVG, so they appear in the exported page and in printed/PDF output without needing JavaScript. The generated page is stored in the extension's global storage folder, so nothing is written into your project.

![Print example](images/readme/print-example.png)

## Configuration

These settings control the extension's global defaults. Per-file overrides (see [Per-file layout preferences](#per-file-layout-preferences)) always take priority over them for the files they're set on.

- `markdown-preview-gh.colorTheme`

    Determines how the preview picks its GitHub color theme. Default: `auto`.

    - `Match the editor theme` (`auto`): Use the GitHub theme that matches the editor's light/dark color theme.
    - `Dark`: Always display the preview with GitHub's dark theme.
    - `Light`: Always display the preview with GitHub's light theme.

- `markdown-preview-gh.contentDirection`

    Default content direction for the Markdown preview content. Default: `ltr`.

    - `ltr`: Left to right.
    - `rtl`: Right to left.
    - `auto`: Detect automatically from the content.

- `markdown-preview-gh.contentWidth`

    Default content width for the Markdown preview. Default: `normal`.

    - `narrow`: 640px
    - `normal`: 838px - matches GitHub's own content width
    - `wide`: 1024px
    - `full`: 1200px

## Preview Context Menu

Right-click inside the preview to access the following actions directly:

![Preview context menu](images/readme/context-menu.png)

- **Content Direction...** - Set the content direction (`LTR` / `RTL` / `Auto`) for the current file only.
- **Content Width...** - Set the content width (`Narrow` / `Normal` / `Wide` / `Full`) for the current file only.
- **Theme...** - Set the theme (`Light` / `Dark`) for the current file only.
- **Reset Preferences for this file** - Clear this file's content direction, content width, and theme overrides.
- **Open in Browser** - Open the rendered document as a standalone page in your default browser.
- **Print...** - Open the rendered document in your browser and show the print dialog.
