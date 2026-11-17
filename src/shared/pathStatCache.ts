/**
 * What the terminal knows about paths printed in agent output: is this one on
 * disk? One cache serves the hover (does a quoted match with a space link
 * whole?) and the ⌘-click (show it in the file browser).
 *
 * The stat and the clock are passed in, so the rules below are tested without a
 * window or a real disk (test/path-stat-cache.test.cjs).
 *
 * - An answer is kept for a few seconds. A check that fails (the IPC rejected)
 *   is not an answer and is never kept, so the next look tries again (a hover
 *   waits out a slow path, below).
 * - A check already running for a path is shared by hover and click alike, so
 *   hovering again never stacks another stat on a slow path.
 * - A hover starts a new check only while fewer than MAX_HOVER_STAT_CHECKS
 *   checks started by a hover are running. A stat can hang (a stale mounted
 *   share), and Node's file thread pool is small, so unbounded hover checks
 *   could stall every file read in the main process. A click is the owner
 *   asking, so it always looks, and its checks take no hover slot.
 * - A hover check holds its slot until its stat settles, past the deadline or
 *   not. A stat cannot be cancelled, so a hung one keeps its file thread, and
 *   freeing its slot early would let hovers pile hung stats onto the pool. With
 *   both slots held by hung stats a hover only loses the underline: the
 *   unchecked link still looks at the disk on click.
 * - Every running check keeps when it started. When a check fails at least
 *   PATH_STAT_DEADLINE_MS after it started, a hover's or a click's, its path is
 *   slow for SLOW_PATH_MS from the failure, so a hover starts no new stat on it
 *   until that window ends. While a stat runs, a hover answers undefined for
 *   its path, and a click joins it rather than stacking a second one beside it.
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
  /** The cache is emptied when it holds more paths than this. */
  maxEntries?: number;
}

export interface PathStatCache {
  /**
   * For a hover, answered now from what is already known: true or false when
   * the path has been checked recently, undefined when it has not (a check may
   * have started in the background, so a later hover knows) or its check is
   * slow. A path that did not resolve (null) is never on disk and is never
   * checked.
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
export const PATH_STAT_DEADLINE_MS = 5_000;
export const SLOW_PATH_MS = 60_000;
const MAX_ENTRIES = 500;

export function createPathStatCache(opts: PathStatCacheOptions): PathStatCache {
  const now = opts.now ?? Date.now;
  const maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  const kept = new Map<string, { at: number; res: PathStat }>();
  const running = new Map<string, Promise<PathStat | null>>();
  /** When each running check started, a hover's or a click's. */
  const started = new Map<string, number>();
  /** Paths whose hover check has not settled; they count against
   *  MAX_HOVER_STAT_CHECKS. */
  const hoverSlots = new Set<string>();
  /** Paths whose check failed past the deadline, until when they count as slow. */
  const slowUntil = new Map<string, number>();

  /** The path counts as slow for SLOW_PATH_MS from t. */
  function markSlow(abs: string, t: number): void {
    if (slowUntil.size >= maxEntries) slowUntil.clear();
    slowUntil.set(abs, t + SLOW_PATH_MS);
  }

  function isSlow(abs: string): boolean {
    const until = slowUntil.get(abs);
    if (until === undefined) return false;
    if (now() < until) return true;
    slowUntil.delete(abs);
    return false;
  }

  function fresh(abs: string): PathStat | undefined {
    const hit = kept.get(abs);
    if (!hit) return undefined;
    if (now() - hit.at < PATH_STAT_TTL_MS) return hit.res;
    kept.delete(abs);
    return undefined;
  }

  function check(abs: string): Promise<PathStat | null> {
    const already = running.get(abs);
    if (already) return already;
    started.set(abs, now());
    let look: Promise<PathStat>;
    try { look = Promise.resolve(opts.stat(abs)); } catch (err) { look = Promise.reject(err); }
    const p = look.then(
      (res) => {
        running.delete(abs);
        started.delete(abs);
        hoverSlots.delete(abs);
        slowUntil.delete(abs);
        if (kept.size >= maxEntries) kept.clear();
        kept.set(abs, { at: now(), res });
        return res;
      },
      () => {
        const at = started.get(abs);
        running.delete(abs);
        started.delete(abs);
        hoverSlots.delete(abs);
        // A check that failed past its deadline, whoever started it: the slow
        // window runs from the failure.
        const t = now();
        if (at !== undefined && t - at >= PATH_STAT_DEADLINE_MS) markSlow(abs, t);
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
      if (running.has(abs) || isSlow(abs) || hoverSlots.size >= MAX_HOVER_STAT_CHECKS) return undefined;
      hoverSlots.add(abs);
      void check(abs);
      return undefined;
    },
    lookForClick(abs) {
      const res = fresh(abs);
      if (res && res.exists) return Promise.resolve(res);
      return check(abs);
    }
  };
}
