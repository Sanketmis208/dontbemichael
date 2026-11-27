/**
 * GitHub through the owner's Claude connector, with per member modes
 * (docs/designs/github-connector-modes.md, owner D1 and D8, 2026-11-21).
 *
 * A member holds GitHub through the ordinary connector grant
 * (agentCapabilities[id].connectors) and the Settings switch; its repo rows
 * (agentCapabilities[id].github) narrow it. Each row has a mode:
 *
 *   pull      reads only
 *   push      reads, writes to agent/ branches, opens a pull request
 *   approval  reads; every write waits for the owner's card, then runs once
 *
 * Any write touching .github/ waits for the owner in both write modes (eng D2).
 * Merges, other branches, other repos and every tool not named here are
 * refused in every mode, so a tool GitHub adds later is refused until it is
 * added (the QuickBooks pattern).
 *
 * Pure: no fs, no electron, no node crypto. The hook, the store and the tests
 * share it.
 */

import { patternHits } from './dataClasses';

/** GitHub's official remote connector. Only a connector at this address gets
 *  the GitHub rules (outside voice O6); a connector named like GitHub at any
 *  other address is refused. */
export const GITHUB_CONNECTOR_URL = 'https://api.githubcopilot.com/mcp';

/** The toolsets the app asks GitHub's connector for: its defaults plus
 *  actions, so members can read workflow runs, jobs and logs (owner,
 *  2026-11-26). Sent as the X-MCP-Toolsets header on every request. */
export const GITHUB_MCP_TOOLSETS = 'context,repos,issues,pull_requests,users,actions';

/** Job logs come back as their last lines only, so one call stays small
 *  enough to read in place (owner, 2026-11-26: a 500 line log ran to 82,000
 *  characters). A member who needs more asks again with a bigger tail_lines,
 *  up to the cap. */
export const JOB_LOG_TAIL_LINES = 150;
export const JOB_LOG_MAX_TAIL_LINES = 5000;

/** An MCP request body with every get_job_logs call given a tail_lines: the
 *  default when it names none or a bad one, the cap when it asks for more.
 *  Null when nothing changed (not JSON, no such call, or already in range). */
export function withJobLogTail(body: string): string | null {
  let msg: unknown;
  try { msg = JSON.parse(body); } catch { return null; }
  let changed = false;
  for (const m of Array.isArray(msg) ? msg : [msg]) {
    const call = m as { method?: unknown; params?: { name?: unknown; arguments?: unknown } } | null;
    if (!call || typeof call !== 'object' || call.method !== 'tools/call' || call.params?.name !== 'get_job_logs') continue;
    const args = call.params.arguments && typeof call.params.arguments === 'object' && !Array.isArray(call.params.arguments)
      ? call.params.arguments as Record<string, unknown> : {};
    const asked = args.tail_lines;
    const n = typeof asked === 'number' && Number.isInteger(asked) && asked > 0
      ? Math.min(asked, JOB_LOG_MAX_TAIL_LINES) : JOB_LOG_TAIL_LINES;
    if (n !== asked) { args.tail_lines = n; call.params.arguments = args; changed = true; }
  }
  return changed ? JSON.stringify(msg) : null;
}

/** A connector's address is GitHub's own. */
export function isGitHubConnectorUrl(url: string | undefined): boolean {
  if (typeof url !== 'string') return false;
  const u = url.trim().toLowerCase().replace(/\/+$/, '');
  return u === GITHUB_CONNECTOR_URL || u.startsWith(`${GITHUB_CONNECTOR_URL}/`);
}

/** A connector key that reads as GitHub, whatever its address. */
export function namesGitHub(key: string): boolean {
  return /github/i.test(key);
}

export type GitHubMode = 'pull' | 'push' | 'approval';
export const GITHUB_MODES: readonly GitHubMode[] = ['pull', 'push', 'approval'];

export type RepoVisibility = 'public' | 'private';

/** One repo a member may use. `seen` is the visibility the owner saw when the
 *  row was added or last confirmed; a private repo that turns public refuses
 *  writes until the owner confirms the row again. */
