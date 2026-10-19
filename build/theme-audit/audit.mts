/*-------------------------------------------------
 * Markdown Preview GH — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under MIT
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

/**
 * Theme-sync audit: reports exactly what a pending `npm run sync:themes` changed,
 * whether any of it touches the preview's GFM surface, and the new hash-lock
 * values for the test snapshot.
 *
 * Reads the pre-sync artifacts from `git show HEAD:build/...` and the
 * post-sync artifacts from the working tree, classifies each changed CSS
 * rule and palette variable against the resolved HTML surface, then writes a
 * self-contained report into the system temp directory and prints a summary.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec, execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';
import { composeBaseStylesheet, composeThemeStylesheet, PREVIEW_BODY_CLASS, RAW_BODY_CLASS } from '../theme-compose.mts';
import { THEME_NAMES } from '../theme-extract.mts';
import { MANUAL_SURFACE_TEMPLATE, MANUAL_SURFACE_TTL_MS, isStale, parseManualSurface, resolveSurface, writeManualSurfaceDate, type HtmlSurface } from './markdown-surface.mts';

const BUILD_DIR = path.resolve('build');
const AUDIT_DIR = path.join(BUILD_DIR, 'theme-audit');
const PALETTES_DIR = path.join(BUILD_DIR, 'palettes');
const MANUAL_SURFACE_PATH = path.join(AUDIT_DIR, 'manual-surface.html');
const SURFACE_MD_PATH = path.join(AUDIT_DIR, 'surface.md');
const REPORT_PATH = path.join(os.tmpdir(), 'markdown-preview-gh-theme-audit.html');

export type ChangeKind = 'added' | 'removed' | 'modified';
export type RowStatus = 'new' | 'deleted' | 'modified';

export interface PropertyChange {
    name: string;
    kind: ChangeKind;
}

export interface RuleRow {
    name: string;
    file: string;
    status: RowStatus;
    changes: PropertyChange[];
    affects: boolean;
}

/** Parses a stylesheet into selector → { property: value } (last value wins). */
export function parseCssDeclarations(css: string): Map<string, Map<string, string>> {
    const map = new Map<string, Map<string, string>>();
    postcss.parse(css).walkRules((rule) => {
        const decls = new Map<string, string>();
        rule.walkDecls((decl) => {
            if (!decl.prop.startsWith('--')) {
                decls.set(decl.prop, decl.value);
            }
        });
        for (const selector of rule.selectors) {
            const key = selector.trim();
            const existing = map.get(key);
            if (existing) {
                for (const [prop, value] of decls) {
                    existing.set(prop, value);
                }
            } else {
                map.set(key, new Map(decls));
            }
        }
    });
    return map;
}

/** Computes real per-rule changes, ignoring property reordering. */
export function diffStyles(oldCss: string, newCss: string): RuleRow[] {
    const oldMap = parseCssDeclarations(oldCss);
    const newMap = parseCssDeclarations(newCss);
    const rows: RuleRow[] = [];
    const push = (name: string, status: RowStatus, changes: PropertyChange[]): void => {
        rows.push({ name, file: 'base-styles.css', status, changes, affects: false });
    };
    for (const [name, decls] of newMap) {
        if (!oldMap.has(name)) {
            push(
                name,
                'new',
                [...decls.keys()].map((prop) => ({ name: prop, kind: 'added' as const }))
            );
        }
    }
    for (const [name, decls] of oldMap) {
        if (!newMap.has(name)) {
            push(
                name,
                'deleted',
                [...decls.keys()].map((prop) => ({ name: prop, kind: 'removed' as const }))
            );
        }
    }
    for (const [name, oldDecls] of oldMap) {
        const newDecls = newMap.get(name);
        if (!newDecls) {
            continue;
        }
        const changes: PropertyChange[] = [];
        for (const [prop, value] of newDecls) {
            if (!oldDecls.has(prop)) {
                changes.push({ name: prop, kind: 'added' });
            } else if (oldDecls.get(prop) !== value) {
                changes.push({ name: prop, kind: 'modified' });
            }
        }
        for (const prop of oldDecls.keys()) {
            if (!newDecls.has(prop)) {
                changes.push({ name: prop, kind: 'removed' });
            }
        }
        if (changes.length > 0) {
            push(name, 'modified', changes);
        }
    }
    return rows;
}

