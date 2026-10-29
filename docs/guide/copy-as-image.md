# Copy as an image

Right-click inside the preview and copy part of the document to the clipboard as a PNG image, ready to paste into a chat, a document, or an issue. Four commands are available:

- **Copy This Section As PNG** - right-click a heading to copy its whole section.
- **Copy This Table As PNG** - right-click a table to copy it.
- **Copy This Code Block As PNG** - right-click a code block to copy it.
- **Copy This Diagram As PNG** - right-click a diagram to copy it.

## Copy This Section As PNG

Right-click a heading and choose **Copy This Section As PNG**. The section is copied up to the next heading of the same or a higher level, so its subsections are included, and a message confirms that it was copied. Then paste it where you need it, for example into a new GitHub issue (the **Preview** tab shows the pasted image) or into a Discord message.

<p align="center">
  <img src="https://raw.githubusercontent.com/Abdulla-Aldosari/repo-assets/main/Markdown-Preview-GH/readme/copy-this-section-as-png.gif" alt="Copy This Section As PNG, pasted into a GitHub issue and a Discord direct message" />
</p>

## Copy This Table, Code Block, or Diagram As PNG

The same right-click works on the other blocks of the preview:

- **Copy This Table As PNG** - on a table.
- **Copy This Code Block As PNG** - on a code block.
- **Copy This Diagram As PNG** - on a Mermaid diagram.

Each block is copied on its own and pasted as a separate image, for example into a Figma file.

<p align="center">
  <img src="https://raw.githubusercontent.com/Abdulla-Aldosari/repo-assets/main/Markdown-Preview-GH/readme/copy-this-as-png.gif" alt="Copy This Table, Code Block, and Diagram As PNG, pasted into Figma" />
</p>

## Image copy details

These points apply to all four commands.

- **Remote pictures** inside the copied part show a progress bar while they are fetched. If one cannot be fetched, the copy fails with a message that names the host, and nothing is copied: you get a complete image or none. A picture whose server does not allow it (a missing `Access-Control-Allow-Origin` header) fails this way, even though the preview shows it.
- **Image size.** The `markdown-preview-gh.blockImageScale` setting (`1`, `1.5`, `2`, `2.5`, or `3`, default `1`) sets how many image pixels one pixel of the block becomes. `1` is the actual size of the block.
- **Rounded corners.** The `markdown-preview-gh.blockImageRadius` setting (a whole number from `0` to `16`, default `10`) rounds the corners of the image. `0` keeps square corners; a rounded corner is transparent, so it takes the background of whatever you paste onto.

### The image can look smaller than the preview

The scale does **not** follow VS Code zoom or your operating system's display scaling. If you work with VS Code zoomed in (`window.zoomLevel` above 0), or on a screen scaled to 125% or more, the preview looks larger to you than the pixel size the image is made at, so the pasted image looks smaller than what you saw. For example, at `window.zoomLevel` 1 (a factor of 1.2) a block shown 181 pixels wide on screen is copied 151 pixels wide at scale `1`; a display scaled to 200% doubles what you see.

To get an image that matches what you see, raise `markdown-preview-gh.blockImageScale` to roughly that factor: `1.5` for a zoom of 1.2 or a display scaled to 125% or 150%, `2` for 200%, and so on. The first time you copy a block with the default scale, a message says this once and offers a button that opens the setting.
