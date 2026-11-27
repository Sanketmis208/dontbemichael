/**
 * The main process side of GitHub with per member modes
 * (docs/designs/github-connector-modes.md): the repo visibility cache the
 * hook reads, and the held writes the owner decides on Ask me. The rules are
 * in shared/github.ts.
 *
 * Visibility comes from GitHub's public API with no token: 200 is public,
 * 404 is private or missing. The hook never waits on the network (outside
 * voice O3): it reads this cache, and a missing or stale entry refuses writes
 * while a refresh runs.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import {
  callFingerprint,
  callSays,
  endHeld,
  expireHeld,
  matchHeld,
  pruneHeld,
  releaseAgent,
  type GitHubDecision,
  type HeldWrite,
  type RepoVisibility,
  type VisibilityNow
} from '../shared/github';

/** An entry older than this is stale: writes wait for a fresh check. */
export const VISIBILITY_STALE_MS = 30 * 60 * 1000;
/** How often listed repos are checked again. */
export const VISIBILITY_REFRESH_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

interface VisEntry { vis: RepoVisibility; at: number }

export class RepoVisibilityCache {
  private entries = new Map<string, VisEntry>();
  private pending = new Map<string, Promise<VisibilityNow>>();
  constructor(private readonly deps: {
    fetch?: typeof fetch;
    now?: () => number;
    changed?: (repo: string) => void;
  } = {}) {}

  private now(): number { return this.deps.now?.() ?? Date.now(); }

  /** What the hook may use now: a fresh entry, else 'unknown' (and a refresh starts). */
  get(repo: string): VisibilityNow {
    const e = this.entries.get(repo);
    if (e && this.now() - e.at <= VISIBILITY_STALE_MS) return e.vis;
    void this.check(repo);
    return 'unknown';
  }

  /** The last known visibility, however old, for the screens. */
  /** What GitHub's own listing (read with the owner's token) says, kept like a check. */
  note(repo: string, vis: 'public' | 'private'): void {
    this.entries.set(repo, { vis, at: this.now() });
  }

  peek(repo: string): VisibilityNow {
    return this.entries.get(repo)?.vis ?? 'unknown';
  }

