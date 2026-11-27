/**
 * Local git for members with GitHub repos (docs/designs/github-local-git.md).
 *
 * The main process is the only thing that talks to GitHub. It keeps one bare
 * mirror per repo (members' shells read it, offline), makes each member's
 * working copy once, and takes a member's push as a bundle file: one file of
 * refs and objects, so main never runs git in a repo the member controls
 * (adversarial review, findings 1, 3 and 4). The push is checked against the
 * member's GitHub modes, then sent or held for the owner.
 *
 * Every git command: an argument list (no shell), a timeout, the owner's own
 * git settings off, hooks and fsmonitor off, no external diff or textconv, no
 * submodule recursion, only https and local paths. The token reaches git only
 * through a one-off askpass file in the app's private folder.
 */

import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, constants as fsc, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { cleanGitHubCapability, normalizeRepo, type GitHubCapability, type RepoVisibility } from '../shared/github';
import {
  cloneParts, decidePush, isPlainAgentBranch, LARGE_FILE_BYTES, parseNameStatusZ, parseNumstatZ, PUSH_BUNDLE_SUFFIX, PUSH_LIMITS, pushFlags, type PushChange
} from '../shared/localGit';
import type { GitHubHeldStore } from './githubConnector';

export interface LocalGitDeps {
  /** The office's data folder (mirrors live under it, readable by members who hold the repo). */
  home: () => string | null;
  /** The app's private folder: quarantine repos and askpass files. No agent reads it. */
  privateDir: () => string | null;
  /** The GitHub token this member's grant uses, or undefined. */
  token: (agentId: string) => string | undefined;
  cap: (agentId: string) => GitHubCapability;
  /** The member's working folder. */
  memberCwd: (agentId: string) => string | undefined;
  visibility: (repo: string) => RepoVisibility | 'unknown';
  /** Ask GitHub now when the cache has nothing. */
  checkVisibility?: (repo: string) => Promise<RepoVisibility | 'unknown'>;
  held: GitHubHeldStore;
  /** The git program. */
  git?: string;
  /** Test seam: the address a repo is fetched from and pushed to. */
  upstream?: (repo: string) => string;
  log?: (line: string) => void;
}

export interface GitAnswer { ok: boolean; text: string }

interface RunResult { code: number; stdout: string; stderr: string }

const isWin = process.platform === 'win32';