/** Computes palette variable changes. */
export function diffVariables(oldVars: Record<string, string>, newVars: Record<string, string>, file: string): RuleRow[] {
    const rows: RuleRow[] = [];
    for (const [name, value] of Object.entries(newVars)) {
        if (!(name in oldVars)) {
            rows.push({ name, file, status: 'new', changes: [{ name: 'value', kind: 'added' }], affects: false });
        } else if (oldVars[name] !== value) {
            rows.push({ name, file, status: 'modified', changes: [{ name: 'value', kind: 'modified' }], affects: false });
        }
    }
    for (const name of Object.keys(oldVars)) {
        if (!(name in newVars)) {
            rows.push({ name, file, status: 'deleted', changes: [{ name: 'value', kind: 'removed' }], affects: false });
        }
    }
    return rows;
}

/** Splits a selector into its tag, class and attribute tokens. */
export function tokenizeSelector(selector: string): { tags: string[]; classes: string[]; attributes: string[] } {
    const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
    const attributes = [...selector.matchAll(/\[([\w-]+)/g)].map((match) => match[1]);
    let rest = selector.replace(/::?[\w-]+(?:\([^)]*\))?/g, ' ');
    rest = rest.replace(/\[[^\]]*\]/g, ' ');
    rest = rest.replace(/\.[\w-]+/g, ' ');
    rest = rest.replace(/#[\w-]+/g, ' ');
    const tags = [...rest.matchAll(/[a-zA-Z][\w-]*/g)].map((match) => match[0]);
    return { tags, classes, attributes };
}

/** Strips the body scope class from a base-styles selector. */
export function stripBodyScope(selector: string): string {
    let value = selector.trim();
    for (const scope of [RAW_BODY_CLASS, PREVIEW_BODY_CLASS]) {
        if (value.startsWith(scope)) {
            value = value.slice(scope.length);
            break;
        }
    }
    return value.trim();
}

/** Whether a selector can match HTML present in the resolved surface. */
export function selectorAffects(selector: string, surface: HtmlSurface): boolean {
    const { tags, classes, attributes } = tokenizeSelector(stripBodyScope(selector));
    for (const cls of classes) {
        if (surface.classes.has(cls)) {
            continue;
        }
        if ([...surface.classPrefixes].some((prefix) => cls.startsWith(prefix))) {
            continue;
        }
        return false;
    }
    for (const tag of tags) {
        if (!surface.tags.has(tag)) {
            return false;
        }
    }
    for (const attr of attributes) {
        if (!surface.attributes.has(attr)) {
            return false;
        }
    }
    return true;
}

/** Whether a palette variable is referenced by the extension or the new base stylesheet. */
export function variableAffects(name: string, newBaseCss: string, srcContents: string[]): boolean {
    const reference = `var(${name}`;
    if (newBaseCss.includes(reference)) {
        return true;
    }
    return srcContents.some((content) => content.includes(name));
}