  /** Asks GitHub once per repo at a time. A failure keeps the old entry. */
  check(repo: string): Promise<VisibilityNow> {
    const running = this.pending.get(repo);
    if (running) return running;
    const p = (async (): Promise<VisibilityNow> => {
      const f = this.deps.fetch ?? fetch;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await f(`https://api.github.com/repos/${repo}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'office-app' }, signal: ctl.signal });
        let vis: RepoVisibility | null = null;
        if (res.status === 404) vis = 'private';
        else if (res.ok) {
          const body = await res.json().catch(() => null) as { private?: unknown } | null;
          vis = body && body.private === false ? 'public' : 'private';
        }
        if (!vis) return this.peek(repo) === 'unknown' ? 'unknown' : this.peekFresh(repo);
        const before = this.entries.get(repo)?.vis;
        this.entries.set(repo, { vis, at: this.now() });
        if (before !== vis) this.deps.changed?.(repo);
        return vis;
      } catch {
        return this.peekFresh(repo);
      } finally {
        clearTimeout(timer);
        this.pending.delete(repo);
      }
    })();
    this.pending.set(repo, p);
    return p;
  }

  private peekFresh(repo: string): VisibilityNow {
    const e = this.entries.get(repo);
    return e && this.now() - e.at <= VISIBILITY_STALE_MS ? e.vis : 'unknown';
  }

  /** Checks every listed repo again (called on a timer). */
  refreshAll(repos: Iterable<string>): void {
    for (const r of new Set(repos)) void this.check(r);
  }
}

export interface HeldStoreDeps {
  path: string;
  /** A hive message to the member (from the app). */
  tell(agentId: string, subject: string, body: string): void;
  /** The Ask me board reads the list again. */
  changed(): void;
  now?: () => number;
}

const NOTE_MAX = 2000;

/** SHA-256 of one call (tool name and canonical input). */
export function callHash(tool: string, input: unknown): string {
  return createHash('sha256').update(callFingerprint(tool, input)).digest('hex');
}

/**
 * Held writes, kept by the app in its data folder (never a folder agents can
 * write), so what runs is what the owner approved.
 */
export class GitHubHeldStore {
  private list: HeldWrite[] = [];
  private loaded = false;
  constructor(private readonly deps: HeldStoreDeps) {}

  private now(): number { return this.deps.now?.() ?? Date.now(); }

  private load(): void {
    if (this.loaded) return;
    try {
      const raw = JSON.parse(readFileSync(this.deps.path, 'utf8')) as { held?: unknown };
      this.list = Array.isArray(raw.held) ? (raw.held as HeldWrite[]).filter((h) => h && typeof h.id === 'string' && typeof h.hash === 'string') : [];
    } catch { this.list = []; }
    this.loaded = true;
  }

  private save(): void {
    this.list = pruneHeld(this.list, this.now());
    const tmp = `${this.deps.path}.${randomBytes(3).toString('hex')}.tmp`;
    writeFileSync(tmp, JSON.stringify({ held: this.list }, null, 2), { mode: 0o600 });
    renameSync(tmp, this.deps.path);
  }

  /** Expire old ones and tell their members. */
  sweep(): void {
    this.load();
    const gone = expireHeld(this.list, this.now());
    if (!gone.length) return;
    for (const id of gone) {
      const h = this.list.find((x) => x.id === id);
      if (h) this.deps.tell(h.agentId, 'GitHub write expired', `The owner did not decide your write to ${h.repo} (${h.branch}) within a day, so it was not made. Ask again if it is still needed.`);
    }
    this.save();
    this.deps.changed();
  }

  /** The cards waiting for the owner. */
  waiting(): HeldWrite[] {
    this.load();
    expireHeld(this.list, this.now());
    return this.list.filter((h) => h.state === 'waiting').map((h) => ({ ...h }));
  }

  /**
   * The hook's step for a write the rule held: run an approved one (marking it
   * in flight under this tool_use_id), refuse one already running, or file a
   * card. Returns the reason to give the member when it is not run. Throws
   * when the store can't be saved, so the hook refuses (fail closed).
   */
  onHold(agentId: string, tool: string, input: Record<string, unknown>, d: Extract<GitHubDecision, { kind: 'hold' }>, toolUseId: string | undefined): { run: true } | { run: false; reason: string } {
    this.load();
    expireHeld(this.list, this.now());
    const hash = callHash(tool, input);
    const m = matchHeld(this.list, agentId, hash);
    if (m.kind === 'run') {
      if (!toolUseId) return { run: false, reason: 'The app could not confirm this approved write. Try again.' };
      m.held.state = 'inflight';
      m.held.toolUseId = toolUseId;
      this.save();
      return { run: true };
    }
    if (m.kind === 'running') return { run: false, reason: 'This approved write is already running. Wait for it to finish.' };
    if (m.kind === 'waiting') return { run: false, reason: 'This write is waiting for the owner\'s approval. You will be told when to run it again.' };
    const held: HeldWrite = {
      id: `gh-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
      agentId, tool, hash, repo: d.repo, branch: d.branch, files: d.files, flags: d.flags,
      visibility: d.visibility, says: callSays(input), input, state: 'waiting', created: this.now()
    };
    this.list.push(held);
    this.save();
    this.deps.changed();
    return { run: false, reason: 'Held for the owner\'s approval. You will be told when to run it again, exactly as you sent it.' };
  }

  /** Whether this exact call is an approved write the hook let run (in flight). */
  isRunning(agentId: string, tool: string, input: unknown): boolean {
    this.load();
    const hash = callHash(tool, input);
    return this.list.some((h) => h.agentId === agentId && h.hash === hash && h.state === 'inflight');
  }

  /** A call ended (PostToolUse or its failure). ok is false on an error result. */
  onEnd(toolUseId: string | undefined, ok: boolean): void {
    if (!toolUseId) return;
    this.load();
    if (endHeld(this.list, toolUseId, ok, this.now())) this.save();
  }

  /** The member's session ended: a running write goes back to approved. */
  onSessionEnd(agentId: string): void {
    this.load();
    if (releaseAgent(this.list, agentId) > 0) this.save();
  }

  /** The owner's decision. Returns false when the card is gone or decided. */
  decide(id: string, decision: 'approve' | 'decline' | 'changes', note?: string): boolean {
    this.load();
    expireHeld(this.list, this.now());
    const h = this.list.find((x) => x.id === id);
    if (!h || h.state !== 'waiting') return false;
    const n = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : '';
    if (decision === 'changes' && !n) return false;
    h.state = decision === 'approve' ? 'approved' : decision === 'decline' ? 'declined' : 'changes';
    h.decided = this.now();
    if (n) h.note = n;
    this.save();
    const push = h.tool === 'git_push';
    const what = push ? `your push of ${h.branch} to ${h.repo}` : `your write to ${h.repo} (${h.branch}, ${h.files.length ? h.files.join(', ') : h.tool})`;
    if (decision === 'approve') {
      this.deps.tell(h.agentId, 'GitHub write approved', push
        ? `The owner approved ${what}. Call git_push again for ${h.branch} with no new commits (keep the same bundle); it will go through once.`
        : `The owner approved ${what}. Run the same call again, exactly as you sent it; it will go through once.`);
    } else if (decision === 'decline') {
      this.deps.tell(h.agentId, 'GitHub write declined', `The owner declined ${what}.${n ? ` Their note: ${n}` : ''} Do not try another way.`);
    } else {
      this.deps.tell(h.agentId, 'GitHub write: changes asked', `The owner asked for changes to ${what}: ${n} Make them, then send ${push ? 'the push' : 'the write'} again for approval.`);
    }
    this.deps.changed();
    return true;
  }
}
