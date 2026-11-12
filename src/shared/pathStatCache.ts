/**
 * What the terminal knows about paths printed in agent output: is this one on
 * disk? One cache serves the hover (does a quoted match with a space link
 * whole?) and the ⌘-click (show it in the file browser).
 *
 * The stat and the clock are passed in, so the rules below are tested without a
 * window or a real disk (test/path-stat-cache.test.cjs).
 *
 * - An answer is kept for a few seconds. A check that fails (the IPC rejected)
 *   is not an answer and is never kept, so the next look tries again.
 * - A check already running for a path is shared by hover and click alike, so
 *   hovering again never stacks another stat on a slow path.
 * - A hover starts a new check only while fewer than `maxHoverChecks` are
 *   running. A stat can hang (a stale mounted share), and Node's file thread
 *   pool is small, so unbounded hover checks could stall every file read in the
 *   main process. A click is the owner asking, so it always looks.
 * - A click trusts a kept hit but looks again after a miss, so a path printed
 *   just before its file was written works as soon as the file exists.
 */

export type PathStat = { exists: boolean; isFile: boolean; path: string };

export interface PathStatCacheOptions {
  /** The real look at the disk (main's statAbs, which refuses a network path
   *  without a stat). */
  stat: (abs: string) => Promise<PathStat>;
  /** Milliseconds since some fixed point; Date.now in the app. */
  now?: () => number;
  /** How long an answer is kept. */
  ttlMs?: number;
  /** How many checks may run at once before a hover stops starting new ones. */
  maxHoverChecks?: number;
  /** The cache is emptied when it holds more paths than this. */
  maxEntries?: number;
}

export interface PathStatCache {
  /**
   * For a hover, answered now from what is already known: true or false when
   * the path has been checked recently, undefined when it has not (a check may
   * have started in the background, so a later hover knows). A path that did
   * not resolve (null) is never on disk and is never checked.
   */
  knownOnDisk(abs: string | null): boolean | undefined;
  /**
   * For a ⌘-click: a kept hit, or else a fresh look (joining one already
   * running). Null when the check itself failed.
   */
  lookForClick(abs: string): Promise<PathStat | null>;
}

export const PATH_STAT_TTL_MS = 10_000;
export const MAX_HOVER_STAT_CHECKS = 2;
const MAX_ENTRIES = 500;

export function createPathStatCache(opts: PathStatCacheOptions): PathStatCache {
  const now = opts.now ?? Date.now;
  const ttlMs = opts.ttlMs ?? PATH_STAT_TTL_MS;
  const maxHoverChecks = opts.maxHoverChecks ?? MAX_HOVER_STAT_CHECKS;
  const maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  const kept = new Map<string, { at: number; res: PathStat }>();
  const running = new Map<string, Promise<PathStat | null>>();

  function fresh(abs: string): PathStat | undefined {
    const hit = kept.get(abs);
    if (!hit) return undefined;
    if (now() - hit.at < ttlMs) return hit.res;
    kept.delete(abs);
    return undefined;
  }

  function check(abs: string): Promise<PathStat | null> {
    const already = running.get(abs);
    if (already) return already;
    let look: Promise<PathStat>;
    try { look = Promise.resolve(opts.stat(abs)); } catch (err) { look = Promise.reject(err); }
    const p = look.then(
      (res) => {
        running.delete(abs);
        if (kept.size >= maxEntries) kept.clear();
        kept.set(abs, { at: now(), res });
        return res;
      },
      () => {
        running.delete(abs);
        return null;
      }
    );
    running.set(abs, p);
    return p;
  }

  return {
    knownOnDisk(abs) {
      if (!abs) return false;
      const res = fresh(abs);
      if (res) return res.exists;
      if (!running.has(abs) && running.size < maxHoverChecks) void check(abs);
      return undefined;
    },
    lookForClick(abs) {
      const res = fresh(abs);
      if (res && res.exists) return Promise.resolve(res);
      return check(abs);
    }
  };
}
