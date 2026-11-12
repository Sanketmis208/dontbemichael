/**
 * A window whose code never starts is loaded again (owner, 2026-11-10: after
 * the Mac woke from hibernation the office sat on "Opening the office…" for
 * good). The page's first script tells main it is running
 * (app:rendererStarted); until it does, a load that fails, a renderer that
 * goes away, or a page still silent after BOOT_WAIT_MS loads the app again,
 * at most MAX_RELOADS times in a row, so a page that can never start is not
 * reloaded in a loop. A start resets the count.
 *
 *   navigation starts ──▶ waiting ──(started)──▶ running
 *          ▲                 │  fail / gone / silent BOOT_WAIT_MS
 *          └──── reload ◀────┘  (up to MAX_RELOADS, then it stops and logs)
 *
 * The timers and the reload are passed in, so the tests drive it with a fake
 * clock. No electron imports.
 */

/** Long enough for a cold dev start (Vite bundling on first load), far longer
 *  than a packaged start. */
export const BOOT_WAIT_MS = 30_000;
/** A failed load is tried again after this, not at once. */
export const RETRY_MS = 2_000;
export const MAX_RELOADS = 3;
/** Chromium's ERR_ABORTED: a navigation replaced by another, not a failure. */
export const ERR_ABORTED = -3;

export interface BootWatchdogDeps {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  /** Load the app's page again from scratch (not reload(): after a failure the
   *  current address may be an error page). */
  reload: () => void;
  log: (line: string) => void;
}

export interface BootWatchdog {
  /** A main frame navigation began (the first load, a reload, Vite's reload). */
  navigationStarted(): void;
  /** The page's first script ran. */
  started(): void;
  /** The main frame failed to load, with Chromium's error code. */
  loadFailed(code: number): void;
  /** The renderer process went away (crashed, killed by the OS). */
  rendererGone(reason: string): void;
  /** The window closed. */
  dispose(): void;
}

export function createBootWatchdog(deps: BootWatchdogDeps): BootWatchdog {
  let timer: unknown = null;
  let running = false;
  let reloads = 0;
  let disposed = false;

  const stop = (): void => { if (timer !== null) { deps.clearTimer(timer); timer = null; } };
  const arm = (fn: () => void, ms: number): void => { stop(); timer = deps.setTimer(() => { timer = null; fn(); }, ms); };
  const again = (why: string): void => {
    if (disposed) return;
    if (reloads >= MAX_RELOADS) {
      deps.log(`[boot] the window's code did not start (${why}); gave up after ${MAX_RELOADS} reloads`);
      return;
    }
    reloads++;
    deps.log(`[boot] the window's code did not start (${why}); loading it again (${reloads} of ${MAX_RELOADS})`);
    deps.reload();
  };

  return {
    navigationStarted() {
      if (disposed) return;
      running = false;
      arm(() => { if (!running) again('silent'); }, BOOT_WAIT_MS);
    },
    started() {
      running = true;
      reloads = 0;
      stop();
    },
    loadFailed(code) {
      if (disposed || code === ERR_ABORTED) return;
      running = false;
      arm(() => again(`load failed ${code}`), RETRY_MS);
    },
    rendererGone(reason) {
      if (disposed) return;
      running = false;
      arm(() => again(`renderer ${reason}`), RETRY_MS);
    },
    dispose() {
      disposed = true;
      stop();
    }
  };
}
