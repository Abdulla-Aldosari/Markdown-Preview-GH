# Image and diagram viewer

Click an image or a Mermaid diagram in the preview to open it in a viewer that zooms and pans. The viewer grows out of the clicked element and shrinks back into it when you close it.

![Print example](https://raw.githubusercontent.com/Abdulla-Aldosari/repo-assets/main/Markdown-Preview-GH/readme/image-viewer-example.gif)

## Controls

| Action                               | How                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Zoom                                 | Mouse wheel, trackpad pinch, two-finger pinch, or the `-` and `+` buttons |
| Zoom with the keyboard               | `+` and `-`                                                               |
| Fit to the screen                    | The percentage button in the toolbar, or `0`                              |
| Actual size                          | `1`                                                                       |
| Switch between fit and a closer view | Double click the content                                                  |
| Pan                                  | Drag, or the arrow keys                                                   |
| Close                                | `Esc`, the close button, or a click on the backdrop                       |

The zoom goes from the fitted size up to 800%. A raster image is never enlarged past its own pixels when it is fitted to the screen; a diagram or an SVG image can be enlarged up to four times while it fits.

## What does not open

- An image that sits inside a link keeps the link's behavior.
- Content shown smaller than 48 pixels on both sides is treated as an icon.
- A click with `Ctrl`, `Cmd`, `Shift`, or `Alt` held, and a click that ends a text selection, do not open the viewer.

## Good to know

- The viewer takes the theme of the preview, so it follows the per-file theme as well.
- The extension's own context menu entries are not offered over the viewer. The built-in **Cut**, **Copy**, and **Paste** entries stay.
- The viewer respects the system setting that reduces motion: the transitions are turned off.
- Exported pages, printed pages, and PDF files do not include the viewer.
