'use strict';

/**
 * Pulse keyed by the office's lasting id (docs/designs/separate-businesses.md,
 * E5): rows written under the office's folder move to its id once, so moving
 * the folder keeps its history, and a factory reset of one business erases
 * its rows and marks only.
 *
 * The store needs better-sqlite3 built for Electron, so this file runs itself
 * under Electron's Node (ELECTRON_RUN_AS_NODE) and skips where no Electron
 * binary is installed, like pulse-telemetry.test.cjs.
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
  test('Pulse by office id (run under Electron\'s Node)', { skip: ok ? false : 'no Electron binary' }, () => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PULSE_UNDER_ELECTRON: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(bin, ['--test', __filename], { env, encoding: 'utf8', timeout: 300_000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /# fail 0/, 'the nested run reported its own results');
  });
  test('main files Pulse rows under the office id once settings are per office, and moves the old rows first', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
    assert.match(main, /const pulseOffice = \(\): string \| null => \{\n\s*const id = openOfficeId\(\);\n\s*if \(id\) return id;/);
    const opened = main.indexOf("try { persist.open(); }");
    const relabel = main.indexOf('try { relabelPulseOffice(); }');
    assert.ok(opened > 0 && relabel > opened, 'right after the store opens');
    assert.ok(relabel < main.indexOf('bootstrapHiveServices();', relabel), 'before any service writes to it');
  });
  return;
}

const loadTs = require('./load-ts.cjs');
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => os.tmpdir() } } };
const { PersistStore, OFFICE_TABLES, OFFICE_KV_PREFIXES } = loadTs('src/main/db.ts');

const FOLDER = '/Users/o/Offices/Harbor Bakery';
const ID = '6f1c2a90-1111-4c4c-8888-0123456789ab';

function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-office-id-'));
  const p = new PersistStore(path.join(dir, 'harness.db'));
  p.open();
  t.after(() => { p.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return p;
}

function seed(db, office) {
  db.prepare('INSERT INTO telemetry_events (office, agent_id, kind, ts, value, attrs) VALUES (?, ?, ?, ?, ?, ?)').run(office, 'pam', 'turn', 1000, 1, null);
  db.prepare('INSERT INTO owner_notes (office, agent_id, at, text, why) VALUES (?, ?, ?, ?, ?)').run(office, 'pam', '2026-11-01', 'note', 'why');
}

const count = (db, office) => OFFICE_TABLES.reduce((n, t) => n + db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE office = ?`).get(office).c, 0);

test('the folder\'s rows and marks move to the id, once', (t) => {
  const p = store(t);
  const db = p.database();
  seed(db, FOLDER);
  for (const pre of OFFICE_KV_PREFIXES) p.setKv(pre + FOLDER, { mark: pre });
  const before = count(db, FOLDER);
  assert.ok(before >= 2);

  assert.equal(p.relabelOffice(FOLDER, ID), true);
  assert.equal(count(db, FOLDER), 0, 'nothing left under the folder');
  assert.equal(count(db, ID), before, 'every row under the id');
  for (const pre of OFFICE_KV_PREFIXES) {
    assert.deepEqual(p.getKv(pre + ID), { mark: pre }, `${pre} mark moved`);
    assert.equal(p.getKv(pre + FOLDER), undefined);
  }

  // Once: rows a different office later writes under that folder stay its own.
  seed(db, FOLDER);
  assert.equal(p.relabelOffice(FOLDER, ID), true);
  assert.equal(count(db, FOLDER), 2, 'a second run moves nothing');
});

test('moving the folder keeps the history: it is under the id, not the path', (t) => {
  const p = store(t);
  seed(p.database(), FOLDER);
  p.relabelOffice(FOLDER, ID);
  // The office now lives elsewhere; its rows are found by the same id.
  assert.equal(count(p.database(), ID), 2);
  assert.equal(p.relabelOffice('/Volumes/New/Harbor Bakery', ID), true, 'already done for this id');
  assert.equal(count(p.database(), ID), 2);
});

test('a mark the id already has is kept, and a row the id already has wins', (t) => {
  const p = store(t);
  p.setKv(`pulse:backfill:${ID}`, 'newer');
  p.setKv(`pulse:backfill:${FOLDER}`, 'older');
  assert.equal(p.relabelOffice(FOLDER, ID), true);
  assert.equal(p.getKv(`pulse:backfill:${ID}`), 'newer');
});

test('a reset of one business erases its rows and marks only', (t) => {
  const p = store(t);
  const db = p.database();
  seed(db, FOLDER);
  p.relabelOffice(FOLDER, ID);
  seed(db, 'other-office-id-1234');
  p.setKv('run-compare:other-office-id-1234', { keep: true });
  assert.equal(p.eraseOffice(ID), true);
  assert.equal(count(db, ID), 0);
  for (const pre of OFFICE_KV_PREFIXES) assert.equal(p.getKv(pre + ID), undefined);
  assert.equal(count(db, 'other-office-id-1234'), 2, 'another office\'s rows stay');
  assert.deepEqual(p.getKv('run-compare:other-office-id-1234'), { keep: true });
  // Its relabel mark went too, so a new office given the same id starts clean.
  seed(db, FOLDER);
  assert.equal(p.relabelOffice(FOLDER, ID), true);
  assert.equal(count(db, ID), 2);
});

test('nothing to move: a closed store, an empty name, or the same name', (t) => {
  const p = store(t);
  assert.equal(p.relabelOffice('', ID), false);
  assert.equal(p.relabelOffice(ID, ID), false);
  p.close();
  assert.equal(p.relabelOffice(FOLDER, ID), false);
});

test('every kv key built from an office is listed, so it moves and is erased with it', () => {
  const dir = path.join(__dirname, '..', 'src', 'main');
  const found = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/`([a-z-]+:(?:[a-z-]+:)?)\$\{office\}`/g)) found.add(m[1]);
  }
  assert.ok(found.size >= 3, [...found].join(', '));
  for (const k of found) assert.ok(OFFICE_KV_PREFIXES.includes(k), `${k} is keyed by office but not listed`);
});

test('a restore under another home folder moves folder keyed rows and marks, and nothing else', (t) => {
  if (!process.env.PULSE_UNDER_ELECTRON) return;
  const p = store(t);
  const db = p.database();
  const oldOffice = '/Users/sam/HarnessAgents';
  seed(db, oldOffice);
  seed(db, '/Users/samuel/HarnessAgents');
  seed(db, ID);
  p.setKv(`pulse:state:${oldOffice}`, { at: 1 });
  p.movePathPrefix('/Users/sam', '/Users/alex');
  assert.equal(count(db, '/Users/alex/HarnessAgents'), 2, 'moved to the new home folder');
  assert.equal(count(db, oldOffice), 0);
  assert.equal(count(db, '/Users/samuel/HarnessAgents'), 2, 'another name is not a prefix match');
  assert.equal(count(db, ID), 2, 'an office id is not a path');
  assert.deepEqual(p.getKv('pulse:state:/Users/alex/HarnessAgents'), { at: 1 });
});
