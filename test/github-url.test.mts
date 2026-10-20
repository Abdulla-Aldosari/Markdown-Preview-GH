/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildGithubFileUrl,
    computeRelativePath,
    findGithubRemote,
    GIT_STATUS_IGNORED,
    GIT_STATUS_UNTRACKED,
    isIgnoredOrUntracked,
    parseGithubRemote,
    type GithubRemote,
} from '../src/github-url.mts';

test('parseGithubRemote reads HTTPS URLs', () => {
    assert.deepEqual(parseGithubRemote('https://github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' });
    assert.deepEqual(parseGithubRemote('https://github.com/owner/repo'), { owner: 'owner', repo: 'repo' });
    assert.deepEqual(parseGithubRemote('https://github.com/owner/repo/'), { owner: 'owner', repo: 'repo' });
    assert.deepEqual(parseGithubRemote('https://github.com/owner/repo.git/'), { owner: 'owner', repo: 'repo' });
});

test('parseGithubRemote reads other URL schemes', () => {
    assert.deepEqual(parseGithubRemote('http://github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' });
    assert.deepEqual(parseGithubRemote('ssh://git@github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' });
    assert.deepEqual(parseGithubRemote('git://github.com/owner/repo.git'), { owner: 'owner', repo: 'repo' });
});

test('parseGithubRemote reads the scp-like form', () => {
    assert.deepEqual(parseGithubRemote('git@github.com:owner/repo.git'), { owner: 'owner', repo: 'repo' });
    assert.deepEqual(parseGithubRemote('github.com:owner/repo.git'), { owner: 'owner', repo: 'repo' });
});

test('parseGithubRemote supports sub-group owners', () => {
    assert.deepEqual(parseGithubRemote('https://github.com/org/team/repo.git'), { owner: 'org/team', repo: 'repo' });
    assert.deepEqual(parseGithubRemote('git@github.com:org/team/repo.git'), { owner: 'org/team', repo: 'repo' });
});

test('parseGithubRemote rejects non-GitHub hosts', () => {
    assert.equal(parseGithubRemote('https://gitlab.com/owner/repo.git'), undefined);
    assert.equal(parseGithubRemote('git@github.enterprise.com:owner/repo.git'), undefined);
    assert.equal(parseGithubRemote('git@bitbucket.org:owner/repo.git'), undefined);
});

test('parseGithubRemote rejects unusable URLs', () => {
    assert.equal(parseGithubRemote(undefined), undefined);
    assert.equal(parseGithubRemote(''), undefined);
    assert.equal(parseGithubRemote('https://github.com'), undefined);
    assert.equal(parseGithubRemote('https://github.com/'), undefined);
    assert.equal(parseGithubRemote('https://github.com/owner'), undefined);
});

test('findGithubRemote prefers the remote named origin', () => {
    const remotes: GithubRemote[] = [
        { name: 'upstream', fetchUrl: 'https://github.com/upstream-owner/repo.git' },
        { name: 'origin', fetchUrl: 'https://github.com/origin-owner/repo.git' },
    ];
    assert.deepEqual(findGithubRemote(remotes), { owner: 'origin-owner', repo: 'repo' });
});

test('findGithubRemote uses the first GitHub remote without an origin', () => {
    const remotes: GithubRemote[] = [
        { name: 'gitlab', fetchUrl: 'https://gitlab.com/owner/repo.git' },
        { name: 'fork', fetchUrl: 'git@github.com:fork-owner/repo.git' },
        { name: 'upstream', fetchUrl: 'https://github.com/upstream-owner/repo.git' },
    ];
    assert.deepEqual(findGithubRemote(remotes), { owner: 'fork-owner', repo: 'repo' });
});

test('findGithubRemote skips an origin that is not on GitHub', () => {
    const remotes: GithubRemote[] = [
        { name: 'origin', fetchUrl: 'https://gitlab.com/owner/repo.git' },
        { name: 'backup', fetchUrl: 'https://github.com/backup-owner/repo.git' },
    ];
    assert.deepEqual(findGithubRemote(remotes), { owner: 'backup-owner', repo: 'repo' });
});

test('findGithubRemote falls back to the push URL', () => {
    const remotes: GithubRemote[] = [{ name: 'origin', pushUrl: 'git@github.com:owner/repo.git' }];
    assert.deepEqual(findGithubRemote(remotes), { owner: 'owner', repo: 'repo' });
});

test('findGithubRemote returns undefined without a GitHub remote', () => {
    assert.equal(findGithubRemote([]), undefined);
    assert.equal(findGithubRemote([{ name: 'origin', fetchUrl: 'https://gitlab.com/owner/repo.git' }]), undefined);
});