export interface GitHubRepoRow {
  repo: string;
  mode: GitHubMode;
  seen?: RepoVisibility;
}

export interface GitHubCapability {
  repos: GitHubRepoRow[];
}

/** The branch prefix agents write to. */
export const AGENT_BRANCH_PREFIX = 'agent/';

/** At most this many repos per member. */
export const MAX_REPOS = 50;

/** "owner/repo", trimmed and lowercased, or null when it isn't one. */
export function normalizeRepo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const m = /^([a-z0-9](?:[a-z0-9-]{0,38}))\/([a-z0-9._-]{1,100})$/.exec(v);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return `${m[1]}/${m[2]}`;
}

/** A repo the owner's GitHub token can reach, as the picker shows it. */
export interface ListedRepo { repo: string; visibility: 'public' | 'private' }

/** GitHub's /user/repos pages, cleaned into picker rows: normalized names, no
 *  duplicates, sorted. Anything malformed is skipped. */
export function reposFromListing(pages: unknown[]): ListedRepo[] {
  const out = new Map<string, ListedRepo>();
  for (const page of pages) {
    if (!Array.isArray(page)) continue;
    for (const item of page) {
      const o = item && typeof item === 'object' ? item as { full_name?: unknown; private?: unknown } : null;
      const repo = normalizeRepo(o?.full_name);
      if (!repo || out.has(repo)) continue;
      out.set(repo, { repo, visibility: o?.private === false ? 'public' : 'private' });
    }
  }
  return [...out.values()].sort((a, b) => a.repo.localeCompare(b.repo));
}

/** A saved capability, cleaned: valid rows only, no duplicates, capped. */
export function cleanGitHubCapability(value: unknown): GitHubCapability {
  const rows: GitHubRepoRow[] = [];
  const seen = new Set<string>();
  const list = value && typeof value === 'object' && Array.isArray((value as { repos?: unknown }).repos) ? (value as { repos: unknown[] }).repos : [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = r as { repo?: unknown; mode?: unknown; seen?: unknown };
    const repo = normalizeRepo(o.repo);
    if (!repo || seen.has(repo)) continue;
    const mode = GITHUB_MODES.includes(o.mode as GitHubMode) ? (o.mode as GitHubMode) : 'pull';
    const row: GitHubRepoRow = { repo, mode };
    if (o.seen === 'public' || o.seen === 'private') row.seen = o.seen;
    rows.push(row);
    seen.add(repo);
    if (rows.length >= MAX_REPOS) break;
  }
  return { repos: rows };
}

/** What adding a typed repo does: its row, or why not. A public repo starts
 *  in Push on approval (CEO D1). */
export function addRepoRow(cap: GitHubCapability, typed: string, visibility: RepoVisibility | 'unknown'): { ok: true; cap: GitHubCapability } | { ok: false; error: 'invalid' | 'duplicate' | 'full' } {
  const repo = normalizeRepo(typed);
  if (!repo) return { ok: false, error: 'invalid' };
  if (cap.repos.some((r) => r.repo === repo)) return { ok: false, error: 'duplicate' };
  if (cap.repos.length >= MAX_REPOS) return { ok: false, error: 'full' };
  const row: GitHubRepoRow = { repo, mode: visibility === 'public' ? 'approval' : 'pull' };
  if (visibility !== 'unknown') row.seen = visibility;
  return { ok: true, cap: { repos: [...cap.repos, row] } };
}

// ---------------------------------------------------------------------------
// The connector's tools (GitHub MCP server, README on main, 2026-11-22; live
// catalog still to be recorded, plan task T0). Unknown names are refused.

/** Tools that only read one repo, named by owner and repo. */
const READ_TOOLS = new Set([
  'get_file_contents', 'get_commit', 'list_branches', 'list_commits', 'list_tags', 'get_tag',
  'list_releases', 'get_latest_release', 'get_release_by_tag', 'get_repository_tree',
  'list_pull_requests', 'pull_request_read', 'issue_read', 'list_issues', 'get_label',
  // Actions, read only: workflows, runs, jobs, artifacts and job logs. Running,
  // rerunning, cancelling and deleting logs (actions_run_trigger) stay the owner's.
  'actions_list', 'actions_get', 'get_job_logs'
]);

