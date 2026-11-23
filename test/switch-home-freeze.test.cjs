'use strict';

/**
 * A switch never lets the closing office write into the new one (2026-11-20:
 * after a switch, five members of the business just opened had the other
 * business's session ids as their resume key. The closing office's last hook
 * events and the 30 s cost sample wrote them, resolving the folder after it
 * already named the new business; src/main/index.ts switchingHome).
 *
 * Protects: the hive and the roster find the folder through one place that
 * names no business once a switch saves the new folder; that is set before
 * the folder is saved and before the old team is stopped.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const main = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');

test('the hive and the roster read the folder through the switch guard', () => {
  assert.match(main, /const currentHome = \(\): string \| null => \(switchingHome \? null : readConfig\(\)\.harnessHome \?\? null\);/);
  assert.match(main, /const hive = new HiveManager\(\s*currentHome,/);
  assert.match(main, /const roster = new RosterStore\(currentHome\);/);
});

test('set before the new folder is saved and before the old team stops', () => {
  const at = main.indexOf('  switchingHome = true;');
  assert.ok(at > 0);
  assert.ok(at < main.indexOf('writeConfig(movedOffices ? { harnessHome: newHome, offices: movedOffices } : { harnessHome: newHome });'));
  assert.ok(at < main.indexOf("try { ptyManager.killAll(); } catch (e) { console.error('[changeHome] killAll:', e); }"));
});

test('with no folder, a member\'s session is written nowhere', async (t) => {
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-switch-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  let open = home;
  const hive = new HiveManager(() => open);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  hive.recordSession('god', 'mine-1');
  open = null; // the switch has begun
  hive.recordSession('god', 'theirs-2');
  open = home;
  assert.equal(hive.registry().agents.god.sessionId, 'mine-1');
});
