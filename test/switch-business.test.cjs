'use strict';

/**
 * Switching business through closing time (docs/designs/separate-businesses.md,
 * E4, decisions D10 and D20).
 *
 * Protects: once each business keeps its own settings, a switch never cuts a
 * member off mid task. The open office closes properly first; nothing is
 * written before Michael concludes; Cancel switch keeps the office open;
 * Switch now goes at once without telling the team to go back to work.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { ClosingTimeController } = loadTs('src/main/closingTime.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function floor(t) {
  const agents = { god: { id: 'god', name: 'Michael', isGod: true }, pam: { id: 'pam', name: 'Pam' } };
  const sent = [];
  const events = [];
  const cleared = [];
  const ct = new ClosingTimeController(
    { registry: () => ({ godId: 'god', agents }), send: (msg) => sent.push(msg) },
    () => ['god', 'pam'],
    () => ({ send: (channel, ev) => { if (channel === 'app:closingTime') events.push(ev); } }),
    () => {},
    { steer: () => {}, clearSteers: (id) => cleared.push(id), removeSteer: () => {} }
  );
  t.after(() => ct.cancel());
  return { ct, sent, events, cleared };
}

const last = (a) => a[a.length - 1];

test('closing time for a switch names both businesses on every update', (t) => {
  const f = floor(t);
  assert.equal(f.ct.start({ relaunch: true, switching: { from: 'Harbor Bakery', to: 'Northgate Realty' } }).ok, true);
  assert.deepEqual(last(f.events).switching, { from: 'Harbor Bakery', to: 'Northgate Realty' });
  assert.equal(last(f.events).relaunch, true);
});

test('a plain closing carries no switch, and a cancel forgets one', (t) => {
  const f = floor(t);
  f.ct.start({ relaunch: true, switching: { from: 'Harbor Bakery', to: null } });
  f.ct.cancel();
  assert.equal(last(f.events).phase, 'cancelled');
  f.ct.start();
  assert.equal(last(f.events).switching, undefined);
});

test('a switch asked while the office is already closing: it carries on, now to open that business', (t) => {
  const f = floor(t);
  f.ct.start();
  assert.equal(f.ct.start({ relaunch: true, switching: { from: 'Harbor Bakery', to: 'Corner Florist' } }).ok, true);
  assert.deepEqual(last(f.events).switching, { from: 'Harbor Bakery', to: 'Corner Florist' });
});

test('Switch now stops waiting quietly: nobody is told to go back to work, and the bar stays', (t) => {
  const f = floor(t);
  f.ct.start({ relaunch: true, switching: { from: 'Harbor Bakery', to: 'Northgate Realty' } });
  const mails = f.sent.length;
  const evs = f.events.length;
  f.ct.stopForSwitch();
  assert.equal(f.ct.isActive(), false);
  assert.equal(f.sent.length, mails, 'no "back to work" mail');
  assert.equal(f.events.length, evs, 'no cancelled event: the bar stays until the app reopens');
  assert.ok(f.cleared.includes('god') && f.cleared.includes('pam'), 'unread closing steers are dropped');
  f.ct.stopForSwitch(); // a second press changes nothing
  assert.equal(f.sent.length, mails);
});

test('main: once settings are per office, the switch waits for closing time and writes nothing before', () => {
  const main = read('src/main/index.ts');
  const start = main.indexOf("ipcMain.handle('config:changeHome'");
  const handler = main.slice(start, main.indexOf('\n});', start));
  const close = handler.indexOf('closingTime.start({');
  assert.ok(close > 0, 'the switch starts closing time');
  assert.match(handler, /if \(readStoredConfig\(\)\.officesMigrated && hive\.enabled\(\)\) \{/);
  assert.match(handler, /pendingSwitch = \{ newHome, mode, oldHome \};\n\s*return \{ ok: true as const, closing: true as const \};/);
  assert.doesNotMatch(handler, /writeConfig\(|ptyManager\.killAll\(\)|restartApp\(/, 'nothing written or stopped while it waits');
  assert.ok(close < handler.indexOf('return switchOffice(newHome, mode, oldHome);'), 'the immediate switch is only for no Michael running');

  const fn = main.slice(main.indexOf('function switchOffice('), main.indexOf("ipcMain.handle('office:switchNow'"));
  assert.match(fn, /writeConfig\(movedOffices \? \{ harnessHome: newHome, offices: movedOffices \} : \{ harnessHome: newHome \}\);/);

  // Concluded: the switch goes. Cancel, and a hard quit, forget it.
  assert.match(main, /const s = pendingSwitch;\n\s*if \(s\) \{\n\s*pendingSwitch = null;\n\s*const r = switchOffice\(s\.newHome, s\.mode, s\.oldHome\);/);
  assert.match(main, /ipcMain\.handle\('app:cancelClosingTime', \(\) => \{ pendingSwitch = null; closingTime\.cancel\(\); \}\);/);
  assert.match(main, /ipcMain\.handle\('app:confirmClose', \(\) => \{\n\s*pendingSwitch = null;/);
  // Switch now: quiet stop, then the switch.
  const now = main.slice(main.indexOf("ipcMain.handle('office:switchNow'"), main.indexOf('\n});', main.indexOf("ipcMain.handle('office:switchNow'")));
  assert.ok(now.indexOf('closingTime.stopForSwitch();') > 0 && now.indexOf('closingTime.stopForSwitch();') < now.indexOf('switchOffice('));
});

test('main: the T2 guard holds only until settings are per office', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /if \(mode === 'fresh' && !readStoredConfig\(\)\.officesMigrated\) \{\n\s*const guard = officeSwitchGuard\(readConfig\(\), newHome\);/);
});

test('renderer: the bar says the switch, Cancel switch keeps the office, Switch now asks once', () => {
  const bar = read('src/renderer/src/components/ClosingTimeBar.tsx');
  assert.match(bar, /t\('closingBar\.switching', \{ from: sw\.from, to: toName \}\)/);
  assert.match(bar, /sw \? t\('closingBar\.cancelSwitch'\) : t\('quit\.cancelBack'\)/);
  assert.match(bar, /sw \? t\('closingBar\.switchNow'\) : t\('quit\.forceQuit'\)/);
  assert.match(bar, /t\('closingBar\.confirmSwitchPlural', \{ count: waiting \}\)/);
  assert.match(read('src/renderer/src/App.tsx'), /closing\?\.switching \? window\.cth\.switchNow\(\) : window\.cth\.confirmClose\(\)/);
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.equal((settings.match(/if \(res\.ok && res\.closing\) \{ switchingAfterClosing\(snap\); return; \}/g) || []).length, 2, 'both Settings switches step aside for the bar');

  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).closingBar;
  assert.equal(en.switching, 'Closing {{from}} to open {{to}}');
  assert.equal(en.confirmSwitchPlural, '{{count}} people are still working. Switch anyway?');
  for (const k of ['switching', 'opening', 'newBusiness', 'cancelSwitch', 'switchNow', 'confirmSwitch', 'confirmSwitchPlural', 'confirmSwitchNone', 'switchAnyway', 'switchingNow']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, `${k}: no dashes in owner copy`);
  }
});

test('the names on the bar: the business\'s own settings, else its office.json, else none', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-names-'));
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
  try {
    const file = loadTs('src/main/officeFile.ts');
    const settings = loadTs('src/main/officeSettings.ts');
    const office = (name, record) => {
      const home = path.join(userData, name);
      fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
      fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
      if (record) fs.writeFileSync(path.join(home, 'office.json'), JSON.stringify({ version: 1, team: [], ...record }));
      return home;
    };
    const bakery = office('bakery', { businessName: 'Old Name' });
    const id = file.ensureOfficeId(bakery);
    const realty = office('realty', { businessName: 'Northgate Realty' });
    const blank = office('blank');
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
      harnessHome: bakery, officesMigrated: 1, offices: { [id]: { home: bakery, settings: { businessName: 'Harbor Bakery' } } }
    }));
    assert.equal(settings.businessNameAt(bakery), 'Harbor Bakery', 'its settings win over a stale office.json');
    assert.equal(settings.businessNameAt(realty), 'Northgate Realty');
    assert.equal(settings.businessNameAt(blank), null);
    assert.equal(settings.businessNameAt(path.join(userData, 'empty')), null, 'a folder with no office: a new business');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
