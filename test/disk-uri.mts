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
        return new DiskUri(decodeURIComponent(new URL(raw).pathname).replace(/^\/([A-Za-z]:)/, '$1'));
    }

    static joinPath(base: DiskUri, ...segments: string[]): DiskUri {
        return new DiskUri(path.join(base.fsPath, ...segments));
    }

    with(): DiskUri {
        return this;
    }

    toString(): string {
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