/** SHA-256 hex digest of a string. */
export function hashOf(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export interface ThemeInput {
    name: string;
    colorScheme: string;
    pairs: [string, string][];
}

export interface ThemeHashes {
    light: string;
    dark: string;
    base: string;
}

/** Recomputes the hash-lock values for the current working tree. */
export function computeThemeHashes(baseStylesCss: string, sharedPairs: [string, string][], themes: ThemeInput[]): ThemeHashes {
    const hashes: ThemeHashes = { light: '', dark: '', base: hashOf(composeBaseStylesheet(baseStylesCss)) };
    for (const theme of themes) {
        const css = composeThemeStylesheet({ themeName: theme.name, colorScheme: theme.colorScheme, sharedPairs, themePairs: theme.pairs });
        const value = hashOf(css);
        if (theme.name === 'light') {
            hashes.light = value;
        } else {
            hashes.dark = value;
        }
    }
    return hashes;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function badge(status: RowStatus): string {
    return `<span class="badge ${status}">${status}</span>`;
}

function changeTags(changes: PropertyChange[]): string {
    return changes.map((change) => `<span class="tag ${change.kind}">${escapeHtml(change.name)}</span>`).join(' ');
}

function impactCell(row: RuleRow): string {
    if (!row.affects) {
        return `<span class="impact-none">&#10003; No impact</span>`;
    }
    return `<span class="impact-list">${changeTags(row.changes)}</span>`;
}

function tableRows(rows: RuleRow[]): string {
    return rows
        .map(
            (row) => `        <tr>
          <td class="rule">${escapeHtml(row.name)}</td>
          <td>${badge(row.status)}</td>
          <td class="changes">${changeTags(row.changes)}</td>
          <td>${impactCell(row)}</td>
          <td class="file">${escapeHtml(row.file)}</td>
        </tr>`
        )
        .join('\n');
}

export interface ReportInput {
    verdict: 'safe' | 'review' | 'no-changes';
    source: string;
    rows: RuleRow[];
    hashes: ThemeHashes;
    generatedAt: string;
    logo: string;
}

export function renderReport(input: ReportInput): string {
    const bannerText = input.verdict === 'safe' ? 'CHANGES — NO IMPACT' : input.verdict === 'review' ? 'REVIEW REQUIRED' : 'NO CHANGES';
    const bannerIcon = input.verdict === 'no-changes' ? '&#10003;' : '&#9888;';
    const hint =
        input.verdict === 'safe'
            ? 'The sync changed rules or variables, but none of them can match the preview GFM surface, so the rendered output should look the same. Review the table below, then update the hash lock to accept it.'
            : input.verdict === 'review'
              ? 'At least one changed rule or variable matches the preview GFM surface, so the rendered output may look different. Inspect the highlighted rows, confirm the change is intended, then update the hash lock.'
              : 'No CSS rules or color variables changed, so there is nothing to review and no risk to the preview.';

    const pageDescription =
        'Reviews a pending theme sync: compares the committed snapshot with your working tree, lists every changed CSS rule and color variable, and flags changes that affect the rendered preview. Run after `npm run sync:themes`, before updating the hash lock.';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theme sync audit</title>
<style>
:root{--bg:#f6f8fa;--fg:#1f2328;--muted:#59636e;--border:#d1d9e0;--card:#fff;--green-bg:#dafbe1;--green-fg:#1a7f37;--green-bd:#aceebb;--red-bg:#ffebe9;--red-fg:#cf222e;--red-bd:#ffc1bc;--amber-bg:#fff8c5;--amber-fg:#9a6700;--amber-bd:#d4a72c}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--border:#30363d;--card:#161b22;--green-bg:#12261e;--green-fg:#3fb950;--green-bd:#2ea04366;--red-bg:#2d1516;--red-fg:#f85149;--red-bd:#da363366;--amber-bg:#2d2500;--amber-fg:#d29922;--amber-bd:#9e6a0366}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:32px 16px}
.container{max-width:1320px;margin:0 auto}
.card{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px 24px;margin-bottom:16px}
h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--muted);font-size:13px}
.header-card{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}
.header-left{display:flex;align-items:center;gap:14px}
.logo{flex:none;line-height:0}
.logo svg{width:36px;height:36px;display:block}
.header-desc{color:var(--muted);font-size:13px;max-width:520px}
.banner{display:flex;gap:12px;align-items:center;border-radius:8px;padding:14px 20px;border:1px solid;font-weight:600;margin-bottom:16px;font-size:15px}
.banner .icon{font-size:20px}
.banner.safe{background:var(--amber-bg);color:var(--amber-fg);border-color:var(--amber-bd)}
.banner.review{background:var(--red-bg);color:var(--red-fg);border-color:var(--red-bd)}
.banner.no-changes{background:var(--green-bg);color:var(--green-fg);border-color:var(--green-bd)}
.hint{font-weight:400;font-size:13px;margin-top:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}
.stat{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 16px}
.stat .n{font-size:24px;font-weight:700}
.stat .l{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:8px}
table{width:100%;border-collapse:collapse;font-size:13px;min-width:1000px}
thead th{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--border);text-align:left;padding:10px 12px;color:var(--muted);font-weight:600;white-space:nowrap}
tbody td{padding:10px 12px;border-bottom:1px solid var(--border);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:var(--bg)}
td.rule{font-family:ui-monospace,"SFMono-Regular",Consolas,monospace;font-size:12px;word-break:break-word;max-width:560px}
td.file{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--muted);white-space:nowrap}
td.changes{max-width:360px}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid;white-space:nowrap}
.badge.new{background:var(--green-bg);color:var(--green-fg);border-color:var(--green-bd)}
.badge.deleted{background:var(--red-bg);color:var(--red-fg);border-color:var(--red-bd)}
.badge.modified{background:var(--amber-bg);color:var(--amber-fg);border-color:var(--amber-bd)}
.tag{display:inline-block;margin:1px 2px;padding:1px 8px;border-radius:999px;font-size:11px;font-family:ui-monospace,Consolas,monospace;border:1px solid}
.tag.added{background:var(--green-bg);color:var(--green-fg);border-color:var(--green-bd)}
.tag.removed{background:var(--red-bg);color:var(--red-fg);border-color:var(--red-bd)}
.tag.modified{background:var(--amber-bg);color:var(--amber-fg);border-color:var(--amber-bd)}
.impact-none{color:var(--green-fg);font-weight:600;white-space:nowrap}
.code-block{border:1px solid var(--border);border-radius:8px;overflow:hidden}
.code-block-header{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--bg);border-bottom:1px solid var(--border);font-size:12px;color:var(--muted)}
.code-block-header span{font-family:ui-monospace,Consolas,monospace}
.code-block pre{margin:0;padding:14px 16px;overflow-x:auto;background:var(--card)}
.code-block code{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--fg);white-space:pre}
button.copy{border:1px solid var(--border);background:var(--card);color:var(--fg);border-radius:6px;padding:3px 12px;font-size:12px;cursor:pointer}
button.copy:hover{background:var(--bg)}
.note{color:var(--muted);font-size:12px;margin-top:12px}
</style>
</head>
<body>
<div class="container">
  <div class="card header-card">
    <div class="header-left">
      <span class="logo">${input.logo}</span>
      <div>
        <h1>Theme sync audit</h1>
        <div class="sub">Generated ${escapeHtml(input.generatedAt)} &middot; surface source: <strong>${escapeHtml(input.source)}</strong></div>
      </div>
    </div>
    <div class="header-desc">${pageDescription}</div>
  </div>
  <div class="banner ${input.verdict}">
    <span class="icon">${bannerIcon}</span>
    <div>${bannerText}<div class="hint">${hint}</div></div>
  </div>
  <div class="cards">
    <div class="stat"><div class="n">${input.rows.length}</div><div class="l">Changed rules</div></div>
    <div class="stat"><div class="n">${input.rows.filter((r) => r.affects).length}</div><div class="l">Affecting preview</div></div>
    <div class="stat"><div class="n">${input.rows.filter((r) => r.status === 'new').length}</div><div class="l">New</div></div>
    <div class="stat"><div class="n">${input.rows.filter((r) => r.status === 'deleted').length}</div><div class="l">Deleted</div></div>
    <div class="stat"><div class="n">${input.rows.filter((r) => r.status === 'modified').length}</div><div class="l">Modified</div></div>
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Rule</th><th>Status</th><th>Changes</th><th>Impact on preview</th><th>File</th></tr></thead>
        <tbody>
