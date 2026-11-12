import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { unlinkWorktreeDeps } from './worktreeDeps';

/** Run git in `cwd` with `args`. Returns stdout text or an error. Exported
 *  for its UTF-8 test (test/git-utf8-output.test.cjs). */
export function runGit(cwd: string, args: string[], timeoutMs = 8000): Promise<{
  ok: true; stdout: string;
} | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd });
    // Decoded once at the end, not per chunk: a pipe chunk (64 KB) can end in
    // the middle of a multi-byte character, and decoding the halves apart
    // turns it into U+FFFD. A Hindi or Chinese file name in a large status
    // then names a file that doesn't exist, and an unchanged file shows a
    // changed line in its diff.
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
    }, timeoutMs);
    proc.stdout.on('data', (d: Buffer) => { out.push(d); });
    proc.stderr.on('data', (d: Buffer) => { err.push(d); });
    proc.on('error', e => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, stdout: Buffer.concat(out).toString('utf8') });
      else resolve({ ok: false, error: Buffer.concat(err).toString('utf8').trim() || `git exited ${code}` });
    });
  });
}

export interface GitBranchInfo {
  current: string | null;
  detached: boolean;
}
export async function getBranch(cwd: string): Promise<GitBranchInfo | { error: string }> {
  const head = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!head.ok) return { error: head.error };
  const name = head.stdout.trim();
  if (name === 'HEAD') return { current: null, detached: true };
  return { current: name, detached: false };
}

/** Best-effort detect: is `cwd` actually a git repo? */
export async function isRepo(cwd: string): Promise<boolean> {
  const res = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  return res.ok && res.stdout.trim() === 'true';
}

/** Derive a safe `agent/<id>` branch name from a worktree path's basename. */
function agentBranchFor(wtPath: string): string {
  const base = wtPath.split(/[\\/]/).filter(Boolean).pop() ?? 'agent';
  const slug = base.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent';
  return `agent/${slug}`;
}

/** Provision an isolated git worktree for an agent at `wtPath`, branching off
 *  `baseBranch`. Tries to create a fresh `agent/<id>` branch first; if that
 *  branch already exists, falls back to checking out `baseBranch` directly. */
export async function addWorktree(
  cwd: string, wtPath: string, baseBranch: string
): Promise<{ ok: boolean; error?: string }> {
  const branch = agentBranchFor(wtPath);
  const fresh = await runGit(cwd, ['worktree', 'add', wtPath, '-b', branch, baseBranch]);
  if (fresh.ok) return { ok: true };
  // Branch likely already exists (or the path is taken) — retry without -b.
  const fallback = await runGit(cwd, ['worktree', 'add', wtPath, baseBranch]);
  if (fallback.ok) return { ok: true };
  return { ok: false, error: fallback.error };
}

/** Best-effort removal of an agent's worktree. Forced so a dirty tree doesn't
 *  block teardown; failures are surfaced but callers may ignore them. */
export async function removeWorktree(
  cwd: string, wtPath: string
): Promise<{ ok: boolean; error?: string }> {
  let target = resolve(cwd, wtPath);
  const normalize = (path: string): string => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  // Verify registration and lock status before changing dependencies.
  // NUL-delimited records keep spaces, Unicode and quoted paths intact.
  const zListing = await runGit(cwd, ['worktree', 'list', '--porcelain', '-z']);
  // `-z` on `worktree list` arrived in Git 2.36, and older Git rejects the whole
  // command (Ubuntu 22.04 LTS still ships 2.34), so teardown failed here before
  // any check below could run. Fall back to the newline form, which carries
  // the older limitation that a path containing a newline cannot be
  // represented.
  const listing = zListing.ok
    ? zListing
    : await runGit(cwd, ['worktree', 'list', '--porcelain']);
  if (!listing.ok) return { ok: false, error: listing.error };
  const [recordSep, fieldSep] = zListing.ok ? ['\0\0', '\0'] : ['\n\n', '\n'];
  const records = listing.stdout.split(recordSep).map((record) => record.split(fieldSep));
  let index = records.findIndex((fields) => fields[0]?.startsWith('worktree ')
    && normalize(fields[0].slice(9)) === normalize(target));
  if (index < 0) {
    // Git canonicalizes aliased parents, including macOS /var and Windows 8.3
    // names. Compare filesystem identities when their spellings differ.
    try {
      const canonicalTarget = normalize(await realpath(target));
      const canonicalPaths = await Promise.all(records.map(async (fields) => {
        if (!fields[0]?.startsWith('worktree ')) return null;
        try { return normalize(await realpath(fields[0].slice(9))); }
        catch (error) {
          const code = error instanceof Error && 'code' in error ? error.code : undefined;
          if (code === 'ENOENT') return null; // another registered checkout may be missing
          throw error;
        }
      }));
      index = canonicalPaths.findIndex((path) => path === canonicalTarget);
    } catch (error) { return { ok: false, error: String(error) }; }
  }
  if (index <= 0) return { ok: false, error: 'path is not a registered secondary worktree' };
  if (records[index].some((field) => field === 'locked' || field.startsWith('locked '))) {
    return { ok: false, error: 'worktree is locked' };
  }
  target = records[index][0].slice(9);
  // Git for Windows traverses dependency junctions during forced removal.
  // Detach the app-created link first; refuse foreign/dangling links rather
  // than let recursive removal reach a directory outside this worktree.
  const deps = await unlinkWorktreeDeps(resolve(cwd), target);
  if (!deps.ok) return { ok: false, error: deps.error };
  try {
    if ((await lstat(join(target, 'node_modules'))).isSymbolicLink()) {
      return { ok: false, error: 'worktree dependencies link to an unverified directory' };
    }
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'ENOENT') return { ok: false, error: String(error) };
  }
  const res = await runGit(cwd, ['worktree', 'remove', '--force', target]);
  if (res.ok) return { ok: true };
  return { ok: false, error: res.error };
}