export class LocalGit {
  private versionSeen: string | null | undefined;
  /** One operation per repo at a time: two pushes never race in one quarantine. */
  private chains = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: LocalGitDeps) {}

  private git(): string { return this.deps.git ?? 'git'; }
  private url(repo: string): string { return this.deps.upstream?.(repo) ?? `https://x-access-token@github.com/${repo}.git`; }

  /** Where this repo's mirror lives. */
  mirrorPath(repo: string): string | null {
    const home = this.deps.home();
    if (!home) return null;
    const [o, n] = cloneParts(repo);
    return join(home, 'git', o, `${n}.git`);
  }

  /** The folder every mirror sits in (members' shells may read only their own repos' mirrors in it). */
  mirrorRoot(): string | null {
    const home = this.deps.home();
    return home ? join(home, 'git') : null;
  }

  /** The member's working copy of a repo. */
  clonePath(agentId: string, repo: string): string | null {
    const cwd = this.deps.memberCwd(agentId);
    if (!cwd) return null;
    const [o, n] = cloneParts(repo);
    return join(cwd, 'Code', o, n);
  }

  private quarantinePath(repo: string): string | null {
    const p = this.deps.privateDir();
    if (!p) return null;
    const [o, n] = cloneParts(repo);
    return join(p, 'git-held', o, `${n}.git`);
  }

  private emptyHooks(): string {
    const p = this.deps.privateDir() ?? this.deps.home() ?? '.';
    const d = join(p, 'git-no-hooks');
    mkdirSync(d, { recursive: true });
    return d;
  }

  /** An empty file for git's global config. Not the null device: git for
   *  Windows cannot open \\.\nul as a config file ("unable to access"). Kept
   *  empty: anything written there is cleared before the next command. */
  private emptyConfig(): string {
    const p = this.deps.privateDir() ?? this.deps.home() ?? '.';
    mkdirSync(p, { recursive: true });
    const f = join(p, 'git-empty-config');
    let size = -1;
    try { const st = lstatSync(f); size = st.isFile() ? st.size : -1; } catch { /* not made yet */ }
    if (size !== 0) { rmSync(f, { recursive: true, force: true }); writeFileSync(f, '', { mode: 0o600 }); }
    return f;
  }

  /** Run git safely. Never throws; a timeout or a missing program is code -1. */
  private run(args: string[], opts: { cwd?: string; token?: string; maxBuffer?: number } = {}): Promise<RunResult> {
    const safe = [
      '-c', `core.hooksPath=${this.emptyHooks()}`,
      '-c', 'core.fsmonitor=false',
      '-c', 'diff.external=',
      '-c', 'submodule.recurse=false',
      '-c', 'credential.helper=',
      '-c', 'protocol.allow=never',
      '-c', 'protocol.https.allow=always',
      '-c', 'protocol.file.allow=always',
      '-c', 'core.symlinks=false',
      '-c', 'advice.detachedHead=false'
    ];
    const env: Record<string, string> = {
      GIT_CONFIG_GLOBAL: this.emptyConfig(),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_ATTR_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      LC_ALL: 'C'
    };
    for (const k of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
      const v = process.env[k];
      if (v) env[k] = v;
    }
    let askDir: string | null = null;
    if (opts.token) {
      const priv = this.deps.privateDir();
      if (!priv) return Promise.resolve({ code: -1, stdout: '', stderr: 'no private folder' });
      askDir = join(priv, 'git-askpass', randomBytes(8).toString('hex'));
      mkdirSync(askDir, { recursive: true, mode: 0o700 });
      const tokenFile = join(askDir, 'token');
      writeFileSync(tokenFile, opts.token, { mode: 0o600 });
      const script = join(askDir, isWin ? 'askpass.cmd' : 'askpass.sh');
      writeFileSync(script, isWin ? `@echo off\r\ntype "${tokenFile}"\r\n` : `#!/bin/sh\ncat '${tokenFile.replace(/'/g, `'\\''`)}'\n`, { mode: 0o700 });
      env.GIT_ASKPASS = script;
    }
    return new Promise((resolve) => {
      execFile(this.git(), [...safe, ...args], { cwd: opts.cwd, env, timeout: PUSH_LIMITS.timeoutMs, maxBuffer: opts.maxBuffer ?? 16 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
        if (askDir) { try { rmSync(askDir, { recursive: true, force: true }); } catch { /* swept next start */ } }
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : -1) : 0;
        resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
      });
    });
  }

  /** git's version, or null when there is no git. Asked once, then on request. */
  async version(again = false): Promise<string | null> {
    if (this.versionSeen !== undefined && !again) return this.versionSeen;
    const r = await this.run(['--version']);
    this.versionSeen = r.code === 0 ? r.stdout.trim() : null;
    return this.versionSeen;
  }

  /** Whether git was found when last asked (false before the first answer). */
  hasGit(): boolean { return !!this.versionSeen; }

  /** Serialize work on one repo. */
  private one<T>(repo: string, f: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(repo) ?? Promise.resolve();
    const next = prev.then(f, f);
    this.chains.set(repo, next.catch(() => undefined));
    return next;
  }

  private repoFor(agentId: string, value: unknown): { repo: string } | { error: string } {
    const repo = normalizeRepo(value);
    if (!repo) return { error: 'Name the repo as owner/name, for example acme/site.' };
    if (!cleanGitHubCapability(this.deps.cap(agentId)).repos.some((r) => r.repo === repo)) {
      return { error: `The owner has not given you ${repo} in your GitHub repos. Tell Michael which repo you need and why.` };
    }
    return { repo };
  }

  /** Fetch GitHub into the mirror, making it first if needed. */
  private async refreshMirror(repo: string, token: string): Promise<string | null> {
    const mirror = this.mirrorPath(repo);
    if (!mirror) return 'The office folder is not set up.';
    if (!existsSync(join(mirror, 'HEAD'))) {
      mkdirSync(mirror, { recursive: true });
      const init = await this.run(['init', '--bare', '--quiet', mirror]);
      if (init.code !== 0) return `Could not make the app's copy: ${init.stderr.trim().slice(0, 300)}`;
    }
    const f = await this.run(['-C', mirror, 'fetch', '--prune', '--no-tags', '--quiet', this.url(repo), '+refs/heads/*:refs/heads/*'], { token });
    if (f.code !== 0) return githubError(f.stderr);
    const head = await this.run(['ls-remote', '--symref', this.url(repo), 'HEAD'], { token });
    const m = /^ref: (refs\/heads\/[^\t\n]+)\tHEAD/m.exec(head.stdout);
    if (m && isPlainRefName(m[1])) await this.run(['-C', mirror, 'symbolic-ref', 'HEAD', m[1]]);
    return null;
  }

  /** git_sync: bring GitHub's latest into the app's copy, and make the member's working copy once. */
  async sync(agentId: string, body: Record<string, unknown>): Promise<GitAnswer> {
    const r = this.repoFor(agentId, body.repo);
    if ('error' in r) return { ok: false, text: r.error };
    const { repo } = r;
    if (!(await this.version())) return { ok: false, text: 'Git is not installed on this computer, so there is no local copy. Use the GitHub tools, and tell Michael the owner needs to install git.' };
    const token = this.deps.token(agentId);
    if (!token) return { ok: false, text: 'No GitHub token is saved for your connection. Tell Michael.' };
    return this.one(repo, async () => {
      const err = await this.refreshMirror(repo, token);
      if (err) return { ok: false, text: err };
      const mirror = this.mirrorPath(repo)!;
      const clone = this.clonePath(agentId, repo);
      if (!clone) return { ok: false, text: 'Your working folder is not known. Tell Michael.' };
      const cwd = this.deps.memberCwd(agentId)!;
      if (!linkFree(cwd, clone)) return { ok: false, text: linkRefusal(join(cwd, 'Code')) };
      let made = false;
      if (!pathExists(clone)) {
        mkdirSync(join(clone, '..'), { recursive: true });
        const c = await this.run(['clone', '--no-hardlinks', '--quiet', mirror, clone]);
        if (c.code !== 0) return { ok: false, text: `Could not make your working copy: ${c.stderr.trim().slice(0, 300)}` };
        made = true;
      }
      const heads = await this.run(['-C', mirror, 'for-each-ref', '--format=%(refname:short) %(objectname:short)', 'refs/heads/']);
      const list = heads.stdout.trim().split('\n').filter(Boolean).slice(0, 30).join(', ');
      return {
        ok: true,
        text: made
          ? `Your working copy of ${repo} is ready at ${clone}, with GitHub's latest. Branches: ${list}.`
          : `The app's copy of ${repo} now has GitHub's latest. In ${clone} run git pull (or git fetch). Branches: ${list}.`
      };
    });
  }

  /** git_push: take the member's bundle, check it, then push or hold it. */
  async push(agentId: string, body: Record<string, unknown>): Promise<GitAnswer> {
    const r = this.repoFor(agentId, body.repo);
    if ('error' in r) return { ok: false, text: r.error };
    const { repo } = r;
    const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
    if (!isPlainAgentBranch(branch)) return { ok: false, text: 'Push only a branch named agent/<name>, using letters, digits, dots, dashes and underscores (for example agent/blog-link).' };
    const row = cleanGitHubCapability(this.deps.cap(agentId)).repos.find((x) => x.repo === repo);
    if (row?.mode === 'pull') return { ok: false, text: `You are Pull only in ${repo}: do not change anything there. Tell Michael what you would change, and the owner will decide.` };
    if (!(await this.version())) return { ok: false, text: 'Git is not installed on this computer. Use the GitHub tools, and tell Michael the owner needs to install git.' };
    const token = this.deps.token(agentId);
    if (!token) return { ok: false, text: 'No GitHub token is saved for your connection. Tell Michael.' };
    const clone = this.clonePath(agentId, repo);
    const q = this.quarantinePath(repo);
    const mirror = this.mirrorPath(repo);
    const priv = this.deps.privateDir();
    if (!clone || !q || !mirror || !priv) return { ok: false, text: 'The office folder is not set up. Tell Michael.' };
    const [, name] = cloneParts(repo);
    const bundlePath = join(clone, '..', `${name}${PUSH_BUNDLE_SUFFIX}`);
    // Only from the member's own Code folder: no folder on the way is a link.
    const cwd = this.deps.memberCwd(agentId);
    if (!cwd || !linkFree(cwd, bundlePath)) return { ok: false, text: linkRefusal(join(cwd ?? '', 'Code')) };

    // Copy the bundle into the private folder first, never following a link:
    // what is checked is what is pushed, whatever the member does meanwhile.
    const copied = copyPlainFile(bundlePath, join(priv, 'git-held', 'incoming'), PUSH_LIMITS.bundleBytes);
    if ('error' in copied) return { ok: false, text: copied.error.replace('%BUNDLE%', bundlePath).replace('%BRANCH%', branch) };

    return this.one(repo, async () => {
      const id = randomBytes(6).toString('hex');
      const heldRef = `refs/held/${id}`;
      try {
        const err = await this.refreshMirror(repo, token);
        if (err) return { ok: false, text: err };
        if (!existsSync(join(q, 'HEAD'))) {
          mkdirSync(q, { recursive: true });
          const init = await this.run(['init', '--bare', '--quiet', q]);
          if (init.code !== 0) return { ok: false, text: 'Could not prepare the push. Try again.' };
        }
        mkdirSync(join(q, 'objects', 'info'), { recursive: true });
        writeFileSync(join(q, 'objects', 'info', 'alternates'), `${join(mirror, 'objects')}\n`);

        const v = await this.run(['-C', q, 'bundle', 'verify', '--quiet', copied.path]);
        if (v.code !== 0) return { ok: false, text: `The bundle does not fit GitHub's copy of ${repo}. Run git_sync, then git pull --rebase (or rebase on origin/HEAD), make the bundle again and push.` };
        const heads = await this.run(['-C', q, 'bundle', 'list-heads', copied.path]);
        const refs = heads.stdout.trim().split('\n').filter(Boolean).map((l) => l.split(' ')[1]);
        if (refs.length !== 1 || refs[0] !== `refs/heads/${branch}`) {
          return { ok: false, text: `The bundle must hold only your branch ${branch}. Make it with: git bundle create ../${name}${PUSH_BUNDLE_SUFFIX} ${branch} --not origin/HEAD` };
        }
        const f = await this.run(['-C', q, '-c', 'transfer.fsckObjects=true', '-c', 'fetch.fsckObjects=true', 'fetch', '--no-tags', '--quiet', copied.path, `refs/heads/${branch}:${heldRef}`]);
        if (f.code !== 0) return { ok: false, text: 'The bundle could not be read. Make it again and push.' };
        const sha = (await this.run(['-C', q, 'rev-parse', '--verify', `${heldRef}^{commit}`])).stdout.trim();
        if (!/^[0-9a-f]{40,64}$/.test(sha)) return { ok: false, text: 'The bundle could not be read. Make it again and push.' };

        // The live base: GitHub's branch now, or where it leaves the default branch.
        const lr = await this.run(['ls-remote', this.url(repo), `refs/heads/${branch}`], { token });
        if (lr.code !== 0) return { ok: false, text: githubError(lr.stderr) };
        const old = /^([0-9a-f]{40,64})\t/m.exec(lr.stdout)?.[1] ?? '';
        let base: string;
        if (old) {
          if (old === sha) return { ok: true, text: `GitHub already has ${branch} at this commit. Open the pull request with the GitHub tools if you have not yet.` };
          const anc = await this.run(['-C', q, 'merge-base', '--is-ancestor', old, sha]);
          if (anc.code !== 0) return { ok: false, text: `${branch} on GitHub has commits yours does not. Run git_sync, then git pull --rebase origin ${branch}, make the bundle again and push. Nothing is ever force pushed.` };
          base = old;
        } else {
          const head = (await this.run(['-C', mirror, 'rev-parse', '--verify', 'HEAD^{commit}'])).stdout.trim();
          const mb = (await this.run(['-C', q, 'merge-base', sha, head])).stdout.trim();
          if (!/^[0-9a-f]{40,64}$/.test(mb)) return { ok: false, text: 'Your branch does not start from this repo\'s history. Branch from origin/HEAD and try again.' };
          base = mb;
        }

        const diffArgs = ['-C', q, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', '--ignore-submodules=all'];
        const ns = await this.run([...diffArgs, '--name-status', '-z', base, sha]);
        const nums = parseNumstatZ((await this.run([...diffArgs, '--numstat', '-z', base, sha])).stdout);
        const changes: PushChange[] = parseNameStatusZ(ns.stdout).map((c) => ({ ...c, added: nums.get(c.path)?.added ?? null, deleted: nums.get(c.path)?.deleted ?? null }));
        const full = await this.run([...diffArgs, '-U3', base, sha], { maxBuffer: 64 * 1024 * 1024 });
        const diffText = full.stdout.length > PUSH_LIMITS.diffChars
          ? `${full.stdout.slice(0, PUSH_LIMITS.diffChars)}\n\n(The rest of the changes are not shown: ${full.stdout.length.toLocaleString('en-US')} characters in all.)`
          : full.stdout;
        const largeBlob = await this.hasLargeFile(q, sha, changes);
        let vis = this.deps.visibility(repo);
        if (vis === 'unknown' && this.deps.checkVisibility) vis = await this.deps.checkVisibility(repo);

        const d = decidePush(cleanGitHubCapability(this.deps.cap(agentId)), repo, changes, vis);
        if (d.kind === 'refuse') return { ok: false, text: d.reason };
        const visibility = vis as RepoVisibility;
        const log = (await this.run(['-C', q, 'log', '--format=%s', '--max-count=20', `${base}..${sha}`])).stdout.trim();
        const runId = `git-${id}`;
        if (d.kind === 'hold') {
          const input = { repo, branch, sha, base, message: log.slice(0, 2000), diff: diffText };
          const h = this.deps.held.onHold(agentId, 'git_push', input, {
            kind: 'hold', repo, branch, files: changes.map((c) => c.path), flags: pushFlags(changes, diffText, visibility, largeBlob), visibility
          }, runId);
          if (!h.run) return { ok: false, text: h.reason };
        }
        const p = await this.run(['-C', q, 'push', '--no-verify', '--porcelain', `--force-with-lease=refs/heads/${branch}:${old}`, this.url(repo), `${sha}:refs/heads/${branch}`], { token });
        if (d.kind === 'hold') this.deps.held.onEnd(runId, p.code === 0);
        if (p.code !== 0) return { ok: false, text: githubError(p.stderr || p.stdout) };
        await this.refreshMirror(repo, token);
        this.deps.log?.(`[git] pushed ${repo} ${branch} ${sha.slice(0, 12)} for ${agentId} (${changes.length} files)`);
        return { ok: true, text: `Pushed ${branch} to ${repo}: ${changes.length} file${changes.length === 1 ? '' : 's'} changed. Open the pull request with the GitHub tools, from ${branch} into the default branch.` };
      } finally {
        await this.run(['-C', q, 'update-ref', '-d', heldRef]);
        try { rmSync(copied.path, { force: true }); } catch { /* swept next start */ }
      }
    });
  }

  /** Whether a changed file is over the large size. */
  private async hasLargeFile(q: string, sha: string, changes: PushChange[]): Promise<boolean> {
    const kept = changes.filter((c) => c.status !== 'D').map((c) => c.path);
    if (kept.length === 0) return false;
    const t = await this.run(['-C', q, 'ls-tree', '-r', '-l', '-z', sha, '--', ...kept.slice(0, PUSH_LIMITS.files)], { maxBuffer: 16 * 1024 * 1024 });
    return t.stdout.split('\0').some((rec) => {
      const m = /^\S+ blob \S+\s+(\d+)\t/.exec(rec);
      return !!m && Number(m[1]) > LARGE_FILE_BYTES;
    });
  }
}

/** A ref name the mirror's HEAD may point at. */
function isPlainRefName(ref: string): boolean {
  return /^refs\/heads\/[A-Za-z0-9._/-]{1,200}$/.test(ref) && !ref.includes('..') && !ref.includes('//');
}

/**
 * Whether every folder from `root` down to `target`'s parent is a real folder
 * or not there yet, never a link: a member's shell can make links in its own
 * folder, and the app (with the owner's rights) must not follow one into
 * another member's folder (review finding, 2026-11-26). `target` itself is
 * checked by its caller (pathExists, copyPlainFile).
 */
function linkFree(root: string, target: string): boolean {
  const base = resolve(root);
  const full = resolve(target);
  const rel = relative(base, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return false;
  let at = base;
  for (const part of rel.split(sep).slice(0, -1)) {
    at = join(at, part);
    let st;
    try { st = lstatSync(at); } catch { return true; }
    if (st.isSymbolicLink() || !st.isDirectory()) return false;
  }
  return true;
}

function linkRefusal(codeDir: string): string {
  return `A folder in ${codeDir} is a link, so the app will not use it. Remove the link and call git_sync again.`;
}

/** Whether anything sits at a path, a link included. */
function pathExists(p: string): boolean {
  try { lstatSync(p); return true; } catch { return false; }
}

/** Copy a member's file into a private folder: a plain file only (no link,
 *  pipe or second name), under the size cap. Errors name %BUNDLE%. */
function copyPlainFile(src: string, dir: string, max: number): { path: string } | { error: string } {
  let st;
  try { st = lstatSync(src); } catch {
    return { error: 'No bundle found at %BUNDLE%. In your working copy run: git bundle create ../<repo>.push.bundle %BRANCH% --not origin/HEAD' };
  }
  if (!st.isFile() || st.nlink !== 1) return { error: 'The bundle at %BUNDLE% must be a plain file. Make it again with git bundle create.' };
  if (st.size > max) return { error: `The bundle is over ${Math.round(max / 1024 / 1024)} MB. Push fewer or smaller changes at a time.` };
  let fd = -1;
  try {
    fd = openSync(src, fsc.O_RDONLY | (fsc.O_NOFOLLOW ?? 0));
    const fst = fstatSync(fd);
    if (!fst.isFile() || fst.size > max || fst.ino !== st.ino) return { error: 'The bundle changed while it was read. Make it again and push.' };
    const buf = Buffer.alloc(fst.size);
    let off = 0;
    while (off < buf.length) { const n = readSync(fd, buf, off, buf.length - off, off); if (n <= 0) break; off += n; }
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const out = join(dir, `${randomBytes(8).toString('hex')}.bundle`);
    writeFileSync(out, buf.subarray(0, off), { mode: 0o600 });
    return { path: out };
  } catch {
    return { error: 'The bundle at %BUNDLE% could not be read. Make it again and push.' };
  } finally {
    if (fd >= 0) try { closeSync(fd); } catch { /* closed */ }
  }
}

/** GitHub's answer in plain words, with no token or address in it. */
function githubError(stderr: string): string {
  const s = stderr.replace(/https?:\/\/[^\s'"]+/g, '<GitHub>').trim();
  if (/Authentication failed|could not read Password|403|Permission .* denied|denied to/i.test(s)) return 'GitHub refused the app\'s token for this repo. Tell Michael: the token may need Contents read and write for it.';
  if (/not found|404|does not appear to be a git repository/i.test(s)) return 'GitHub does not show this repo to the app\'s token. Tell Michael.';
  if (/stale info|rejected|non-fast-forward|fetch first/i.test(s)) return 'GitHub has newer commits on that branch. Run git_sync, pull with rebase, make the bundle again and push.';
  if (/protected branch|GH006|ruleset|GH013/i.test(s)) return `GitHub's rules refused the push: ${s.slice(0, 300)}`;
  if (/Could not resolve host|timed out|unable to access/i.test(s)) return 'GitHub could not be reached. Try again in a minute.';
  return `Git could not finish: ${s.slice(0, 300) || 'no details'}`;
}

/** Test seam. */
export const _test = { copyPlainFile, githubError, isPlainRefName, linkFree };