/** Searches: the query must name exactly one listed repo (outside voice O7). */
const SEARCH_TOOLS = new Set(['search_code', 'search_commits']);

/** Writes to a branch: the branch must start with agent/. */
const BRANCH_WRITE_TOOLS = new Set(['create_branch', 'create_or_update_file', 'push_files', 'delete_file']);

/** Opening a pull request: head must be an agent/ branch. */
const PR_TOOL = 'create_pull_request';

export type GitHubToolClass = 'read' | 'search' | 'write' | 'pr' | 'other';

/** The tool's own name after the connector prefix ("mcp__claude_ai_GitHub__push_files" -> "push_files"). */
export function githubToolName(toolName: string): string {
  return /^mcp__.+?__(.+)$/.exec(toolName ?? '')?.[1] ?? '';
}

export function githubToolClass(tool: string): GitHubToolClass {
  if (READ_TOOLS.has(tool)) return 'read';
  if (SEARCH_TOOLS.has(tool)) return 'search';
  if (BRANCH_WRITE_TOOLS.has(tool)) return 'write';
  if (tool === PR_TOOL) return 'pr';
  return 'other';
}

/** Whether a call writes (so it needs a fresh visibility, and can be held). */
export function isGitHubWrite(tool: string): boolean {
  const c = githubToolClass(tool);
  return c === 'write' || c === 'pr';
}

// ---------------------------------------------------------------------------
// Reading a call's input.

function str(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === 'string' ? v : undefined;
}

/** A repo path, normalized: no leading ./ or /, forward slashes. Null when it
 *  climbs out (..) or is empty. */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== 'string') return null;
  const parts = p.replace(/\\/g, '/').split('/').filter((s) => s !== '' && s !== '.');
  if (parts.length === 0 || parts.some((s) => s === '..')) return null;
  return parts.join('/');
}

/** A path under .github/ (workflows, actions, dependabot), any case. */
export function touchesGitHubFolder(path: string): boolean {
  return /^\.github(\/|$)/i.test(path);
}

/** The branch a PR head names, without an "owner:" prefix. */
function headBranch(head: string): string {
  const i = head.indexOf(':');
  return i >= 0 ? head.slice(i + 1) : head;
}

export function isAgentBranch(branch: string | undefined): boolean {
  if (typeof branch !== 'string') return false;
  const b = branch.trim();
  return b.startsWith(AGENT_BRANCH_PREFIX) && b.length > AGENT_BRANCH_PREFIX.length && !b.includes('..');
}

/** A search query names exactly one repo with repo:, no org:/user: and no
 *  OR/NOT. Returns that repo or null. */
export function searchQueryRepo(query: unknown): string | null {
  if (typeof query !== 'string') return null;
  if (/\b(OR|NOT)\b/.test(query) || /(^|\s)-?(org|user):/i.test(query)) return null;
  const repos = [...query.matchAll(/(^|\s)-?repo:("?)([^\s"]+)\2/gi)];
  if (repos.length !== 1 || repos[0][0].trim().startsWith('-')) return null;
  return normalizeRepo(repos[0][3]);
}

/** The repo a call names, normalized, or null. */
export function callRepo(tool: string, input: Record<string, unknown>): string | null {
  if (githubToolClass(tool) === 'search') return searchQueryRepo(input.query);
  const owner = str(input, 'owner');
  const repo = str(input, 'repo');
  if (!owner || !repo) return null;
  return normalizeRepo(`${owner.trim()}/${repo.trim()}`);
}

/** The files a write touches, normalized, or null when one is missing or bad. */
export function callFiles(tool: string, input: Record<string, unknown>): string[] | null {
  if (tool === 'create_branch' || tool === PR_TOOL) return [];
  if (tool === 'push_files') {
    const files = input.files;
    if (!Array.isArray(files) || files.length === 0) return null;
    const out: string[] = [];
    for (const f of files) {
      const p = f && typeof f === 'object' ? cleanPath((f as { path?: unknown }).path) : null;
      if (!p) return null;
      out.push(p);
    }
    return out;
  }
  const p = cleanPath(input.path);
  return p ? [p] : null;
}

