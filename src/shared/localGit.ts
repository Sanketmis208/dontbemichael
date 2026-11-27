/**
 * Local git for members with GitHub repos (docs/designs/github-local-git.md).
 *
 * Pure rules: which branch names a push may use, what a push's changed files
 * flag, whether a push goes out, waits for the owner or is refused, and the
 * job text that tells a member how to work. The main process (src/main/localGit.ts)
 * runs git; nothing here touches the disk.
 */

import {
  AGENT_BRANCH_PREFIX, touchesGitHubFolder, type GitHubCapability, type GitHubFlag, type RepoVisibility
} from './github';
import { patternHits } from './dataClasses';


/** The bundle a member writes before git_push, next to its clone. */
export const PUSH_BUNDLE_SUFFIX = '.push.bundle';

/** Limits on one push (adversarial review, finding 9). */
export const PUSH_LIMITS = {
  bundleBytes: 50 * 1024 * 1024,
  files: 500,
  /** Diff text kept for the owner's card. */
  diffChars: 200_000,
  /** One git command. */
  timeoutMs: 120_000
};

/** A file over this is flagged large on the owner's card. */
export const LARGE_FILE_BYTES = 1024 * 1024;

/**
 * A branch a push may use: `agent/` then plain path parts of letters, digits,
 * dot, dash and underscore. No `..`, no `@{`, no wildcards, no control bytes,
 * no part starting with a dot or ending in `.lock`, nothing git's
 * check-ref-format would refuse (finding 10).
 */
export function isPlainAgentBranch(branch: unknown): branch is string {
  if (typeof branch !== 'string' || branch.length > 200) return false;
  if (!branch.startsWith(AGENT_BRANCH_PREFIX)) return false;
  const parts = branch.slice(AGENT_BRANCH_PREFIX.length).split('/');
  if (parts.length === 0) return false;
  return parts.every((p) => /^[A-Za-z0-9._-]+$/.test(p) && !p.startsWith('.') && !p.endsWith('.') && !p.endsWith('.lock') && !p.includes('..'));
}

/** One changed file, from git's --name-status and --numstat. */
export interface PushChange {
  /** A, M, D, T (renames come in as D plus A with --no-renames). */
  status: string;
  path: string;
  /** Lines added and deleted; null for a binary file. */
  added: number | null;
  deleted: number | null;
}

/** `git diff --no-renames --name-status -z` output to [status, path] pairs. */
export function parseNameStatusZ(out: string): Array<{ status: string; path: string }> {
  const parts = out.split('\0').filter((s) => s !== '');
  const rows: Array<{ status: string; path: string }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) rows.push({ status: parts[i].trim().charAt(0), path: parts[i + 1] });
  return rows;
}

/** `git diff --no-renames --numstat -z` output to per path counts. */
export function parseNumstatZ(out: string): Map<string, { added: number | null; deleted: number | null }> {
  const m = new Map<string, { added: number | null; deleted: number | null }>();
  for (const rec of out.split('\0')) {
    const t = /^(-|\d+)\t(-|\d+)\t(.+)$/s.exec(rec);
    if (!t) continue;
    m.set(t[3], { added: t[1] === '-' ? null : Number(t[1]), deleted: t[2] === '-' ? null : Number(t[2]) });
  }
  return m;
}

/** Flags the owner's card shows, from the push's real changes. */
export function pushFlags(changes: PushChange[], diffText: string, visibility: RepoVisibility, largeBlob: boolean): GitHubFlag[] {
  const f = new Set<GitHubFlag>();
  for (const c of changes) {
    if (touchesGitHubFolder(c.path)) f.add('workflow');
    if (/(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519|ecdsa)$/i.test(c.path)) f.add('envfile');
    if (c.status === 'D') f.add('delete');
  }
  // Only the added lines: removing a secret is not adding one.
  const added = diffText.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  if (patternHits(added).some((h) => h.classId === 'secrets')) f.add('secret');
  if (largeBlob) f.add('large');
  if (visibility === 'public') f.add('public');
  return [...f];
}

export type PushDecision =
  | { kind: 'refuse'; reason: string }
  | { kind: 'allow' }
  | { kind: 'hold' };

/**
 * Whether a checked push goes out. The same modes as GitHub's own write tools
 * (github.ts githubAccess): Pull only refuses, Push on approval holds, and a
 * change under .github/ waits for the owner in every mode.
 */
export function decidePush(cap: GitHubCapability, repo: string, changes: PushChange[], visibility: RepoVisibility | 'unknown'): PushDecision {
  const row = cap.repos.find((r) => r.repo === repo);
  if (!row) return { kind: 'refuse', reason: `The owner has not given you ${repo} in your GitHub repos. Tell Michael which repo you need and why.` };
  if (row.mode === 'pull') return { kind: 'refuse', reason: `You are Pull only in ${repo}: do not change anything there. Tell Michael what you would change, and the owner will decide.` };
  if (visibility === 'unknown') return { kind: 'refuse', reason: 'Checking the repo; try again in a minute.' };
  if (row.seen === 'private' && visibility === 'public') {
    return { kind: 'refuse', reason: `${repo} is now public. The owner must confirm it again in your GitHub repos before you push there. Tell Michael.` };
  }
  if (changes.length === 0) return { kind: 'refuse', reason: 'Your branch has no changes against GitHub. Commit your work first.' };
  if (changes.length > PUSH_LIMITS.files) return { kind: 'refuse', reason: `That push changes ${changes.length} files; push at most ${PUSH_LIMITS.files} at a time.` };
  if (row.mode === 'approval' || changes.some((c) => touchesGitHubFolder(c.path))) return { kind: 'hold' };
  return { kind: 'allow' };
}

/** The repo's folder name parts under a member's Code folder. */
export function cloneParts(repo: string): [string, string] {
  const [owner, name] = repo.split('/');
  return [owner, name];
}

/** The member's GitHub note, local git part: how to work in the clone. */
export function localGitContext(repos: string[], codeDir: string): string | null {
  if (repos.length === 0) return null;
  const sep = codeDir.includes('\\') ? '\\' : '/';
  const rows = repos.map((r) => `- ${r}: ${codeDir}${sep}${r.replace('/', sep)}`).join('\n');
  return [
    'LOCAL GIT. Each of your repos also has a working copy on this computer, for any size of change and for running tests:',
    rows,
    `Call git_sync first (it makes the copy, and later brings GitHub's latest), then run git pull in the copy. Make a branch that starts with ${AGENT_BRANCH_PREFIX}, edit with your file tools, commit, and run the tests.`,
    `To push: in the copy run git bundle create ../<repo>${PUSH_BUNDLE_SUFFIX} <branch> --not origin/HEAD (with your repo's folder name and your branch), then call git_push with the repo and the branch. The app checks it and sends it to GitHub, or holds it for the owner. Then open the pull request with the GitHub tools as before. Your shell has no internet: git fetch and pull reach only the app's copy, and git push to GitHub does not work from the shell.`
  ].join('\n');
}
