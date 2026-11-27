'use strict';

/**
 * A settings move, a switch between businesses and the first open of a new
 * business each write one line to the office log (log.jsonl) with the office
 * id and the app version, so a support case can see when an office moved or
 * switched, and on which version (docs/designs/separate-businesses.md).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const { copyOfficeData } = loadTs('src/main/homeFolder.ts');
const { LOG_KIND_CLASS } = loadTs('src/shared/failureReport.ts');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/index.ts'), 'utf8');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-log-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function office(t, name) {
  const home = path.join(tmp(t), name);
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { home, hive };
}

function lines(home, kind) {
  const p = path.join(home, 'hive', 'log.jsonl');
  const all = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return kind ? all.filter((e) => e.kind === kind) : all;
}

const ID = '7f0c2a52-6a8e-4f71-9a3c-0b6b0d2f9e11';

test('a new office writes its first open line once, with the id and the version only', (t) => {
  // Value: protects=a new office says when it first opened and on which version, once; fails_when=the line is missing, repeats on a later launch, or carries a name or path; why_new=review on #726; seam=none
  const { home, hive } = office(t, 'bakery');
  assert.equal(hive.logFirstOpen(ID, '1.2.3'), true);
  hive.appendLog({ kind: 'app-start', version: '1.2.3' });
  assert.equal(hive.logFirstOpen(ID, '1.2.4'), false, 'the next launch writes nothing');
  const first = lines(home, 'office-first-open');
  assert.equal(first.length, 1);
  assert.deepEqual(Object.keys(first[0]).sort(), ['appVersion', 'kind', 'officeId', 'ts']);
  assert.equal(first[0].officeId, ID);
  assert.equal(first[0].appVersion, '1.2.3');
});

test('an office that ran before never gets a first open line', (t) => {
  // Value: protects=an office with no team, or one whose settings move this launch, is not called new; fails_when=the line depends on the team or the settings instead of the log; why_new=review on #726; seam=none
  const { home, hive } = office(t, 'realty');
  hive.appendLog({ kind: 'app-start', version: '1.2.2' });
  assert.equal(hive.logFirstOpen(ID, '1.2.3'), false);
  hive.appendLog({ kind: 'office-settings-moved', officeId: ID, appVersion: '1.2.3' });
  assert.equal(lines(home, 'office-first-open').length, 0);
  assert.equal(lines(home, 'office-settings-moved').length, 1);
});

test('a moved office keeps the switch line in the log that goes with it', (t) => {
  // Value: protects=the log the office keeps after a move has its switch line; fails_when=the line is written after the copy, into the folder left behind only; why_new=review on #726; seam=the order in switchOffice is a source pin
  const old = office(t, 'old');
  old.hive.appendLog({ kind: 'app-start', version: '1.2.3' });
  old.hive.appendLog({ kind: 'office-switch', officeId: ID, appVersion: '1.2.3' });
  const newHome = path.join(tmp(t), 'new');
  fs.mkdirSync(newHome);
  copyOfficeData(old.home, newHome);
  const moved = lines(newHome, 'office-switch');
  assert.equal(moved.length, 1);
  assert.equal(moved[0].officeId, ID);
  const fn = src.slice(src.indexOf('function switchOffice('));
  const at = (re) => fn.search(re);
  assert.ok(at(/hive\.appendLog\(\{ kind: 'office-switch', officeId: currentOfficeId\(\), appVersion: app\.getVersion\(\) \}\);/) > 0);
  assert.ok(at(/hive\.appendLog\(\{ kind: 'office-switch'/) < at(/copyOfficeData\(oldHome, newHome\)/), 'written before the copy');
  assert.ok(at(/copyOfficeData\(oldHome, newHome\)/) < at(/writeConfig\(/), 'and before config points away');
});

test('each kind is written once in the app, and the failure report knows it', (t) => {
  // Value: protects=each event has one writer and is classed for failure reports; fails_when=a second writer appears, or a kind is missing from LOG_KIND_CLASS; why_new=review on #726; seam=source pin
  const count = (re) => (src.match(re) ?? []).length;
  assert.equal(count(/kind: 'office-switch'/g), 1);
  assert.equal(count(/kind: 'office-settings-moved'/g), 1);
  assert.equal(count(/hive\.logFirstOpen\(currentOfficeId\(\), app\.getVersion\(\)\);/g), 1);
  assert.ok(src.indexOf('hive.logFirstOpen(') < src.indexOf("kind: 'app-start'"), 'before the app-start line');
  assert.match(src, /if \(settingsMovedThisLaunch\) hive\.appendLog\(\{ kind: 'office-settings-moved', officeId: currentOfficeId\(\), appVersion: app\.getVersion\(\) \}\);/);
  for (const kind of ['office-first-open', 'office-settings-moved', 'office-switch']) assert.equal(LOG_KIND_CLASS[kind], 'none', kind);
});
