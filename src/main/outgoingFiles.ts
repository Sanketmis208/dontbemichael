/**
 * Files a team member attaches to an outgoing email from its folder
 * (docs/designs/agent-attach-files.md).
 *
 *  - A file must pass the member's own file tool check, and its real path
 *    must sit in the member's folder or a folder the owner named for its job.
 *  - It is read by a short-lived process inside the member's own folder walls
 *    (fileReader.ts): a macOS sandbox profile, bubblewrap on Linux. The system
 *    enforces the walls on the real file, so a link partway down the path, or
 *    a folder swapped at the right moment, reaches nothing the member can't.
 *    Windows has no sandbox for members' shells, so there the reader holds to
 *    path checks, and the member gains no reach it lacks today.
 *  - The kind is judged from the bytes, as a saved attachment's is.
 *  - An email that waits for the owner keeps copies in the app's private
 *    folder, which no agent opens, each with its sha256. What goes out is
 *    that copy, never the file on disk at send time.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, constants, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { attachmentKind, type AttachmentKindId } from '../shared/attachmentKind';
import type { ProposalFile, ProposalFiles } from '../shared/mailProposals';
import { attachmentStem } from './attachmentSave';
import { READ_REFUSALS, REFUSED_EXIT, readOneFile, type ReadRefusal } from './fileReader';
import { openNoFollow } from './noFollow';
import { isSameOrInside } from './pathInside';
import { hardKillTree } from './procKill';

/** At most this many files go with one email. */
export const OUTGOING_FILES_MAX = 20;
/** All the files of one email together, and so any one of them: the usual
 *  25 MB message limit, less about a third for email encoding [estimated]. */
export const OUTGOING_BYTES_MAX = 18 * 1024 * 1024;
/** Copies one member may hold for emails waiting on the owner [estimated]. */
export const OUTGOING_HELD_MAX = 60 * 1024 * 1024;
/** One file, and all of them: the read and then the send (at most two
 *  minutes, mail.ts) fit inside md-mail's three minutes. A cloud placeholder
 *  downloads while it is read. */
export const OUTGOING_READ_MS = 45_000;
export const OUTGOING_READ_BUDGET_MS = 50_000;
const AT_ONCE = 3;
const PATH_MAX = 4096;

/** One attached file as the proposal keeps it, and an email's whole set:
 *  the key of its copies and each file in order (shared/mailProposals.ts). */
export type OutgoingFileMeta = ProposalFile;
export type OutgoingFileSet = ProposalFiles;

export interface OutgoingFile extends OutgoingFileMeta {
  bytes: Buffer;
}

/** A file ready for MailService (ComposeInput.files). */
export interface OutgoingAttachment { filename: string; content: Buffer; contentType: string }

/** The folders a member's shell may not read, and those inside them it may. */
export interface ReaderWalls { deny: string[]; allow: string[] }

/** How to start the reader: a program and its first arguments. The reader's
 *  own two (most bytes, path) are added for each file. */
export interface ReaderLaunch { file: string; args: string[]; env?: NodeJS.ProcessEnv }

export class OutgoingFileError extends Error {}

const CONTENT_TYPE: Record<AttachmentKindId, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
};

export const contentTypeOf = (kind: string): string => CONTENT_TYPE[kind as AttachmentKindId] ?? 'application/octet-stream';

const KEY = /^[0-9a-f]{18}$/;

/** A copy set's key as the store gives it back, or null when it isn't one. */
export function validKey(key: unknown): key is string { return typeof key === 'string' && KEY.test(key); }

const mb = (n: number): string => `${Math.max(0.1, Math.round((n / (1024 * 1024)) * 10) / 10)} MB`;

// ── Starting the reader inside the member's walls ───────────────────────────

/** Each wall as given and as the folder it really is (/var is /private/var on
 *  a Mac), since the sandbox judges real paths. */
export function realWalls(walls: ReaderWalls, real: (p: string) => string | null): ReaderWalls {
  const both = (list: string[]): string[] => Array.from(new Set(list.filter(Boolean).flatMap((p) => [p, real(p) ?? p])));
  return { deny: both(walls.deny), allow: both(walls.allow) };
}