/** The branch a write lands on, or null when it is missing. */
export function callBranch(tool: string, input: Record<string, unknown>): string | null {
  if (tool === PR_TOOL) { const h = str(input, 'head'); return h ? headBranch(h.trim()) : null; }
  const b = str(input, 'branch');
  return b ? b.trim() : null;
}

// ---------------------------------------------------------------------------
// Warnings the card shows, worked out from the call itself, never the agent's
// words (CEO Section 3; design UI-D7).

export type GitHubFlag = 'workflow' | 'secret' | 'envfile' | 'large' | 'delete' | 'public' | 'flipped';

const LARGE_BYTES = 1024 * 1024;

export function callFlags(tool: string, input: Record<string, unknown>, files: string[], visibility: RepoVisibility, flipped: boolean): GitHubFlag[] {
  const flags = new Set<GitHubFlag>();
  if (files.some(touchesGitHubFolder)) flags.add('workflow');
  if (files.some((f) => /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx)$|(^|\/)id_(rsa|ed25519|ecdsa)$/i.test(f))) flags.add('envfile');
  if (tool === 'delete_file') flags.add('delete');
  const contents: string[] = [];
  if (tool === 'push_files' && Array.isArray(input.files)) for (const f of input.files) { const c = f && typeof f === 'object' ? (f as { content?: unknown }).content : undefined; if (typeof c === 'string') contents.push(c); }
  const one = str(input, 'content'); if (one) contents.push(one);
  for (const k of ['body', 'title', 'message']) { const v = str(input, k); if (v) contents.push(v); }
  if (contents.some((c) => patternHits(c).some((h) => h.classId === 'secrets'))) flags.add('secret');
  if (contents.reduce((n, c) => n + c.length, 0) > LARGE_BYTES) flags.add('large');
  if (visibility === 'public') flags.add('public');
  if (flipped) flags.add('flipped');
  return [...flags];
}

// ---------------------------------------------------------------------------
// The rule.

export type GitHubDecision =
  | { kind: 'allow' }
  | { kind: 'refuse'; reason: string }
  | { kind: 'hold'; repo: string; branch: string; files: string[]; flags: GitHubFlag[]; visibility: RepoVisibility };

/** What the app knows about a repo's visibility right now (the hook reads a
 *  cache only; outside voice O3). */
export type VisibilityNow = RepoVisibility | 'unknown';

export interface GitHubCallContext {
  /** The member's rows (already cleaned). */
  cap: GitHubCapability;
  /** The connector's recorded address. */
  connectorUrl: string | undefined;
  toolName: string;
  input: unknown;
  /** The hook frame dropped long fields (outside voice O1). */
  trimmed: boolean;
  visibility(repo: string): VisibilityNow;
}

const TELL = 'Do not try another way; tell Michael what you need.';

const refuse = (reason: string): GitHubDecision => ({ kind: 'refuse', reason });

/**
 * The decision for one GitHub connector call. A hold means: refuse the call
 * now and put it on the owner's card; once approved it may run once
 * (githubProposals in main).
 */