test('git status constants match the enum order of the built-in git API', () => {
    assert.equal(GIT_STATUS_UNTRACKED, 7);
    assert.equal(GIT_STATUS_IGNORED, 8);
});

test('isIgnoredOrUntracked flags only the document entries git does not track', () => {
    assert.equal(isIgnoredOrUntracked([], 'file:///repo/notes.md'), false);
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///repo/notes.md', status: GIT_STATUS_UNTRACKED }], 'file:///repo/notes.md'), true);
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///repo/notes.md', status: GIT_STATUS_IGNORED }], 'file:///repo/notes.md'), true);
});

test('isIgnoredOrUntracked keeps tracked documents openable', () => {
    // MODIFIED and DELETED paths exist in git history; INDEX_ADDED is
    // staged (tracked). None of them is untracked or ignored.
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///repo/notes.md', status: 5 }], 'file:///repo/notes.md'), false);
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///repo/notes.md', status: 6 }], 'file:///repo/notes.md'), false);
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///repo/notes.md', status: 1 }], 'file:///repo/notes.md'), false);
});

test('isIgnoredOrUntracked ignores entries of other documents', () => {
    const changes = [
        { uri: 'file:///repo/other.md', status: GIT_STATUS_IGNORED },
        { uri: 'file:///repo/third.md', status: GIT_STATUS_UNTRACKED },
    ];
    assert.equal(isIgnoredOrUntracked(changes, 'file:///repo/notes.md'), false);
});

test('isIgnoredOrUntracked matches drive-letter casing differences on Windows', () => {
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///C%3A/work/notes.md', status: GIT_STATUS_UNTRACKED }], 'file:///c%3A/work/notes.md'), true);
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///C%3A/work/notes.md', status: GIT_STATUS_IGNORED }], 'file:///c%3A/work/notes.md'), true);
    assert.equal(isIgnoredOrUntracked([{ uri: 'file:///C%3A/work/notes.md', status: 5 }], 'file:///c%3A/work/notes.md'), false);
});

test('computeRelativePath resolves files inside the root', () => {
    assert.equal(computeRelativePath('/repo', '/repo/README.md'), 'README.md');
    assert.equal(computeRelativePath('/repo', '/repo/docs/guide.md'), 'docs/guide.md');
    assert.equal(computeRelativePath('/repo/', '/repo/docs/guide.md'), 'docs/guide.md');
    assert.equal(computeRelativePath('/repo', '/repo'), '');
});

test('computeRelativePath rejects files outside the root', () => {
    assert.equal(computeRelativePath('/repo', '/other/README.md'), undefined);
    assert.equal(computeRelativePath('/repo', '/repo2/README.md'), undefined);
});

test('computeRelativePath tolerates root casing mismatches and keeps the file casing', () => {
    assert.equal(computeRelativePath('/C:/work/repo', '/c:/work/repo/docs/guide.md'), 'docs/guide.md');
    assert.equal(computeRelativePath('/c:/work/repo', '/C:/work/repo/Docs/Guide.md'), 'Docs/Guide.md');
});

test('computeRelativePath works with Windows drive prefixes in URI paths', () => {
    assert.equal(computeRelativePath('/D:/work/repo', '/D:/work/repo/src/notes.md'), 'src/notes.md');
});

test('buildGithubFileUrl builds the blob URL without a line anchor', () => {
    assert.equal(buildGithubFileUrl({ owner: 'owner', repo: 'repo', branch: 'main', relativePath: 'docs/readme.md' }), 'https://github.com/owner/repo/blob/main/docs/readme.md');
});

test('buildGithubFileUrl percent-encodes path segments and the branch', () => {
    assert.equal(
        buildGithubFileUrl({ owner: 'owner', repo: 'repo', branch: 'main', relativePath: 'docs/my file.md' }),
        'https://github.com/owner/repo/blob/main/docs/my%20file.md'
    );
    assert.equal(buildGithubFileUrl({ owner: 'owner', repo: 'repo', branch: 'main', relativePath: 'docs/a#b.md' }), 'https://github.com/owner/repo/blob/main/docs/a%23b.md');
    assert.equal(
        buildGithubFileUrl({ owner: 'owner', repo: 'repo', branch: 'feature/x', relativePath: 'docs/guide.md' }),
        'https://github.com/owner/repo/blob/feature%2Fx/docs/guide.md'
    );
});

test('buildGithubFileUrl keeps sub-group owners and empty paths', () => {
    assert.equal(buildGithubFileUrl({ owner: 'org/team', repo: 'repo', branch: 'main', relativePath: 'readme.md' }), 'https://github.com/org/team/repo/blob/main/readme.md');
    assert.equal(buildGithubFileUrl({ owner: 'owner', repo: 'repo', branch: 'main', relativePath: '' }), 'https://github.com/owner/repo/blob/main/');
});