const sbString = (p: string): string => `"${p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * The macOS sandbox profile for one read: anything but the walls, no network
 * and no writing anywhere. A later rule wins, so a folder the member may read
 * inside a closed one (its own folder in the business folder) stays open, as
 * in its shell's own sandbox.
 */
export function sandboxProfile(walls: ReaderWalls): string {
  const lines = ['(version 1)', '(allow default)', '(deny network*)', '(deny file-write*)'];
  if (walls.deny.length) lines.push(`(deny file-read* ${walls.deny.map((p) => `(subpath ${sbString(p)})`).join(' ')})`);
  if (walls.allow.length) lines.push(`(allow file-read* ${walls.allow.map((p) => `(subpath ${sbString(p)})`).join(' ')})`);
  return lines.join('\n');
}

/** bubblewrap's arguments for one read on Linux: the system read only, each
 *  closed folder hidden behind an empty one (a closed file behind an empty
 *  file), the open ones inside put back, and no network. */
export function bwrapArgs(walls: ReaderWalls, kindOf: (p: string) => 'dir' | 'file' | null): string[] {
  // Its own process space: a fresh /proc mounts only inside one (unprivileged
  // bwrap refuses it otherwise), and /proc/<pid>/root of the app or another
  // process would lead past the hidden folders.
  const args = ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--unshare-pid', '--unshare-net', '--die-with-parent', '--new-session'];
  for (const d of walls.deny) {
    const k = kindOf(d);
    if (k === 'dir') args.push('--tmpfs', d);
    else if (k === 'file') args.push('--ro-bind', '/dev/null', d);
  }
  for (const a of walls.allow) if (kindOf(a)) args.push('--ro-bind', a, a);
  args.push('--');
  return args;
}

export const NO_BWRAP = 'This computer has no bubblewrap, which the app needs to read a file safely for you, so nothing was attached. Tell Michael: the owner can install bubblewrap.';

/** How to start the reader on this system, or why it can't be. */
export function readerLaunch(opts: {
  platform: NodeJS.Platform;
  /** The program that runs the reader script (Electron as Node, or Node). */
  runner: string;
  script: string;
  walls: ReaderWalls;
  env?: NodeJS.ProcessEnv;
  bwrap?: string | null;
  kindOf?: (p: string) => 'dir' | 'file' | null;
}): ReaderLaunch | { refused: string } {
  const env = opts.env;
  if (opts.platform === 'darwin') return { file: '/usr/bin/sandbox-exec', args: ['-p', sandboxProfile(opts.walls), opts.runner, opts.script], env };
  if (opts.platform === 'win32') return { file: opts.runner, args: [opts.script], env };
  if (!opts.bwrap) return { refused: NO_BWRAP };
  return { file: opts.bwrap, args: [...bwrapArgs(opts.walls, opts.kindOf ?? (() => null)), opts.runner, opts.script], env };
}

/** One file read by the reader process, with a time limit. */
export function readApart(launch: ReaderLaunch, path: string, max: number, timeoutMs: number): Promise<{ ok: true; bytes: Buffer } | { ok: false; why: ReadRefusal | 'slow' }> {
  return new Promise((done) => {
    let settled = false;
    const chunks: Buffer[] = [];
    let got = 0;
    let err = '';
    let timer: NodeJS.Timeout | undefined;
    const finish = (r: { ok: true; bytes: Buffer } | { ok: false; why: ReadRefusal | 'slow' }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(r);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(launch.file, [...launch.args, String(max), path], {
        env: launch.env,
        // Its own process group off Windows, so a timeout stops everything it started.
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    } catch {
      finish({ ok: false, why: 'failed' });
      return;
    }
    child.stdout?.on('data', (b: Buffer) => {
      got += b.length;
      // More than the file may be: never held whole.
      if (got > max) {
        if (child.pid) hardKillTree(child.pid);
        finish({ ok: false, why: 'too-big' });
        return;
      }
      chunks.push(b);
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (s: string) => { if (err.length < 200) err += s; });
    child.on('error', () => finish({ ok: false, why: 'failed' }));
    child.on('close', (code) => {
      if (code === 0) { finish({ ok: true, bytes: Buffer.concat(chunks) }); return; }
      const word = err.trim();
      finish({ ok: false, why: code === REFUSED_EXIT && (READ_REFUSALS as readonly string[]).includes(word) ? word as ReadRefusal : 'failed' });
    });
    timer = setTimeout(() => {
      if (child.pid) hardKillTree(child.pid);
      finish({ ok: false, why: 'slow' });
    }, Math.max(1, timeoutMs));
  });
}

const REFUSED: Record<ReadRefusal | 'slow', string> = {
  missing: 'was not found.',
  denied: 'is in a folder you can\'t open.',
  link: 'is a link. Attach the file it points to, from your own folder.',
  'not-file': 'is not a file.',
  links: 'has more than one name on disk, so the app does not send it. Copy it to a new file in your folder and attach that.',
  'too-big': `is over ${mb(OUTGOING_BYTES_MAX)}, more than one email carries.`,
  changed: 'changed while it was read. Try again.',
  failed: 'could not be read.',
  slow: 'took too long to read; it may still be downloading from the cloud. Try again in a minute.'
};

// ── Reading, keeping and sending ────────────────────────────────────────────

export interface OutgoingDeps {
  /** `<harnessHome>/private/outgoing`, or undefined without an app folder. */
  root(): string | undefined;
  /** The folder the member started in, kept in main at spawn. */
  memberFolder(agentId: string): string | undefined;
  /** Folders the owner named for its job on a Company foundations card. */
  readFolders(agentId: string): string[];
  /** The member's own file tool check for a read (hooks.ts). */
  check(agentId: string, path: string): { deny: boolean; reason?: string };
  /** How to start the reader inside this member's walls. */
  launch(agentId: string): ReaderLaunch | { refused: string };
  readMs?: number;
  budgetMs?: number;
  now?: () => number;
}

/** The paths an agent gave, cleaned, or why they can't be used. */
export function parseAttachPaths(raw: unknown): { ok: true; paths: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, paths: [] };
  if (!Array.isArray(raw) || raw.some((p) => typeof p !== 'string')) return { ok: false, error: '"attach_files" is a list of file paths from your folder.' };
  const paths = Array.from(new Set((raw as string[]).map((p) => p.trim()).filter((p) => p.length > 0)));
  if (paths.some((p) => p.length > PATH_MAX || p.includes('\0'))) return { ok: false, error: 'One of the paths in "attach_files" is not a file path.' };
  if (paths.length > OUTGOING_FILES_MAX) return { ok: false, error: `At most ${OUTGOING_FILES_MAX} files go with one email. Send the rest in another email.` };
  return { ok: true, paths };
}

export class OutgoingFiles {
  /** Copy sets written but not yet on a proposal: a sweep leaves them. */
  private pending = new Set<string>();
  /** Reader processes running now, for every caller together (email tool and
   *  teammate hand-offs), and those waiting their turn. */
  private readers = 0;
  private waiters: Array<() => void> = [];

  private async readerSlot(): Promise<() => void> {
    if (this.readers >= AT_ONCE) await new Promise<void>((go) => this.waiters.push(go));
    this.readers++;
    let freed = false;
    return () => {
      if (freed) return;
      freed = true;
      this.readers--;
      this.waiters.shift()?.();
    };
  }

  constructor(private deps: OutgoingDeps) {}

  private real(p: string): string | null {
    try { return realpathSync(p); } catch { return null; }
  }

  /** Where the member's file may come from, as real folders. */
  private roots(agentId: string): string[] {
    const own = this.deps.memberFolder(agentId);
    return [own, ...this.deps.readFolders(agentId)].filter((d): d is string => !!d).map((d) => this.real(d) ?? d);
  }

  /**
   * Reads the files a member named, at most three at a time, all within the
   * time budget. Every file is checked before any is kept, so one refusal
   * leaves nothing behind and the member hears which file and why.
   */
  async read(agentId: string, paths: string[], words: { lead: string; goes: string } = { lead: 'Not attached', goes: 'go with an email' }): Promise<{ ok: true; files: OutgoingFile[] } | { ok: false; error: string }> {
    if (!paths.length) return { ok: true, files: [] };
    const folder = this.deps.memberFolder(agentId);
    if (!folder) return { ok: false, error: 'You have no folder to send files from. Tell Michael.' };
    const launch = this.deps.launch(agentId);
    if ('refused' in launch) return { ok: false, error: launch.refused };
    const roots = this.roots(agentId);
    const shown = (p: string): string => JSON.stringify(p.length > 200 ? `...${p.slice(-200)}` : p);

    // Each path checked as the member's own file tools would be, then by the
    // folder it really is in.
    const targets: Array<{ asked: string; real: string }> = [];
    for (const p of paths) {
      const abs = resolve(isAbsolute(p) ? p : join(folder, p));
      const asked = this.deps.check(agentId, abs);
      if (asked.deny) return { ok: false, error: `${words.lead}: ${shown(p)}. ${asked.reason ?? 'You can\'t open that file.'}` };
      const real = this.real(abs);
      if (!real) return { ok: false, error: `${words.lead}: ${shown(p)} ${REFUSED.missing}` };
      if (!roots.some((r) => isSameOrInside(r, real))) {
        return { ok: false, error: `${words.lead}: ${shown(p)}. Only files in your own folder, or in a folder the owner named for your job, ${words.goes}.` };
      }
      const asReal = real === abs ? asked : this.deps.check(agentId, real);
      if (asReal.deny) return { ok: false, error: `${words.lead}: ${shown(p)}. ${asReal.reason ?? 'You can\'t open that file.'}` };
      if (!targets.some((t) => t.real === real)) targets.push({ asked: abs, real });
    }

    const now = this.deps.now ?? Date.now;
    const deadline = now() + (this.deps.budgetMs ?? OUTGOING_READ_BUDGET_MS);
    const perFile = this.deps.readMs ?? OUTGOING_READ_MS;
    const out: Array<OutgoingFile | { error: string }> = new Array(targets.length);
    let next = 0;
    // Bytes read so far: each read may take only what is left of the email's
    // total, and once it is spent nothing more is read, so one call never
    // holds much more than one email's worth.
    let used = 0;
    let overTotal = false;
    const worker = async (): Promise<void> => {
      while (next < targets.length && !overTotal) {
        const i = next++;
        const t = targets[i];
        const room = OUTGOING_BYTES_MAX - used;
        if (room <= 0) { overTotal = true; continue; }
        const release = await this.readerSlot();
        let r: Awaited<ReturnType<typeof readApart>>;
        try {
          const left = deadline - now();
          r = left <= 0 ? { ok: false as const, why: 'slow' as const } : await readApart(launch, t.real, room, Math.min(perFile, left));
        } finally { release(); }
        if (!r.ok && r.why === 'too-big' && room < OUTGOING_BYTES_MAX) { overTotal = true; continue; }
        if (!r.ok) { out[i] = { error: `${words.lead}: ${shown(t.asked)} ${REFUSED[r.why]}` }; continue; }
        used += r.bytes.length;
        const kind = attachmentKind(r.bytes, basename(t.real));
        if (!kind) {
          out[i] = { error: `${words.lead}: ${shown(t.asked)} is not a kind of file the office sends. PDF, Word, Excel, PowerPoint, plain text, CSV and pictures are.` };
          continue;
        }
        out[i] = {
          name: `${attachmentStem(basename(t.asked))}.${kind.ending}`,
          size: r.bytes.length,
          kind: kind.id,
          sha256: createHash('sha256').update(r.bytes).digest('hex'),
          from: dirname(t.real),
          bytes: r.bytes
        };
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, targets.length) }, worker));
    const tooMuch = `These files come to over ${mb(OUTGOING_BYTES_MAX)} together, more than one email carries. Split them across emails.`;
    if (overTotal) return { ok: false, error: tooMuch };
    const failed = out.find((x): x is { error: string } => !!x && 'error' in x);
    if (failed) return { ok: false, error: failed.error };
    const files = out as OutgoingFile[];
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > OUTGOING_BYTES_MAX) {
      return { ok: false, error: `These files come to ${mb(total)} together, more than one email carries (${mb(OUTGOING_BYTES_MAX)}). Split them across emails.` };
    }
    return { ok: true, files };
  }

  /** Copies the files where no agent reaches; returns the set to keep on the
   *  proposal. The set stays pending until `settled`, so a sweep in between
   *  leaves it. */
  keep(files: OutgoingFile[]): OutgoingFileSet {
    const root = this.deps.root();
    if (!root) throw new OutgoingFileError('The app has no private folder to keep the files in, so nothing was attached. Tell Michael.');
    const key = randomBytes(9).toString('hex');
    const dir = join(root, key);
    this.pending.add(key);
    try {
      mkdirSync(root, { recursive: true, mode: 0o700 });
      mkdirSync(dir, { mode: 0o700 });
      files.forEach((f, i) => {
        const fd = openNoFollow(join(dir, String(i)), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
        try { writeFileSync(fd, f.bytes); } finally { closeSync(fd); }
      });
    } catch (e) {
      this.drop(key);
      throw new OutgoingFileError(`The files could not be kept for the owner: ${(e as NodeJS.ErrnoException).code ?? 'unknown error'}. Nothing was attached.`);
    }
    return { key, items: files.map(({ bytes: _bytes, ...meta }) => meta) };
  }

  /** The set is on a proposal now (or was dropped). */
  settled(key: string): void { this.pending.delete(key); }

  /** The copies of a set, each checked against its sha256: those at `keep`
   *  positions when the owner took some off, else all. */
  load(set: OutgoingFileSet, keep?: number[]): OutgoingAttachment[] {
    const root = this.deps.root();
    const gone = 'The files for this email are no longer kept, so it was not sent. Propose it again.';
    if (!root || !validKey(set.key)) throw new OutgoingFileError(gone);
    const at = keep ?? set.items.map((_, i) => i);
    return at.map((i) => {
      const meta = set.items[i];
      if (!meta) throw new OutgoingFileError(gone);
      const r = readOneFile(join(root, set.key, String(i)), OUTGOING_BYTES_MAX);
      if (!r.ok) throw new OutgoingFileError(gone);
      if (r.bytes.length !== meta.size || createHash('sha256').update(r.bytes).digest('hex') !== meta.sha256) {
        throw new OutgoingFileError('A file kept for this email changed after it was proposed, so it was not sent. Propose it again.');
      }
      return { filename: meta.name, content: r.bytes, contentType: contentTypeOf(meta.kind) };
    });
  }

  /** The path of one copy, for the owner to open from the card. */
  copyPath(set: OutgoingFileSet, index: number): string | null {
    const root = this.deps.root();
    if (!root || !validKey(set.key) || !set.items[index]) return null;
    return join(root, set.key, String(index));
  }

  drop(key: string): void {
    this.pending.delete(key);
    const root = this.deps.root();
    if (!root || !validKey(key)) return;
    try { rmSync(join(root, key), { recursive: true, force: true }); } catch (e) { console.warn('[mail] outgoing copies not removed:', key, (e as Error).message); }
  }

  /** Deletes every copy set no live proposal holds, but those being filed. */
  sweep(live: Iterable<string>): void {
    const root = this.deps.root();
    if (!root) return;
    const keep = new Set(live);
    let names: string[];
    try { names = readdirSync(root); } catch { return; }
    for (const name of names) {
      if (keep.has(name) || this.pending.has(name)) continue;
      try { rmSync(join(root, name), { recursive: true, force: true }); } catch (e) { console.warn('[mail] outgoing copies not removed:', name, (e as Error).message); }
    }
  }
}
