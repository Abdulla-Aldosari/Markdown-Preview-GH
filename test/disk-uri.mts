/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Test support: a file URI stand-in over a real path and a `vscode.workspace.fs`
 * stand-in over the real disk. Not a test file itself.
 */

import fs from 'node:fs';
import path from 'node:path';

/** A file URI stand-in with the few members the extension uses. */
export class DiskUri {
    readonly scheme = 'file';
    readonly fsPath: string;
    #raw: string | undefined;

    constructor(fsPath: string) {
        this.fsPath = fsPath;
    }

    get path(): string {
        return `/${this.fsPath.replace(/\\/g, '/')}`;
    }

    static file(fsPath: string): DiskUri {
        return new DiskUri(fsPath);
    }

    static parse(raw: string): DiskUri {
        const parsed = new URL(raw);
        const uri = new DiskUri(decodeURIComponent(parsed.pathname).replace(/^\/([A-Za-z]:)/, '$1'));
        // A web address is not a file: keep it as written, so a test sees what was opened.
        if (parsed.protocol !== 'file:') {
            uri.#raw = raw;
        }
        return uri;
    }

    static joinPath(base: DiskUri, ...segments: string[]): DiskUri {
        return new DiskUri(path.join(base.fsPath, ...segments));
    }

    with(): DiskUri {
        return this;
    }

    toString(): string {
        if (this.#raw) {
            return this.#raw;
        }
        return `file:///${this.fsPath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
    }
}

/** `vscode.workspace.fs` over the real disk. */
export const diskFileSystem = {
    readFile: async (uri: DiskUri) => new Uint8Array(fs.readFileSync(uri.fsPath)),
    writeFile: async (uri: DiskUri, bytes: Uint8Array) => fs.writeFileSync(uri.fsPath, bytes),
    createDirectory: async (uri: DiskUri) => void fs.mkdirSync(uri.fsPath, { recursive: true }),
    delete: async (uri: DiskUri) => fs.rmSync(uri.fsPath, { force: true }),
    stat: async (uri: DiskUri) => ({ size: fs.statSync(uri.fsPath).size }),
};
