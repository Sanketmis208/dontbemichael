/**
 * The backup file (`.dbmbackup`): one gzip stream holding a manifest and every
 * file, written and read as a stream so a large documents folder never sits in
 * memory. Plain node (zlib, fs), no electron import, so it tests as a node
 * module; no archive library is needed and it reads the same on any platform.
 *
 *   gzip(
 *     "DBMBACKUP 1\n"
 *     <manifest JSON>\n
 *     { "r": root, "p": "rel/path", "s": size, "m": mode, "t": mtimeMs }\n <size bytes>
 *     ... one header line and its bytes per file ...
 *     { "end": true, "n": files }\n
 *   )
 *
 * Paths are relative to their root and use "/". A reader never writes outside
 * the folder it is given for a root: an absolute path, a "..", or anything that
 * resolves outside is refused, so a crafted backup cannot write elsewhere.
 */
import { createReadStream, createWriteStream, mkdirSync, utimesSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { createGunzip, createGzip, constants as zc } from 'node:zlib';
import { once } from 'node:events';
import type { Readable, Writable } from 'node:stream';

export const BACKUP_MAGIC = 'DBMBACKUP 1\n';
/** A manifest or header line longer than this is not a backup. */
const MAX_LINE = 8 * 1024 * 1024;

export interface EntryHeader {
  /** The root it belongs to (a key of the manifest's roots). */
  r: string;
  /** Path inside the root, with "/". */
  p: string;
  /** Size in bytes. */
  s: number;
  /** File mode bits (0o777 at most). */
  m: number;
  /** Modified time, ms. */
  t: number;
}

/** Writes a backup file. Add files in any order, then finish(). */
export class BackupWriter {
  private readonly gzip = createGzip({ level: zc.Z_BEST_SPEED });
  private readonly out: Writable;
  private files = 0;
  private bytes = 0;
  private done: Promise<unknown>;

  constructor(path: string, manifest: object) {
    mkdirSync(dirname(path), { recursive: true });
    this.out = createWriteStream(path, { mode: 0o600 });
    this.gzip.pipe(this.out);
    this.done = once(this.out, 'close');
    this.gzip.write(BACKUP_MAGIC);
    this.gzip.write(`${JSON.stringify(manifest)}\n`);
  }

  get counts(): { files: number; bytes: number } { return { files: this.files, bytes: this.bytes }; }

  private async put(chunk: Buffer | string): Promise<void> {
    if (!this.gzip.write(chunk)) await once(this.gzip, 'drain');
  }

  /** One file from disk, streamed. Its size is read as it is written, so a file
   *  that grew or shrank since it was listed is stored as it was when read. */
  async addFile(root: string, rel: string, abs: string, mode: number, mtimeMs: number, size: number): Promise<void> {
    // Read it whole into the stream with the size taken from the bytes read:
    // a size from an earlier stat could be wrong for a file still being written.
    const chunks: Buffer[] = [];
    let total = 0;
    if (size <= 64 * 1024 * 1024) {
      for await (const c of createReadStream(abs)) { chunks.push(c as Buffer); total += (c as Buffer).length; }
      await this.addBuffer(root, rel, Buffer.concat(chunks, total), mode, mtimeMs);
      return;
    }
    // A large file streams with its listed size; a file that changes while it is
    // read is padded or cut to that size, so the archive stays readable.
    await this.put(`${JSON.stringify(header(root, rel, size, mode, mtimeMs))}\n`);
    let left = size;
    for await (const c of createReadStream(abs, { end: size - 1 })) {
      const b = (c as Buffer).subarray(0, left);
      left -= b.length;
      await this.put(b);
    }
    if (left > 0) await this.put(Buffer.alloc(left));
    this.files += 1;
    this.bytes += size;
  }

  async addBuffer(root: string, rel: string, data: Buffer, mode = 0o600, mtimeMs = Date.now()): Promise<void> {
    await this.put(`${JSON.stringify(header(root, rel, data.length, mode, mtimeMs))}\n`);
    await this.put(data);
    this.files += 1;
    this.bytes += data.length;
  }

  async finish(): Promise<{ files: number; bytes: number }> {
    await this.put(`${JSON.stringify({ end: true, n: this.files })}\n`);
    this.gzip.end();
    await this.done;
    return this.counts;
  }
}

function header(root: string, rel: string, size: number, mode: number, mtimeMs: number): EntryHeader {
  return { r: root, p: rel.split(sep).join('/'), s: size, m: mode & 0o777, t: Math.round(mtimeMs) };
}

/** A path from a backup, safe to write under `base`, or null when it is not
 *  (absolute, "..", empty, or resolving outside). */
export function safeTarget(base: string, rel: string): string | null {
  if (typeof rel !== 'string' || !rel || rel.includes('\0') || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) return null;
  const parts = rel.split('/');
  if (parts.some((p) => p === '..' || p === '')) return null;
  const root = resolve(base);
  const target = resolve(root, ...parts);
  return target.startsWith(root + sep) ? target : null;
}

/** A byte reader over the gunzipped stream: lines and exact byte counts. */
class Bytes {
  private buf: Buffer = Buffer.alloc(0);
  private ended = false;
  private readonly it: AsyncIterator<Buffer>;
  constructor(src: Readable) { this.it = (src as AsyncIterable<Buffer>)[Symbol.asyncIterator](); }
  private async more(): Promise<boolean> {
    if (this.ended) return false;
    const n = await this.it.next();
    if (n.done) { this.ended = true; return false; }
    this.buf = this.buf.length ? Buffer.concat([this.buf, n.value]) : n.value;
    return true;
  }
  async line(): Promise<string | null> {
    for (;;) {
      const at = this.buf.indexOf(10);
      if (at >= 0) { const l = this.buf.subarray(0, at).toString('utf8'); this.buf = this.buf.subarray(at + 1); return l; }
      if (this.buf.length > MAX_LINE) throw new Error('not a backup file');
      if (!(await this.more())) return null;
    }
  }
  /** Hand exactly `n` bytes to `sink` (null skips them). */
  async take(n: number, sink: ((b: Buffer) => Promise<void>) | null): Promise<void> {
    let left = n;
    while (left > 0) {
      if (this.buf.length === 0 && !(await this.more())) throw new Error('the backup file is cut short');
      const b = this.buf.subarray(0, left);
      this.buf = this.buf.subarray(b.length);
      left -= b.length;
      if (sink) await sink(b);
    }
  }
}

function open(path: string): Bytes {
  const gunzip = createGunzip();
  createReadStream(path).on('error', (e) => gunzip.destroy(e)).pipe(gunzip);
  return new Bytes(gunzip);
}

/** The manifest, read without going through the files. */
export async function readManifest<T = unknown>(path: string): Promise<T> {
  const b = open(path);
  try {
    if ((await b.line()) + '\n' !== BACKUP_MAGIC) throw new Error('not a backup file');
    const m = await b.line();
    if (m === null) throw new Error('not a backup file');
    return JSON.parse(m) as T;
  } catch (e) {
    throw e instanceof SyntaxError ? new Error('not a backup file') : e;
  }
}

/**
 * Read every file. `place` says where a file goes (an absolute path made with
 * safeTarget), or null to skip it. Returns how many were written and skipped;
 * throws when the file is not a whole backup.
 */
export async function readEntries(
  path: string,
  place: (h: EntryHeader) => string | null
): Promise<{ written: number; skipped: number }> {
  const b = open(path);
  if ((await b.line()) + '\n' !== BACKUP_MAGIC) throw new Error('not a backup file');
  if ((await b.line()) === null) throw new Error('not a backup file');
  let written = 0;
  let skipped = 0;
  for (;;) {
    const l = await b.line();
    if (l === null) throw new Error('the backup file is cut short');
    let h: EntryHeader & { end?: boolean };
    try { h = JSON.parse(l); } catch { throw new Error('not a backup file'); }
    if (h.end) break;
    if (typeof h.s !== 'number' || h.s < 0 || !Number.isFinite(h.s)) throw new Error('not a backup file');
    const target = place(h);
    if (!target) { await b.take(h.s, null); skipped += 1; continue; }
    mkdirSync(dirname(target), { recursive: true });
    const out = createWriteStream(target, { mode: (h.m & 0o777) || 0o600 });
    await b.take(h.s, async (chunk) => { if (!out.write(chunk)) await once(out, 'drain'); });
    out.end();
    await once(out, 'close');
    // Keep the file's own time, so a restored office looks as it did.
    if (h.t > 0) { try { utimesSync(target, new Date(), new Date(h.t)); } catch { /* the time only */ } }
    written += 1;
  }
  return { written, skipped };
}

