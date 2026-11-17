/**
 * Reads one file a team member named for an outgoing email
 * (docs/designs/agent-attach-files.md). It runs in a process of its own,
 * started inside the member's own folder walls (outgoingFiles.ts), so the
 * operating system refuses anything the member could not read itself: a link
 * partway down the path or a folder swapped at the right moment reaches
 * nothing new. Nothing here imports Electron, so the same code runs under
 * plain Node in tests.
 *
 * The answer: the file's bytes on stdout and exit 0, or exit 3 with one word
 * on stderr saying why not.
 */
import { closeSync, constants, fstatSync, lstatSync, readSync } from 'node:fs';
import { openNoFollow } from './noFollow';

export type ReadRefusal = 'missing' | 'denied' | 'link' | 'not-file' | 'links' | 'too-big' | 'changed' | 'failed';

export const READ_REFUSALS: readonly ReadRefusal[] = ['missing', 'denied', 'link', 'not-file', 'links', 'too-big', 'changed', 'failed'];

/** The exit code of a refusal, apart from a crash (1) and a kill. */
export const REFUSED_EXIT = 3;

function refusalOf(e: unknown): ReadRefusal {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
  if (code === 'EPERM' || code === 'EACCES') return 'denied';
  if (code === 'ELOOP' || code === 'EMLINK') return 'link';
  if (code === 'EISDIR') return 'not-file';
  return 'failed';
}

/**
 * The file's bytes, read through one handle: never through a link at the end
 * of the path, a plain file with one name (a hard link could be a second name
 * for a file the member can't open), at most `max` bytes. Where the system
 * has no O_NOFOLLOW (Windows), the path must still name the same file after
 * the read.
 */
export function readOneFile(path: string, max: number): { ok: true; bytes: Buffer } | { ok: false; why: ReadRefusal } {
  let fd: number;
  try {
    // Never blocks: a named pipe with no writer would otherwise hang here.
    fd = openNoFollow(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  } catch (e) { return { ok: false, why: refusalOf(e) }; }
  try {
    const st = fstatSync(fd, { bigint: true });
    if (!st.isFile()) return { ok: false, why: 'not-file' };
    if (st.nlink !== 1n) return { ok: false, why: 'links' };
    if (st.size > BigInt(max)) return { ok: false, why: 'too-big' };
    const size = Number(st.size);
    const bytes = Buffer.alloc(size);
    let got = 0;
    while (got < size) {
      const n = readSync(fd, bytes, got, size - got, got);
      if (n === 0) break;
      got += n;
    }
    if (got !== size) return { ok: false, why: 'changed' };
    if (process.platform === 'win32') {
      let now: ReturnType<typeof lstatSync>;
      try { now = lstatSync(path, { bigint: true }); } catch { return { ok: false, why: 'changed' }; }
      if (!now || now.isSymbolicLink() || now.ino !== st.ino || now.dev !== st.dev) return { ok: false, why: 'changed' };
    }
    return { ok: true, bytes };
  } catch (e) {
    return { ok: false, why: refusalOf(e) };
  } finally {
    try { closeSync(fd); } catch { /* read already done */ }
  }
}

/** The command: `<max bytes> <path>`. */
export function readerMain(argv: string[]): void {
  const max = Number(argv[0]);
  const path = argv[1];
  if (!Number.isSafeInteger(max) || max < 0 || !path) {
    process.stderr.write('failed');
    process.exitCode = REFUSED_EXIT;
    return;
  }
  const r = readOneFile(path, max);
  if (!r.ok) {
    process.stderr.write(r.why);
    process.exitCode = REFUSED_EXIT;
    return;
  }
  process.stdout.write(r.bytes);
}