export function githubAccess(ctx: GitHubCallContext): GitHubDecision {
  if (!isGitHubConnectorUrl(ctx.connectorUrl)) {
    return refuse(`Only GitHub's own connector is allowed for GitHub. ${TELL}`);
  }
  const tool = githubToolName(ctx.toolName);
  const cls = githubToolClass(tool);
  if (cls === 'other') {
    return refuse(`That GitHub action is not allowed for the team (merges, issues, comments, gists, forks, running Actions and settings are the owner's). ${TELL}`);
  }
  const input = ctx.input && typeof ctx.input === 'object' ? (ctx.input as Record<string, unknown>) : {};
  const repo = callRepo(tool, input);
  if (!repo) {
    return refuse(cls === 'search'
      ? 'Name exactly one repo you were given with repo:owner/name in the search, with no OR, NOT, org: or user:.'
      : 'Name the repo with owner and repo.');
  }
  const row = ctx.cap.repos.find((r) => r.repo === repo);
  if (!row) {
    return refuse(`The owner has not given you ${repo} in your GitHub repos. ${TELL}`);
  }
  if (cls === 'read' || cls === 'search') return { kind: 'allow' };

  // A write from here on.
  if (row.mode === 'pull') {
    return refuse(`You are Pull only in ${repo}: do not change anything there. Tell Michael what you would change, and the owner will decide.`);
  }
  if (ctx.trimmed) {
    return refuse('Too large for one call. Push fewer or smaller files at a time.');
  }
  const branch = callBranch(tool, input);
  if (!branch) return refuse('Name the branch: write only to a branch that starts with agent/.');
  if (!isAgentBranch(branch)) {
    return refuse(`Write only to a branch that starts with ${AGENT_BRANCH_PREFIX} (for example agent/blog-pricing). The owner merges into main.`);
  }
  if (tool === 'create_branch') {
    const from = str(input, 'from_branch');
    if (from !== undefined && from.includes('..')) return refuse('That branch name is not allowed.');
  }
  const files = callFiles(tool, input);
  if (!files) return refuse('Name every file by its path in the repo.');
  const vis = ctx.visibility(repo);
  if (vis === 'unknown') return refuse('Checking the repo; try again in a minute.');
  const flipped = row.seen === 'private' && vis === 'public';
  if (flipped) {
    return refuse(`${repo} is now public. The owner must confirm it again in your GitHub repos before you write there. ${TELL}`);
  }
  const workflow = files.some(touchesGitHubFolder);
  if (row.mode === 'approval' || workflow) {
    return { kind: 'hold', repo, branch, files, flags: callFlags(tool, input, files, vis, false), visibility: vis };
  }
  return { kind: 'allow' };
}

// ---------------------------------------------------------------------------
// Held writes (Push on approval). The store lives in main; the moves are here.
//
//   waiting --approve--> approved --Pre(hash)--> inflight --Post ok--> used
//      |                    ^                       |
//      |                    +---- Post error, ------+
//      |                         failure, session end
//      +--decline--> declined     +--changes--> changes
//   waiting/approved --24 h--> expired
//
// A slow call is never released on a timer (eng V5): inflight leaves only on
// its Post, its failure, its session ending, or the expiry.

export type HeldState = 'waiting' | 'approved' | 'inflight' | 'used' | 'declined' | 'changes' | 'expired';

export interface HeldWrite {
  id: string;
  agentId: string;
  /** The tool's own name (push_files). */
  tool: string;
  /** SHA-256 of the tool name and the canonical input (main computes it). */
  hash: string;
  repo: string;
  branch: string;
  files: string[];
  flags: GitHubFlag[];
  visibility: RepoVisibility;
  /** The agent's own words (message, title or body), shown labelled as theirs. */
  says: string;
  /** The call's input, for "Show the changes". */
  input: Record<string, unknown>;
  state: HeldState;
  created: number;
  decided?: number;
  /** The tool_use_id of the call running it now. */
  toolUseId?: string;
  note?: string;
}

export const HELD_TTL_MS = 24 * 60 * 60 * 1000;

/** Canonical JSON: keys sorted at every level, so the same call hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** The text hashed for one call. */
export function callFingerprint(tool: string, input: unknown): string {
  return `${tool}\n${canonicalJson(input)}`;
}

/** The agent's own words for the card: the commit message, the PR title and body. */
export function callSays(input: Record<string, unknown>): string {
  const parts = ['message', 'title', 'body'].map((k) => str(input, k)?.trim()).filter((s): s is string => !!s);
  return parts.join('\n\n').slice(0, 2000);
}

/** Expire waiting and approved writes older than the TTL. Returns the ids moved. */
export function expireHeld(list: HeldWrite[], now: number): string[] {
  const out: string[] = [];
  for (const h of list) {
    if ((h.state === 'waiting' || h.state === 'approved') && now - h.created > HELD_TTL_MS) { h.state = 'expired'; h.decided = now; out.push(h.id); }
  }
  return out;
}

