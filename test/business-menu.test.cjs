'use strict';

/**
 * The business menu in the top bar (docs/designs/separate-businesses.md, DT1;
 * decisions D14, D16 to D18, D21, D22).
 *
 * Protects: every business shows with its true state (Open, Closed since,
 * Folder not found, Setup not finished); a missing folder never starts a
 * switch; the menu is a real menu for the keyboard and screen readers; it
 * only appears once each business keeps its own settings.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

let userDataNow = os.tmpdir();
const electronPath = require.resolve('electron');
require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: { app: { getPath: () => userDataNow } } };

const rows = loadTs('src/renderer/src/shell/businessMenuRows.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function office(root, name) {
  const home = path.join(root, name);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  return home;
}

test('every business with its state: open first, then by name', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'business-menu-'));
  userDataNow = userData;
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const file = loadTs('src/main/officeFile.ts');
  const settings = loadTs('src/main/officeSettings.ts');

  const bakery = office(userData, 'bakery');
  const realty = office(userData, 'realty');
  const bakeryId = file.ensureOfficeId(bakery);
  const realtyId = file.ensureOfficeId(realty);
  const config = (extra) => fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ harnessHome: bakery, ...extra }));

  config({});
  assert.deepEqual(settings.listBusinesses(), { perOffice: false, businesses: [] }, 'before the move: one business, no menu');

  config({
    officesMigrated: 1,
    offices: {
      [realtyId]: { home: realty, settings: { businessName: 'Northgate Realty', onboardingComplete: true }, closedAt: 1000 },
      [bakeryId]: { home: bakery, settings: { businessName: 'Harbor & Pine Bakery', onboardingComplete: true } },
      'office-gone-1234': { home: path.join(userData, 'moved-away'), settings: { businessName: 'Harbor & Pine Catering', onboardingComplete: true } },
      'office-new-12345': { home: path.join(userData, 'new'), settings: { onboardingComplete: false } }
    }
  });
  const list = settings.listBusinesses();
  assert.equal(list.perOffice, true);
  assert.deepEqual(list.businesses.map((b) => [b.name, b.state]), [
    ['Harbor & Pine Bakery', 'open'],
    [null, 'setup'],
    ['Harbor & Pine Catering', 'missing'],
    ['Northgate Realty', 'closed']
  ]);
  assert.equal(list.businesses.find((b) => b.state === 'closed').closedAt, 1000);

  // Closing the open office notes when, and later saves keep it.
  settings.noteOfficeClosed(5000);
  const stored = () => JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  assert.equal(stored().offices[bakeryId].closedAt, 5000);
  loadTs('src/main/config.ts').writeConfig({ businessCity: 'Austin' });
  assert.equal(stored().offices[bakeryId].closedAt, 5000, 'a settings save keeps it');
  assert.equal(stored().offices[bakeryId].settings.businessCity, 'Austin');
});

test('what each row does: a missing folder goes to Settings, an unfinished setup to the wizard, never a switch', () => {
  const row = (state) => ({ id: 'x', home: '/o', name: 'X', state });
  assert.equal(rows.rowAction(row('open')), 'none');
  assert.equal(rows.rowAction(row('closed')), 'switch');
  assert.equal(rows.rowAction(row('setup')), 'resume', 'goes on with setup over the open business (D19)');
  assert.equal(rows.rowAction(row('missing')), 'findIt');
});

test('"Closed since": the time today, the date before', () => {
  const now = new Date(2026, 10, 19, 15, 0).getTime();
  const today = rows.closedTime(new Date(2026, 10, 19, 9, 12).getTime(), now, 'en-US');
  assert.match(today, /9:12/);
  const before = rows.closedTime(new Date(2026, 10, 18, 9, 12).getTime(), now, 'en-US');
  assert.match(before, /Nov 18/);
});

test('one business: the menu holds only Add a business; two or more: the list', () => {
  const r = (id) => ({ id, home: `/${id}`, name: id, state: 'closed' });
  assert.equal(rows.showsBusinesses([r('a')]), false);
  assert.equal(rows.showsBusinesses([r('a'), r('b')]), true);
});

test('arrow keys wrap; Home and End go to the ends', () => {
  assert.equal(rows.nextIndex(0, 3, 'ArrowDown'), 1);
  assert.equal(rows.nextIndex(2, 3, 'ArrowDown'), 0);
  assert.equal(rows.nextIndex(0, 3, 'ArrowUp'), 2);
  assert.equal(rows.nextIndex(-1, 3, 'ArrowUp'), 2);
  assert.equal(rows.nextIndex(1, 3, 'Home'), 0);
  assert.equal(rows.nextIndex(1, 3, 'End'), 2);
  assert.equal(rows.nextIndex(0, 0, 'ArrowDown'), -1);
});

test('the menu is a real menu for keyboard and screen reader (D21), beside the lockup', () => {
  const menu = read('src/renderer/src/shell/BusinessMenu.tsx');
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-label=\{t\('businessMenu\.button', \{ name \}\)\}/);
  assert.match(menu, /role="menuitemradio"\n\s*aria-checked=\{row\.state === 'open'\}/);
  assert.match(menu, /maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis'/, 'long names are capped with an ellipsis');
  assert.match(menu, /title=\{name\}/, 'and the full name in a tooltip');
  assert.match(menu, /minHeight: 40/, 'rows are 40 px tall');
  assert.match(menu, /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); close\(true\); return; \}/, 'Esc closes and returns focus');
  assert.match(menu, /if \(!list\?\.perOffice\) return null;/, 'not shown before settings are per office');
  assert.match(menu, /document\.title = list\?\.perOffice && many \? t\('businessMenu\.windowTitle', \{ name, app: APP_TITLE \}\) : APP_TITLE;/, 'the window title (D22)');
  assert.match(menu, /const APP_TITLE = "Don't Be Michael";/);
  // Find it opens Settings and never switches.
  const findIt = menu.slice(menu.indexOf("if (action === 'findIt')"), menu.indexOf('void switchTo(row.home);'));
  assert.doesNotMatch(findIt, /changeHome/);
  assert.match(findIt, /cth:open-settings/);

  const bar = read('src/renderer/src/shell/TopBar.tsx');
  assert.ok(bar.indexOf('<BusinessMenu />') > bar.indexOf('cth-lockup-dark') && bar.indexOf('<BusinessMenu />') < bar.indexOf('<ViewTabs />'));
});

test('main notes when an office closes: on a switch away and on quit, not on a move', () => {
  const main = read('src/main/index.ts');
  const fn = main.slice(main.indexOf('function switchOffice('), main.indexOf('function switchOffice(') + 600);
  assert.match(fn, /\n\s*if \(mode === 'fresh'\) \{ try \{ noteOfficeClosed\(\); \}/, 'first thing in a switch, and not for a move');
  assert.match(main, /function teardownAndQuit\(\): void \{\n\s*allowQuit = true;\n\s*try \{ noteOfficeClosed\(\); \}/);
  assert.match(main, /ipcMain\.handle\('office:list', \(\) => listBusinesses\(\)\);/);
});

test('the menu\'s words: present, and no dashes', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).businessMenu;
  assert.equal(en.button, 'Business: {{name}}. Switch business');
  assert.equal(en.windowTitle, '{{name}}, {{app}}', 'the app name comes from code, like the other {{app}} strings');
  for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /[–—]| - /, `${k}: no dashes in owner copy`);
});
