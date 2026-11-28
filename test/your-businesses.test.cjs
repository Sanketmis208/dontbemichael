'use strict';

/**
 * Settings, General, Your businesses (docs/designs/separate-businesses.md, DT2;
 * D15 to D18).
 *
 * Protects: Settings lists the same businesses as the top bar's menu, from the
 * same source; Find it only ever accepts the same office's folder; an
 * unfinished setup can be removed, and a finished business only once its
 * folder is gone and the owner confirms, never the open business;
 * nothing changes in Settings before each business keeps its own settings.
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
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function office(root, name) {
  const home = path.join(root, name);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  return home;
}

function scene(t) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'your-businesses-'));
  userDataNow = userData;
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const file = loadTs('src/main/officeFile.ts');
  const settings = loadTs('src/main/officeSettings.ts');
  const bakery = office(userData, 'bakery');
  const realty = office(userData, 'realty');
  const bakeryId = file.ensureOfficeId(bakery);
  const realtyId = file.ensureOfficeId(realty);
  const stored = () => JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
    harnessHome: bakery, officesMigrated: 1,
    offices: {
      [bakeryId]: { home: bakery, settings: { businessName: 'Harbor & Pine Bakery', onboardingComplete: true } },
      [realtyId]: { home: path.join(userData, 'realty-old-place'), settings: { businessName: 'Northgate Realty', onboardingComplete: true } },
      'office-new-12345': { home: path.join(userData, 'new'), settings: { businessName: 'Corner Florist', onboardingComplete: false } }
    }
  }));
  return { userData, file, settings, bakery, realty, bakeryId, realtyId, stored };
}

test('Find it: the business\'s own folder is accepted, and it shows as closed again', (t) => {
  const s = scene(t);
  assert.equal(s.settings.listBusinesses().businesses.find((b) => b.id === s.realtyId).state, 'missing');
  assert.deepEqual(s.settings.relocateBusiness(s.realtyId, s.realty), { ok: true });
  assert.equal(s.stored().offices[s.realtyId].home, s.realty);
  assert.equal(s.settings.listBusinesses().businesses.find((b) => b.id === s.realtyId).state, 'closed');
});

test('Find it never takes another office\'s folder', (t) => {
  const s = scene(t);
  assert.deepEqual(s.settings.relocateBusiness(s.realtyId, s.bakery), { ok: false, error: 'notThatOffice' }, 'the bakery\'s folder is not the realty\'s');
  assert.deepEqual(s.settings.relocateBusiness(s.realtyId, path.join(s.userData, 'empty')), { ok: false, error: 'notThatOffice' });
  assert.deepEqual(s.settings.relocateBusiness('office-unknown-1', s.realty), { ok: false, error: 'notFound' });
  assert.equal(s.stored().offices[s.realtyId].home, path.join(s.userData, 'realty-old-place'), 'nothing changed');
});

test('Remove: only an unfinished setup, never the open business or a finished one', (t) => {
  const s = scene(t);
  assert.equal(s.settings.removeUnfinishedBusiness(s.realtyId), false, 'a finished business stays');
  assert.equal(s.settings.removeUnfinishedBusiness(s.bakeryId), false, 'the open business stays');
  assert.equal(s.settings.removeUnfinishedBusiness('office-new-12345'), true);
  assert.equal(s.stored().offices['office-new-12345'], undefined);
  assert.equal(s.settings.removeUnfinishedBusiness('office-new-12345'), false, 'gone already');
});

test('Remove a missing business: only a finished one whose folder is gone, never the open one or one that is there', (t) => {
  // Value: protects=a business whose folder was deleted can be removed, so it stops holding its mailbox addresses and its place in the menu; fails_when=a finished business can never be removed, or Remove takes one whose folder is there, the open one, or an unfinished setup; why_new=owner 2026-11-27 (PR 736 review, a deleted business kept its addresses for good); seam=real config on disk; no_claim=what main erases with it (source pin below)
  const s = scene(t);
  assert.equal(s.settings.removeMissingBusiness(s.bakeryId), false, 'the open business stays');
  assert.equal(s.settings.removeMissingBusiness('office-new-12345'), false, 'an unfinished setup has its own Remove');
  assert.deepEqual(s.settings.relocateBusiness(s.realtyId, s.realty), { ok: true });
  assert.equal(s.settings.removeMissingBusiness(s.realtyId), false, 'its folder is there again, so it stays');
  assert.deepEqual(s.stored().offices[s.realtyId].home, s.realty);
  const cfg = s.stored();
  cfg.offices[s.realtyId].home = path.join(s.userData, 'deleted');
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  assert.equal(s.settings.removeMissingBusiness(s.realtyId), true);
  assert.equal(s.stored().offices[s.realtyId], undefined, 'its settings, mailboxes included, are gone');
  assert.equal(s.settings.listBusinesses().businesses.some((b) => b.id === s.realtyId), false, 'and it leaves the menu');
  assert.equal(s.settings.removeMissingBusiness(s.realtyId), false, 'gone already');
});

test('removing a missing business also erases its saved passwords, Pulse history and app files, behind a confirm', () => {
  // Value: protects=a removed business leaves no passwords or history behind, and the owner confirms first with Find it pointed out; fails_when=only the config entry goes, or Remove acts on one click; why_new=owner 2026-11-27; seam=source pin (main needs Electron); no_claim=the erase helpers themselves (factory reset tests)
  const main = read('src/main/index.ts');
  const start = main.indexOf("ipcMain.handle('office:removeMissing'");
  assert.ok(start > 0);
  const handler = main.slice(start, main.indexOf('\n});', start));
  assert.match(handler, /if \(typeof id !== 'string' \|\| !removeMissingBusiness\(id\)\) return false;/, 'nothing is erased unless the business really is removable');
  assert.match(handler, /integrations\.deleteOfficeSecrets\(id\)/);
  assert.match(handler, /persist\.eraseOffice\(id\)/);
  assert.match(handler, /isOfficeId\(id\)[^\n]*rmSync\(businessDataFolder\(app\.getPath\('userData'\), id\)/, 'its own app folder only, by a checked id');
  const list = read('src/renderer/src/components/YourBusinesses.tsx');
  assert.match(list, /\{row\.state === 'missing' && confirming !== row\.id && \(/, 'Remove on a missing business');
  assert.match(list, /window\.cth\.removeMissingBusiness\(row\.id\)/);
  assert.match(list, /confirming === row\.id && \(/, 'it asks first');
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).settings.business;
  assert.match(en.removeMissingConfirm, /\{\{name\}\}[^]*Find it/, 'names the business and points to Find it');
});

test('Settings lists the same businesses as the menu, and changes nothing before the move', () => {
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  const list = read('src/renderer/src/components/YourBusinesses.tsx');
  const menu = read('src/renderer/src/shell/BusinessMenu.tsx');
  assert.match(settings, /window\.cth\.listBusinesses\?\.\(\)/, 'one source for both');
  assert.match(menu, /window\.cth\.listBusinesses\?\.\(\)/);
  assert.match(list, /import \{[^}]*\browAction\b[^}]*\} from '@\/shell\/businessMenuRows';/, 'the same row rules');
  assert.match(settings, /\{perOffice \? t\('settings\.business\.title'\) : t\('settings\.general\.homeFolder'\)\}/);
  assert.match(settings, /\{!perOffice && otherOffices\.length > 0 && \(/, 'the old list only before the move');
  assert.match(settings, /perOffice\n\s*\? \['fresh', t\('settings\.business\.addHereTitle'\), t\('settings\.business\.addHereDesc'\)\] as const/, 'Start a new empty office becomes Add a business');
  // Each row: Open for a closed business, Find it for a missing folder, Remove for an unfinished setup.
  assert.match(list, /\{action === 'switch' && \(/);
  assert.match(list, /\{action === 'findIt' && \(/);
  assert.match(list, /\{row\.state === 'setup' && \(/);
  assert.match(list, /window\.cth\.relocateBusiness\(row\.id, pick\.path\)/);
});

test('main answers Find it and Remove, and the words have no dashes', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /ipcMain\.handle\('office:relocate'/);
  assert.match(main, /ipcMain\.handle\('office:removeUnfinished'/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).settings.business;
  assert.equal(en.title, 'Your businesses');
  assert.equal(en.addHereTitle, 'Add a business here');
  for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /[–—]| - |Michael/, `${k}: no dashes, and no hardcoded name`);
});
