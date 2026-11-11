'use strict';

/**
 * The prompts an older build saved to command_history are deleted (owner,
 * 2026-11-11), and not just from the table: the text must be gone from the
 * database files. better-sqlite3 is built for Electron, so this file reruns
 * itself under Electron's own Node (ELECTRON_RUN_AS_NODE) and skips where no
 * Electron binary is installed, like pulse-telemetry.test.cjs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (!process.env.HISTORY_UNDER_ELECTRON) {
  let bin = null;
  try { bin = require('electron'); } catch { bin = null; }
  const ok = typeof bin === 'string' && fs.existsSync(bin);
  test('saved prompts are deleted (run under Electron\'s Node)', { skip: ok ? false : 'no Electron binary' }, () => {
    // Value: protects=a failing test in this file fails the suite; fails_when=the nested run's failure is reported green; why_new=new file; seam=none; no_claim=none beyond protects
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', HISTORY_UNDER_ELECTRON: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(bin, ['--test', __filename], { env, encoding: 'utf8', timeout: 120_000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /# fail 0/, 'the nested run reported its own results');
  });
  return;
}

const loadTs = require('./load-ts.cjs');
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => os.tmpdir() } } };
const Database = require('better-sqlite3');
const { PersistStore } = loadTs('src/main/db.ts');

const SECRET = 'PROMPT-TEXT-pay-the-supplier-4417';

test('an older database loses its saved prompts, down to the bytes on disk', (t) => {
  // Value: protects=prompts an older build recorded are erased on update, not left in the file's free space; fails_when=the table survives, the text is still in harness.db or its WAL, or the other tables lose data; why_new=owner 2026-11-11; seam=real SQLite file; no_claim=copies outside harness.db (backups, Time Machine)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-history-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'harness.db');

  // An install from before this change: every migration through 6, with
  // prompts saved and a value in kv.
  const first = new PersistStore(file);
  first.open();
  const old = first.database();
  old.pragma('user_version = 6');
  old.exec(`CREATE TABLE IF NOT EXISTS command_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, cwd TEXT, text TEXT NOT NULL, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_ch_agent_ts ON command_history(agent_id, ts DESC);`);
  const add = old.prepare('INSERT INTO command_history (agent_id, cwd, text, ts) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < 200; i++) add.run('kelly', '/office', `${SECRET} ${i}`, i);
  first.setKv('window.bounds', { w: 800 });
  first.close();
  assert.ok(fs.readFileSync(file).includes(SECRET), 'the fixture really holds the prompts');

  const store = new PersistStore(file);
  store.open();
  const db = store.database();
  assert.equal(db.pragma('user_version', { simple: true }), 7);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('command_history', 'idx_ch_agent_ts')").all().length, 0, 'table and index are gone');
  assert.deepEqual(store.getKv('window.bounds'), { w: 800 }, 'other data is kept');
  store.close();

  for (const f of fs.readdirSync(dir)) {
    assert.ok(!fs.readFileSync(path.join(dir, f)).includes(SECRET), `${f}: no saved prompt text left in the file`);
  }
  // A fresh install ends at the same place.
  const fresh = new Database(path.join(dir, 'fresh.db'));
  fresh.close();
  const s2 = new PersistStore(path.join(dir, 'fresh.db'));
  s2.open();
  assert.equal(s2.database().prepare("SELECT 1 FROM sqlite_master WHERE name = 'command_history'").all().length, 0);
  s2.close();
});
