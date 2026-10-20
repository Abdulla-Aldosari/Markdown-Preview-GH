/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Pure logic for linking the previewed file to its location on github.com:
 * parsing git remote URLs, picking the GitHub remote, computing the
 * repository-relative path, building the `blob` URL, and deciding from the
 * git change lists whether the file can exist on github.com at all.
 * The module imports nothing from `vscode` or Node, so the extension bundle
 * keeps `vscode` as its only external dependency.
 */

/** A git remote as exposed by the built-in git extension. */
export interface GithubRemote {
    name: string;
    fetchUrl?: string;
    pushUrl?: string;
}

/** The owner and repository name parsed from a github.com remote URL. */
export interface GithubRepo {
    owner: string;
    repo: string;
}

/** Everything needed to build the github.com blob URL of a file. */
export interface GithubFileLocation extends GithubRepo {
    branch: string;
    relativePath: string;
}

/**
 * Numeric `Status` values of the built-in git extension API (the enum order
 * of `Status` in its git.d.ts). `@types/vscode` does not export them, so the
 * values this extension relies on are declared here and locked by a test.
 */
export const GIT_STATUS_UNTRACKED = 7;

export const GIT_STATUS_IGNORED = 8;

/** A change entry of the git extension API's working-tree state lists. */
export interface GitChangeEntry {
    uri: string;
    status: number;
}

/**
 * Reports whether the change lists mark the document as untracked or
 * ignored. Both states mean git does not record the file in history, so it
 * cannot exist on github.com. Paths are compared (not full URI strings)
 * because the document URI and the git resource URIs can carry different
 * schemes (remote workspaces) or drive-letter casing; the comparison is
 * case-insensitive, mirroring the git extension's own `pathEquals`.
 */
export function isIgnoredOrUntracked(changes: readonly GitChangeEntry[], docPath: string): boolean {
    const target = docPath.toLowerCase();
    return changes.some((change) => change.uri.toLowerCase() === target && (change.status === GIT_STATUS_UNTRACKED || change.status === GIT_STATUS_IGNORED));
}

/**
 * Parses a remote URL into its host and path. Supports URL forms
 * (`https://`, `ssh://`, ...) and the scp-like form `[user@]host:path`.
 */
function parseRemoteUrl(raw: string): { host: string; path: string } | undefined {
    const url = raw.trim();
    if (!url) {
        return undefined;
    }
    const colon = url.indexOf(':');
    // scp-like: [user@]host:path — after the colon there is no `//`.
    if (colon !== -1 && !url.slice(colon + 1).startsWith('//')) {
        const at = url.indexOf('@');
        const host = at !== -1 && at < colon ? url.slice(at + 1, colon) : url.slice(0, colon);
        return { host, path: url.slice(colon + 1) };
    }
    try {
        const parsed = new URL(url);
        return { host: parsed.hostname, path: parsed.pathname };
    } catch {
        // A plain host/path form without a scheme.
        const slash = url.indexOf('/');
        return slash === -1 ? { host: url, path: '' } : { host: url.slice(0, slash), path: url.slice(slash + 1) };
    }
}

/**
 * Extracts the GitHub owner and repository from a github.com remote URL.
 * Returns `undefined` when the remote does not point at github.com or does
 * not name an owner and a repository. Owners may contain slashes
 * (`org/team/repo.git` maps to owner `org/team`).
 */
export function parseGithubRemote(remoteUrl: string | undefined): GithubRepo | undefined {
    if (!remoteUrl) {
        return undefined;
    }
    const parsed = parseRemoteUrl(remoteUrl);
    if (!parsed || parsed.host.toLowerCase() !== 'github.com') {
        return undefined;
    }
    const cleaned = parsed.path.replace(/\/+$/, '').replace(/\.git$/i, '');
    const segments = cleaned.split('/').filter((segment) => segment !== '');
    if (segments.length < 2) {
        return undefined;
    }
    return {
        owner: segments.slice(0, -1).join('/'),
        repo: segments[segments.length - 1],
    };
}

/**
 * Picks the github.com remote of a repository: the remote named `origin`
 * when it is one, otherwise the first GitHub remote in the list. A remote
 * without a fetch URL falls back to its push URL.
 */
export function findGithubRemote(remotes: readonly GithubRemote[]): GithubRepo | undefined {
    const origin = remotes.find((remote) => remote.name === 'origin');
    const candidates = origin ? [origin, ...remotes.filter((remote) => remote !== origin)] : remotes;
    for (const remote of candidates) {
        const parsed = parseGithubRemote(remote.fetchUrl) ?? parseGithubRemote(remote.pushUrl);
        if (parsed) {
            return parsed;
        }
    }
    return undefined;
}

/**
 * Computes the path of `filePath` relative to `rootPath` using forward
 * slashes, as in `vscode.Uri.path`. Returns `undefined` when the file is not
 * inside the root. The prefix comparison is case-insensitive (the repository
 * root can carry different drive-letter casing than the document path), but
 * the returned path keeps the casing of `filePath` for the URL.
 */
export function computeRelativePath(rootPath: string, filePath: string): string | undefined {
    if (filePath.toLowerCase() === rootPath.toLowerCase()) {
        return '';
    }
    const prefix = rootPath.endsWith('/') ? rootPath : `${rootPath}/`;
    if (!filePath.toLowerCase().startsWith(prefix.toLowerCase())) {
        return undefined;
    }
    return filePath.slice(prefix.length);
}

/**
 * Builds the github.com `blob` URL for a file. Path segments and the branch
 * are percent-encoded individually; slashes in the path (and in a sub-group
 * owner) are preserved. No `#L…` line anchor is appended: GitHub renders
 * Markdown files instead of showing source lines, where the anchor would be
 * ignored (the documented way to highlight lines, `?plain=1`, would trade
 * the rendered view for the raw source).
 */
export function buildGithubFileUrl(location: GithubFileLocation): string {
    const encodedPath = location.relativePath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `https://github.com/${location.owner}/${location.repo}/blob/${encodeURIComponent(location.branch)}/${encodedPath}`;
}
