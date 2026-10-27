# Export without the save dialog

Every export asks where to save the file. To skip the dialog, bind a key to an export command and pass the destination in `args`:

1. Open the Command Palette and run **Preferences: Open Keyboard Shortcuts (JSON)**.
2. Add an entry like this one:

```json
[
    {
        "key": "ctrl+alt+e",
        "command": "markdown-preview-gh.exportHtmlLight",
        "when": "editorLangId == markdown",
        "args": { "target": "D:/out/page.html" }
    }
]
```

Pressing `Ctrl+Alt+E` while a Markdown file is active now writes `D:/out/page.html` at once, with no dialog. An existing file at that path is replaced without asking.

- `target` - where to write the file: a file path such as `D:/out/page.html`, or a URI such as `file:///D:/out/page.html`. Use forward slashes in a path.
- `resource` - optional. The Markdown file to export, as a URI. Without it, the export uses the Markdown file that is active in the editor.

To export one fixed file whichever file is open, add `resource`:

```json
{
    "key": "ctrl+alt+p",
    "command": "markdown-preview-gh.exportPdf",
    "args": {
        "resource": "file:///D:/docs/guide.md",
        "target": "D:/out/guide.pdf"
    }
}
```

The export commands are `markdown-preview-gh.exportHtmlLight`, `markdown-preview-gh.exportHtmlDark`, and `markdown-preview-gh.exportPdf`.

<!--Auto-Stripping-By-DevDeck-During-The-Publishing-Process-For-Marketplace--[!NOTE]-not-supported-->

> [!NOTE]
> The `args` form works from a keybinding. VS Code tasks (`tasks.json`) and the `code` command line cannot run an extension command, so they cannot pass these arguments.
