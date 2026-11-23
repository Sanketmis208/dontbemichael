'use strict';

/**
 * Pulse keeps a card finished just before a quit (TODOS.md): the board last
 * seen is saved in harness.db with its points, so the first read after a
 * launch diffs against it instead of taking the new board as its baseline.
 * better-sqlite3 is built for Electron, so this file reruns itself under
 * Electron's own Node (ELECTRON_RUN_AS_NODE) and skips where no Electron
 * binary is installed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (!process.env.PULSE_UNDER_ELECTRON) {
  let bin = null;
  try { bin = require('electron'); } catch { bin = null; }
  const ok = typeof bin === 'string' && fs.existsSync(bin);
  test('a card finished just before a quit (run under Electron\'s Node)', { skip: ok ? false : 'no Electron binary' }, () => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PULSE_UNDER_ELECTRON: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(bin, ['--test', __filename], { env, encoding: 'utf8', timeout: 300_000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /# fail 0/, 'the nested run reported its own results');
  });
  return;
}

const loadTs = require('./load-ts.cjs');
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => os.tmpdir() } } };
const { PersistStore } = loadTs('src/main/db.ts');
const { TelemetryStore, MAX_SAVED_CARDS } = loadTs('src/main/telemetryStore.ts');

const OFFICE = 'office-id-1';
const t0 = new Date(2026, 9, 15, 9).getTime();

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-pulse-quit-'));
  const persist = new PersistStore(path.join(dir, 'harness.db'));
  persist.open();
  // Closed before the folder goes: Windows can't delete an open database.
  t.after(() => { persist.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  // A new store over the same database is the app after a quit or a crash.
  const launch = () => new TelemetryStore(() => persist.database(), () => OFFICE, () => t0);
  const done = () => persist.database().prepare("SELECT attrs FROM telemetry_events WHERE kind = 'card-status'").all()
    .map((r) => JSON.parse(r.attrs)).filter((a) => a.to === 'done').map((a) => a.id).sort();
  return { persist, launch, done };
}

const card = (id, status) => ({ id, status, assignee: 'pam' });

test('a card done in the seconds before a quit counts once on the next launch; one done and counted before does not count again', (t) => {
  // Value: protects=Tasks done across a quit; fails_when=the first read after a launch takes the board as its baseline, so a card done after the last poll is never counted, or the saved board lags its points and a card counted before the quit counts again; why_new=Codex adversarial review 2026-10-16; seam=a new TelemetryStore over the same harness.db stands in for the relaunch; no_claim=the 8 s poll itself
  const { launch, done } = setup(t);
  const s1 = launch();
  s1.tasks([card('old', 'doing'), card('late', 'doing'), card('open', 'todo')], t0);
  s1.tasks([card('old', 'done'), card('late', 'doing'), card('open', 'todo')], t0 + 8_000);
  s1.flush();
  assert.deepEqual(done(), ['old'], 'counted while the app ran');
  // `late` reaches done after the last poll, then the app quits.

  const s2 = launch();
  s2.tasks([card('old', 'done'), card('late', 'done'), card('open', 'todo')], t0 + 60_000);
  s2.tasks([card('old', 'done'), card('late', 'done'), card('open', 'todo')], t0 + 68_000);
  s2.flush();
  assert.deepEqual(done(), ['late', 'old'], 'the late card counts once, the old one is not counted again');

  const s3 = launch();
  s3.tasks([card('old', 'done'), card('late', 'done'), card('open', 'todo')], t0 + 120_000);
  s3.flush();
  assert.deepEqual(done(), ['late', 'old'], 'a further launch counts nothing new');
});

test('a point lost in a crash before its flush is counted on the next launch, not twice', (t) => {
  // Value: protects=the saved board and its points staying in step; fails_when=the board is saved apart from the points, so a crash between the two loses the card or counts it twice; why_new=the board is saved in the flush transaction; seam=a store never flushed stands in for the crash; no_claim=none beyond protects
  const { launch, done } = setup(t);
  const s1 = launch();
  s1.tasks([card('a', 'doing')], t0);
  s1.flush();
  s1.tasks([card('a', 'done')], t0 + 8_000);
  // Crash: s1 never flushes its point or its board.

  const s2 = launch();
  s2.tasks([card('a', 'done')], t0 + 60_000);
  s2.flush();
  assert.deepEqual(done(), ['a']);
});

test('with no saved board, or one that cannot be read, the first read only remembers', (t) => {
  // Value: protects=the first launch and a damaged row; fails_when=a missing or corrupt saved board throws or counts every card already done; why_new=the saved board is new; seam=none; no_claim=none beyond protects
  const { persist, launch, done } = setup(t);
  const s1 = launch();
  s1.tasks([card('a', 'done'), card('b', 'doing')], t0);
  s1.flush();
  assert.deepEqual(done(), [], 'no saved board: only remembers');

  for (const bad of ['{not json', '[]', '"done"', 'null']) {
    persist.database().prepare('UPDATE kv SET value = ? WHERE key = ?').run(bad, `pulse:cards:${OFFICE}`);
    const s = launch();
    s.tasks([card('a', 'done'), card('b', 'done')], t0 + 60_000);
    s.flush();
    assert.deepEqual(done(), [], `a saved board of ${bad} only remembers`);
  }
});

test('the saved board is capped, open cards first, and a card it left out is only remembered', (t) => {
  // Value: protects=a bounded row and no double count past the cap; fails_when=a large board is saved whole, or a card cut from the saved board counts as new and finished again; why_new=the saved board is new; seam=none; no_claim=none beyond protects
  const { persist, launch, done } = setup(t);
  const board = [];
  for (let i = 0; i < MAX_SAVED_CARDS + 10; i++) board.push(card(`d${i}`, 'done'));
  board.push(card('open', 'doing'));
  const s1 = launch();
  s1.tasks(board, t0);
  s1.flush();
  const saved = JSON.parse(persist.database().prepare('SELECT value FROM kv WHERE key = ?').get(`pulse:cards:${OFFICE}`).value);
  assert.equal(Object.keys(saved).length, MAX_SAVED_CARDS);
  assert.equal(saved.open, 'doing', 'the open card is kept');

  const s2 = launch();
  s2.tasks(board.map((c) => (c.id === 'open' ? card('open', 'done') : c)), t0 + 60_000);
  s2.flush();
  assert.deepEqual(done(), ['open'], 'the cut done cards are not counted again');
});