/** What the hook does with a write the rule held: run an approved one once,
 *  refuse one already running, or file (or reuse) a waiting card. */
export type HeldMatch =
  | { kind: 'run'; held: HeldWrite }
  | { kind: 'running' }
  | { kind: 'waiting'; held: HeldWrite }
  | { kind: 'new' };

export function matchHeld(list: HeldWrite[], agentId: string, hash: string): HeldMatch {
  const mine = list.filter((h) => h.agentId === agentId && h.hash === hash);
  const approved = mine.find((h) => h.state === 'approved');
  if (approved) return { kind: 'run', held: approved };
  if (mine.some((h) => h.state === 'inflight')) return { kind: 'running' };
  const waiting = mine.find((h) => h.state === 'waiting');
  if (waiting) return { kind: 'waiting', held: waiting };
  return { kind: 'new' };
}

/** A call ended: used on success, back to approved on an error or failure. */
export function endHeld(list: HeldWrite[], toolUseId: string, ok: boolean, now: number): HeldWrite | null {
  const h = list.find((x) => x.state === 'inflight' && x.toolUseId === toolUseId);
  if (!h) return null;
  h.state = ok ? 'used' : 'approved';
  h.decided = now;
  if (!ok) delete h.toolUseId;
  return h;
}

/** The member's session ended: a running write goes back to approved. */
export function releaseAgent(list: HeldWrite[], agentId: string): number {
  let n = 0;
  for (const h of list) if (h.agentId === agentId && h.state === 'inflight') { h.state = 'approved'; delete h.toolUseId; n++; }
  return n;
}

/** Keep the store small: finished writes older than a week go. */
export function pruneHeld(list: HeldWrite[], now: number): HeldWrite[] {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  return list.filter((h) => !(['used', 'declined', 'changes', 'expired'].includes(h.state) && now - (h.decided ?? h.created) > WEEK));
}


// ---------------------------------------------------------------------------
// What a member is told (owner D6, 2026-11-21): delivered at the start of each
// session and again when the owner changes the rows.

const MODE_WORDS: Record<GitHubMode, string> = {
  pull: 'Pull only: read it, change nothing',
  push: 'Pull and push: write to agent/ branches and open a pull request',
  approval: 'Push on approval: every write waits for the owner, then you run the same call again once'
};

/** The GitHub rules for a member with repos, or null with none. With
 *  `localGit`, the member also has working copies (localGitContext follows),
 *  so git in the shell is allowed there and only there. */
export function githubContext(cap: GitHubCapability, localGit = false): string | null {
  if (cap.repos.length === 0) return null;
  const rows = cap.repos.map((r) => `- ${r.repo}: ${MODE_WORDS[r.mode]}.`).join('\n');
  return [
    localGit
      ? 'GITHUB. You work on code through the GitHub tools and through your working copies on this computer (LOCAL GIT below). Your shell reaches no website: git in it works only in those copies, and only git_push sends to GitHub. Your repos:'
      : 'GITHUB. You work on code through the GitHub tools, never git or the internet from your shell (your shell reaches no website). Your repos:',
    rows,
    `${localGit ? 'Read and edit files with the GitHub tools or in your working copy' : 'Read and edit files with the GitHub tools'}; build and test what you can in your own folder. To see how a change did in CI, read its Actions runs, jobs and job logs (a job log comes back as its last ${JOB_LOG_TAIL_LINES} lines; if the cause is not there, ask again with a bigger tail_lines, up to ${JOB_LOG_MAX_TAIL_LINES}); starting, rerunning or cancelling a run is the owner's. Write only to a branch that starts with agent/ (for example agent/blog-pricing), never main, and never merge. When the change is ready, open a pull request with a plain summary of what changed and why, and tell Michael its link so the owner can check the preview and merge. Merging is the owner's, and it puts the change live.`,
    'Any change under .github/ waits for the owner. A write held for approval is refused with a note; when you are told it was approved, run the same call again, exactly as before. If a repo you need is not listed, tell Michael which one and why.'
  ].join('\n');
}