${tableRows(input.rows)}
        </tbody>
      </table>
    </div>
    <div class="note">Reordering a property is not a change. &ldquo;No impact&rdquo; means the selector cannot match the resolved GFM surface; raw user HTML is outside this guarantee.</div>
  </div>
  <div class="card">
    <h1>Hash lock</h1>
    <div class="code-block">
      <div class="code-block-header">
        <span>test/theme-compose.test.mts</span>
        <button class="copy" onclick="copyHash('hash-block')">Copy</button>
      </div>
      <pre><code id="hash-block">'${input.hashes.light}',
'${input.hashes.dark}',
'${input.hashes.base}',</code></pre>
    </div>


  </div>
</div>
<script>
function copyHash(id){
  var el=document.getElementById(id);
  var text=el.textContent;
  var done=function(){var b=el.closest('.code-block').querySelector('button');b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1200)};
  var fallback=function(){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(ta)};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){fallback();done()})}else{fallback();done()}
}
</script>
</body>
</html>
`;
}

function localStamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function openInBrowser(filePath: string): void {
    const command = process.platform === 'win32' ? `start "" "${filePath}"` : process.platform === 'darwin' ? `open "${filePath}"` : `xdg-open "${filePath}"`;
    exec(command, (error) => {
        if (error) {
            console.warn(`Could not open the report automatically: ${error.message}`);
            console.warn(`Open it manually: ${filePath}`);
        }
    });
}

function readGitFile(filePath: string): string {
    try {
        return execSync(`git show HEAD:${filePath}`, { encoding: 'utf8' });
    } catch {
        return '';
    }
}

function readSrcContents(): string[] {
    const files: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (/\.(mts|ts|css|js)$/.test(entry.name)) {
                files.push(fs.readFileSync(full, 'utf8'));
            }
        }
    };
    walk(path.resolve('src'));
    return files;
}

function loadPalette(name: string): { colorScheme: string; pairs: [string, string][] } {
    const palette = JSON.parse(fs.readFileSync(path.join(PALETTES_DIR, `${name}.json`), 'utf8'));
    return { colorScheme: palette.colorScheme, pairs: Object.entries(palette.variables) as [string, string][] };
}

function loadSharedPairs(): [string, string][] {
    return Object.entries(JSON.parse(fs.readFileSync(path.join(PALETTES_DIR, 'shared.json'), 'utf8')).variables) as [string, string][];
}

function loadVars(fileName: string): Record<string, string> {
    return JSON.parse(fs.readFileSync(path.join(PALETTES_DIR, fileName), 'utf8')).variables as Record<string, string>;
}

function themeFilesInChangeTree(): boolean {
    try {
        const changed = execSync('git diff --name-only HEAD -- build/base-styles.css build/palettes', { encoding: 'utf8' });
        return changed.trim().length > 0;
    } catch {
        return true;
    }
}

function main(): void {
    if (!themeFilesInChangeTree()) {
        console.log('\x1b[33mThe theme files are not in the change tree; there is no reason to run this script.\x1b[0m');
        return;
    }

    if (!fs.existsSync(MANUAL_SURFACE_PATH)) {
        fs.writeFileSync(MANUAL_SURFACE_PATH, MANUAL_SURFACE_TEMPLATE, 'utf8');
        console.log(`Created ${path.relative(process.cwd(), MANUAL_SURFACE_PATH)} — run this command again to audit.`);
        console.log('Optional: paste the real preview HTML (from surface.md rendered in VS Code) into the file first for full accuracy.');
        return;
    }

    const manualRaw = fs.readFileSync(MANUAL_SURFACE_PATH, 'utf8');
    const manual = parseManualSurface(manualRaw);
    let manualHtml: string | null = null;
    if (manual.hasContent) {
        if (manual.date === null) {
            fs.writeFileSync(MANUAL_SURFACE_PATH, writeManualSurfaceDate(manualRaw, localStamp(new Date())), 'utf8');
            manualHtml = manual.content;
        } else if (isStale(manual.date, Date.now(), MANUAL_SURFACE_TTL_MS)) {
            console.error('manual-surface.html contains stale content (older than 5 minutes).');
            console.error('Clear the manual-surface-date value, refresh the pasted HTML, then run this command again.');
            process.exitCode = 1;
            return;
        } else {
            manualHtml = manual.content;
        }
    }

    const surfaceMd = fs.readFileSync(SURFACE_MD_PATH, 'utf8');
    const { source, surface } = resolveSurface(manualHtml, surfaceMd);

    const newBaseCss = fs.readFileSync(path.join(BUILD_DIR, 'base-styles.css'), 'utf8');
    const oldBaseCss = readGitFile('build/base-styles.css');
    const rows: RuleRow[] = diffStyles(oldBaseCss, newBaseCss);
    for (const name of THEME_NAMES) {
        rows.push(...diffVariables(JSON.parse(readGitFile(`build/palettes/${name}.json`) || '{"variables":{}}').variables, loadVars(`${name}.json`), `${name}.json`));
    }
    rows.push(...diffVariables(JSON.parse(readGitFile('build/palettes/shared.json') || '{"variables":{}}').variables, loadVars('shared.json'), 'shared.json'));

    const srcContents = readSrcContents();
    for (const row of rows) {
        row.affects = row.file === 'base-styles.css' ? selectorAffects(row.name, surface) : variableAffects(row.name, newBaseCss, srcContents);
    }

    const hashes = computeThemeHashes(
        newBaseCss,
        loadSharedPairs(),
        THEME_NAMES.map((name) => ({ name, ...loadPalette(name) }))
    );
    const verdict: ReportInput['verdict'] = rows.length === 0 ? 'no-changes' : rows.some((row) => row.affects) ? 'review' : 'safe';
    const logo = fs.readFileSync(path.resolve('images', 'logo.svg'), 'utf8');
    const html = renderReport({ verdict, source, rows, hashes, generatedAt: new Date().toISOString(), logo });
    fs.writeFileSync(REPORT_PATH, html, 'utf8');
    openInBrowser(REPORT_PATH);

    console.log(`Verdict: ${verdict.toUpperCase()} (surface source: ${source})`);
    console.log(`Changes: ${rows.length} (${rows.filter((row) => row.affects).length} affecting the preview)`);
    console.log(`Report: ${REPORT_PATH}`);
    console.log('Hashes:');
    console.log(`  light = ${hashes.light}`);
    console.log(`  dark  = ${hashes.dark}`);
    console.log(`  base  = ${hashes.base}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    main();
}
