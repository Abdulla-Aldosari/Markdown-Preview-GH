# Troubleshooting

## A command is missing from the context menu

| Command                                                   | Why it can be missing                                                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Open in Browser**, **Print...**, **Export As... > PDF** | VS Code for the Web cannot open a local browser, so these are hidden there. **Export As... > HTML** works on the web.             |
| **Open File on GitHub**                                   | Hidden on the web, and hidden unless the file is tracked by git in a repository that has a github.com remote.                     |
| **Copy This ... As PNG**                                  | Each entry appears only over its own kind of block (a heading, a table, a code block, or a diagram), and not over a zoomed image. |
| Any entry of this extension                               | While the zoom viewer is open, only the built-in **Cut**, **Copy**, and **Paste** entries are offered. Close the viewer first.    |

## Copy as PNG

- **"Copying as an image is not available in this version of VS Code."** The copy relies on a command of VS Code's own Markdown preview. If a VS Code update removes it, the entries disappear from the menu. Update the extension, or report it on the [issue tracker](https://github.com/Abdulla-Aldosari/Markdown-Preview-GH/issues).
- **The copy fails and names a host.** A remote picture inside the copied part could not be fetched, usually because its server does not send an `Access-Control-Allow-Origin` header. The preview can show such a picture, but a picture that cannot be read cannot be put into the image, so nothing is copied. Use a local copy of the picture, or one from a server that allows it.
- **"It is still being drawn."** A Mermaid diagram that has not finished drawing cannot be copied yet. Try again in a moment.
- **The block is too large.** A block above 16384 pixels on a side or 100 million pixels, or one with more than 1500 elements, is refused instead of being cut. Copy a smaller part, such as one section.
- **The pasted image looks small.** The scale does not follow VS Code zoom or your display scaling. See [The image can look smaller than the preview](copy-as-image.md#the-image-can-look-smaller-than-the-preview).

## Export As PDF

- **No browser was found.** PDF export needs Microsoft Edge, Google Chrome, or Chromium on the machine where the extension runs. In a remote window (WSL, SSH, Dev Containers) that is the remote machine, not your local computer. Install one there, or set `markdown-preview-gh.export.browserPath` to its full path. The message offers **Open Settings**, **Export as HTML instead**, and **Open in Browser (then Save as PDF)**.
- **`browserPath` points to a file that does not exist.** The setting is never replaced by automatic detection; the message names the path so you can correct it.
- **"The browser exited unexpectedly".** The message names the exit code or the signal that stopped the browser, and quotes the last lines the browser printed. Those lines usually name the cause, such as a missing system library.

### The browser exits in a Dev Container

The message says that the browser's sandbox could not start, and offers an **Open Troubleshooting Guide** button that opens this section. Chromium isolates every page in a sandbox built on Linux namespaces, and Docker's default seccomp profile blocks the system calls that create them, so Chromium stops at once. Installing the `chromium-sandbox` package does not help: the container refuses its helper too. The extension never turns the browser's sandbox off; allow it in `.devcontainer/devcontainer.json` instead, then run **Dev Containers: Rebuild Container**:

```jsonc
"runArgs": ["--security-opt", "seccomp=unconfined"],
"postCreateCommand": "sudo apt-get update && sudo apt-get install -y chromium"
```

A rebuild creates a new container, so a browser installed by hand is gone afterwards; `postCreateCommand` installs it again. Leave that line out when the image already contains a browser.

`seccomp=unconfined` removes the system-call filter from the whole container, not only from the browser. Use it for containers you trust.

## Diagnostic log

Set `markdown-preview-gh.diagnosticLogging` to `true` and open the **Markdown Preview GH** output channel (**View > Output**). Today the log explains the decisions of **Open File on GitHub**: which repository was found, which remote was used, and why a file was hidden or refused. It writes nothing while the setting is off.

## Still stuck?

Open an issue at <https://github.com/Abdulla-Aldosari/Markdown-Preview-GH/issues> with your VS Code version, your operating system, whether you use a remote window or VS Code for the Web, and the steps that lead to the problem.
