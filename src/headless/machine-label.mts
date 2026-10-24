/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Names the machine the extension runs on, so a message about a missing
 * program or path cannot be mistaken for the user's local computer when the
 * window is connected to a remote one. Pure: the host facts are injected.
 */

/** Facts about the machine the extension host runs on, read by the desktop entry point. */
export interface HostInfo {
    /** The machine's host name (`os.hostname()`). */
    hostName: string;
    /** The WSL distribution name (`WSL_DISTRO_NAME`), when running inside WSL. */
    wslDistro?: string;
}

export interface MachineDescription {
    /** How to refer to the machine in a sentence, such as `WSL: Ubuntu-22.04`. */
    label: string;
    /** Whether the machine is not the one the user sits at. */
    remote: boolean;
}

/**
 * Describes the machine the extension runs on.
 * @param remoteName `vscode.env.remoteName`; `undefined` in a local window.
 * @param host The host facts; `undefined` when unavailable.
 */
export function describeMachine(remoteName: string | undefined, host: HostInfo | undefined): MachineDescription {
    if (!remoteName) {
        return { label: 'this computer', remote: false };
    }
    const hostName = host?.hostName || 'unknown host';
    switch (remoteName) {
        case 'wsl':
            return { label: `WSL: ${host?.wslDistro || hostName}`, remote: true };
        case 'ssh-remote':
            return { label: `the SSH host "${hostName}"`, remote: true };
        case 'dev-container':
        case 'attached-container':
            return { label: `the container "${hostName}"`, remote: true };
        case 'codespaces':
            return { label: `the Codespace "${hostName}"`, remote: true };
        case 'tunnel':
            return { label: `the tunnel machine "${hostName}"`, remote: true };
        default:
            return { label: `the remote machine "${hostName}" (${remoteName})`, remote: true };
    }
}
