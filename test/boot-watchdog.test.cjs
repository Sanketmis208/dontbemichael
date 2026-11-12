'use strict';

/**
 * A window whose code never starts is loaded again (src/main/bootWatchdog.ts;
 * owner, 2026-11-10: after a wake from hibernation the office sat on
 * "Opening the office…" for good). The rules run on a fake clock; the wiring
 * is pinned in the source.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const W = loadTs('src/main/bootWatchdog.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

/** A fake clock: timers fire only when the test advances time. */
function harness() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  const log = [];
  let reloads = 0;
  const dog = W.createBootWatchdog({
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    reload: () => { reloads++; },
    log: (line) => log.push(line)
  });
  const advance = (ms) => {
    now += ms;
    for (const [id, t] of [...timers]) if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn(); }
  };
  return { dog, advance, log, reloads: () => reloads, pending: () => timers.size };
}

test('a page that starts in time is left alone', () => {
  // Value: protects=a normal start never reloads; fails_when=a started page is reloaded or the timer is left running; why_new=new watchdog; seam=fake clock; no_claim=Electron events (pinned below)
  const h = harness();
  h.dog.navigationStarted();
  h.advance(5_000);
  h.dog.started();
  h.advance(W.BOOT_WAIT_MS * 2);
  assert.equal(h.reloads(), 0);
  assert.equal(h.pending(), 0);
});

test('a page that stays silent is loaded again, then gives up after the cap', () => {
  // Value: protects=a stuck splash recovers, and a page that can never start is not reloaded forever; fails_when=no reload after the wait, or more than MAX_RELOADS in a row; why_new=the hibernate splash (owner, 2026-11-10); seam=fake clock; no_claim=none beyond protects
  const h = harness();
  h.dog.navigationStarted();
  h.advance(W.BOOT_WAIT_MS - 1);
  assert.equal(h.reloads(), 0, 'not before the wait');
  h.advance(1);
  assert.equal(h.reloads(), 1);
  // Each reload is a new navigation that never starts either.
  for (let i = 0; i < 10; i++) { h.dog.navigationStarted(); h.advance(W.BOOT_WAIT_MS); }
  assert.equal(h.reloads(), W.MAX_RELOADS);
  assert.match(h.log.at(-1), /gave up after 3 reloads/);
});

test('a start resets the count, so a later stall is caught again', () => {
  // Value: protects=the cap counts reloads in a row, not for the life of the window; fails_when=one bad night uses up recovery for good; why_new=new watchdog; seam=fake clock; no_claim=none beyond protects
  const h = harness();
  for (let i = 0; i < W.MAX_RELOADS; i++) { h.dog.navigationStarted(); h.advance(W.BOOT_WAIT_MS); }
  assert.equal(h.reloads(), W.MAX_RELOADS);
  h.dog.navigationStarted();
  h.dog.started();
  h.dog.navigationStarted();
  h.advance(W.BOOT_WAIT_MS);
  assert.equal(h.reloads(), W.MAX_RELOADS + 1);
});

test('a failed load or a lost renderer tries again shortly; an aborted navigation does not', () => {
  // Value: protects=a load error or a crashed renderer is retried, and a navigation replaced by another is not mistaken for a failure; fails_when=failures wait the full boot time, ERR_ABORTED triggers a reload, or a retry loops; why_new=new watchdog; seam=fake clock; no_claim=Chromium error codes beyond -3
  const h = harness();
  h.dog.navigationStarted();
  h.dog.loadFailed(W.ERR_ABORTED);
  h.advance(W.RETRY_MS);
  assert.equal(h.reloads(), 0, 'aborted is not a failure');
  h.dog.loadFailed(-102);
  h.advance(W.RETRY_MS);
  assert.equal(h.reloads(), 1);
  h.dog.rendererGone('crashed');
  h.advance(W.RETRY_MS);
  assert.equal(h.reloads(), 2);
  assert.match(h.log.join('\n'), /load failed -102[\s\S]*renderer crashed/);
});

test('a closed window never reloads', () => {
  // Value: protects=no reload on a destroyed window; fails_when=a pending timer fires after close; why_new=new watchdog; seam=fake clock; no_claim=none beyond protects
  const h = harness();
  h.dog.navigationStarted();
  h.dog.dispose();
  h.advance(W.BOOT_WAIT_MS);
  h.dog.loadFailed(-102);
  h.advance(W.RETRY_MS);
  assert.equal(h.reloads(), 0);
});

test('main watches every app window and the page says when its code runs', () => {
  // Value: protects=the watchdog is wired to the window's events and hears the page's first script; fails_when=an event, the IPC channel or the early signal drifts; why_new=new wiring; seam=source pins; no_claim=a real hibernate wake
  const main = read('src/main/index.ts');
  const win = main.slice(main.indexOf('function createWindow('), main.indexOf('/** The quit item\'s label'));
  assert.match(win, /wc\.on\('did-start-navigation', \(details\) => \{ if \(details\.isMainFrame && !details\.isSameDocument\) boot\.navigationStarted\(\); \}\)/);
  assert.match(win, /wc\.on\('did-fail-load', \(_e, code, _desc, _url, isMainFrame\) => \{ if \(isMainFrame\) boot\.loadFailed\(code\); \}\)/);
  assert.match(win, /wc\.on\('render-process-gone', \(_e, details\) => \{ if \(!allowQuit && details\.reason !== 'clean-exit'\) boot\.rendererGone\(details\.reason\); \}\)/);
  assert.match(win, /reload: \(\) => \{ if \(!win\.isDestroyed\(\)\) loadApp\(\); \}/, 'loads the app afresh, not reload() of an error page');
  assert.match(win, /boot\.dispose\(\);/);
  assert.match(main, /ipcMain\.on\('app:rendererStarted', \(evt\) => \{ bootWatchdogs\.get\(evt\.sender\.id\)\?\.started\(\); \}\)/);
  assert.match(read('src/preload/index.ts'), /rendererStarted: \(\): void => ipcRenderer\.send\('app:rendererStarted'\)/);
  const entry = read('src/renderer/src/main.tsx');
  assert.ok(entry.indexOf('window.cth?.rendererStarted?.()') > 0 && entry.indexOf('window.cth?.rendererStarted?.()') < entry.indexOf('createRoot(root)'), 'signals before the app renders');
});
