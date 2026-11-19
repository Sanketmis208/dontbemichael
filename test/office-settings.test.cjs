'use strict';

/**
 * Each business's own settings (src/main/officeSettings.ts) and the office's
 * lasting id (office.json `id`, src/main/officeFile.ts), step one of
 * docs/designs/separate-businesses.md.
 *
 * Protects: two offices never read each other's business settings; an office
 * keeps its id through every save and finds its settings again when its
 * office.json is lost; every config field has exactly one home.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// Point config.ts at a throwaway userData so the real config is never touched.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'office-settings-'));
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const config = loadTs('src/main/config.ts');
const file = loadTs('src/main/officeFile.ts');
const settings = loadTs('src/main/officeSettings.ts');
const keys = loadTs('src/main/officeKeys.ts');

const configFile = path.join(userData, 'config.json');
function resetConfig(cfg) {
  fs.writeFileSync(configFile, JSON.stringify(cfg));
}

/** An office folder (hive/registry.json is what makes it one). */
function office(name) {
  const home = path.join(userData, name);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  return home;
}

const mailbox = (id, address) => ({ id, address, label: address });

test('every config field has one home: the business or the install', () => {
  const business = new Set(settings.BUSINESS_KEYS);
  const install = new Set(settings.INSTALL_KEYS);
  assert.equal(settings.BUSINESS_KEYS.length, 45, 'the 44 business fields of the plan (T3), plus setupNoticePending (E2)');
  for (const k of business) assert.ok(!install.has(k), `${k} has two homes`);
  for (const k of Object.keys(config.configDefaults())) {
    assert.ok(business.has(k) || install.has(k), `${k} has no home`);
  }
  // The build itself refuses an unplaced field (everyFieldPlacedOnce); this
  // checks the lists the runtime uses are the ones the type was built from.
  for (const k of ['businessName', 'mailboxes', 'missions', 'agentCapabilities', 'connectorsOn', 'integrations']) assert.ok(business.has(k), k);
  for (const k of ['harnessHome', 'recentHives', 'offices', 'notifications', 'autoMode']) assert.ok(install.has(k), k);
});

test('an office gets a lasting id, saved once and kept by every later save', () => {
  const home = office('id-keeps');
  assert.equal(file.readOfficeId(home), null);
  const id = file.ensureOfficeId(home);
  assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(file.ensureOfficeId(home), id, 'the same id the second time');
  assert.equal(file.readOfficeId(home), id);

  // A record holding only the id describes no business: setup sees no office
  // to continue, and the launch backfill still writes the description.
  const found = file.findOffice(home);
  assert.equal(found.record, null);
  assert.equal(found.source, null);

  const cfg = {
    onboardingComplete: true,
    harnessHome: home,
    businessName: 'Harbor Bakery',
    businessFolder: path.join(userData, 'biz', 'Harbor Bakery'),
    businessTeam: []
  };
  assert.equal(file.syncOfficeRecord(cfg), true, 'the description is written');
  const rec = file.readOfficeRecord(home);
  assert.equal(rec.id, id, 'the save kept the id');
  assert.equal(rec.businessName, 'Harbor Bakery');
  assert.equal(file.syncOfficeRecord(cfg), false, 'an unchanged description is not written again');
  assert.equal(file.ensureOfficeId(home), id);
});

test('the launch backfill describes an office whose record holds only its id', () => {
  const home = office('backfill-id-only');
  const folder = path.join(userData, 'biz', 'Corner Florist', 'Front desk');
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: { pam: { id: 'pam', cwd: folder } } }));
  const id = file.ensureOfficeId(home);
  const cfg = { onboardingComplete: true, harnessHome: home, businessName: 'Corner Florist', businessTeam: [{ agentId: 'pam', folder }] };
  assert.equal(file.backfillOfficeRecord(cfg), true);
  const rec = file.readOfficeRecord(home);
  assert.equal(rec.businessName, 'Corner Florist');
  assert.equal(rec.id, id);
});

test('no id for a folder with no office, and an unsafe id in a copied record is ignored', () => {
  assert.equal(file.ensureOfficeId(path.join(userData, 'not-an-office')), null);
  assert.equal(file.ensureOfficeId(null), null);
  const home = office('bad-id');
  fs.writeFileSync(path.join(home, 'office.json'), JSON.stringify({ version: 1, id: '../../etc', team: [] }));
  assert.equal(file.readOfficeId(home), null);
  const id = file.ensureOfficeId(home);
  assert.notEqual(id, '../../etc');
  assert.equal(file.readOfficeId(home), id, 'replaced by a safe one');
});

test('two offices never see each other\'s business settings', () => {
  const bakery = office('two-bakery');
  const realty = office('two-realty');
  const bakeryId = file.ensureOfficeId(bakery);
  const realtyId = file.ensureOfficeId(realty);
  resetConfig({ onboardingComplete: true, harnessHome: bakery, notifications: false });

  assert.equal(settings.currentOfficeId(), bakeryId);
  assert.equal(settings.updateOfficeSettings({
    businessName: 'Harbor Bakery',
    mailboxes: [mailbox('mb1', 'orders@bakery.example')],
    notifications: true // an install key: not a business setting, left out
  }), true);
  assert.equal(settings.officeSettings().businessName, 'Harbor Bakery');
  assert.equal(config.readConfig().notifications, false, 'the install key was not changed through the office');
  assert.equal(config.readStoredConfig().offices[bakeryId].settings.notifications, undefined);

  // Open the other office: it starts from the defaults, not the bakery.
  config.writeConfig({ harnessHome: realty });
  assert.equal(settings.currentOfficeId(), realtyId);
  const fresh = settings.officeSettings();
  assert.equal(fresh.businessName, undefined);
  assert.equal(fresh.mailboxes, undefined);
  assert.equal(fresh.onboardingComplete, false, 'a business with nothing saved runs setup');
  assert.ok(fresh.missions.length > 0, 'and gets the built in schedules');

  settings.updateOfficeSettings({ businessName: 'Northgate Realty', mailboxes: [mailbox('mb1', 'hello@realty.example')] });
  config.writeConfig({ harnessHome: bakery });
  const back = settings.officeSettings();
  assert.equal(back.businessName, 'Harbor Bakery');
  assert.deepEqual(back.mailboxes.map((m) => m.address), ['orders@bakery.example'], 'same mailbox id, each office its own');
});

test('a lost office.json still finds the office\'s settings by its folder', () => {
  const home = office('lost-record');
  const id = file.ensureOfficeId(home);
  resetConfig({ harnessHome: home });
  settings.updateOfficeSettings({ businessName: 'Corner Florist' });
  fs.rmSync(path.join(home, 'office.json'));
  assert.equal(settings.currentOfficeId(), id);
  assert.equal(settings.officeSettings().businessName, 'Corner Florist');
});

test('settings with nowhere to go are not saved', () => {
  const home = office('no-id');
  resetConfig({ harnessHome: home, businessName: 'Top level' });
  assert.equal(settings.currentOfficeId(), null);
  assert.equal(settings.updateOfficeSettings({ businessName: 'Lost' }), false);
  const cfg = config.readStoredConfig();
  assert.equal(cfg.offices, undefined);
  assert.equal(cfg.businessName, 'Top level', 'nothing written at the top level either');
  resetConfig({ harnessHome: null });
  assert.equal(settings.updateOfficeSettings({ businessName: 'Lost' }), false);
});

test('the pure helpers: an id from the record wins, a folder match is the fallback, stray keys are dropped', () => {
  const offices = {
    'office-aaaa1111': { home: '/Users/o/Offices/Bakery', settings: { businessName: 'Bakery', notifications: true } }
  };
  assert.equal(settings.officeIdIn({ harnessHome: '/Users/o/Offices/Bakery', offices }, 'office-bbbb2222'), 'office-bbbb2222');
  assert.equal(settings.officeIdIn({ harnessHome: '/Users/o/Offices/Bakery/', offices }, null), 'office-aaaa1111');
  assert.equal(settings.officeIdIn({ harnessHome: '/Users/o/Offices/Other', offices }, null), null);
  assert.equal(settings.officeIdIn({ harnessHome: null, offices }, null), null);

  const s = keys.settingsIn({ offices }, 'office-aaaa1111', settings.businessDefaults());
  assert.equal(s.businessName, 'Bakery');
  assert.equal('notifications' in s, false, 'an install key stored by mistake is never read as a business setting');
  assert.equal(keys.settingsIn({ offices }, '../x', settings.businessDefaults()).businessName, undefined);

  const split = settings.splitPatch({ businessName: 'B', mailboxes: [], notifications: true, harnessHome: '/x', nonsense: 1 });
  assert.deepEqual(Object.keys(split.business).sort(), ['businessName', 'mailboxes']);
  assert.deepEqual(Object.keys(split.install).sort(), ['harnessHome', 'notifications']);

  const next = settings.officesWith({ offices }, 'office-aaaa1111', '/Users/o/Moved/Bakery', { businessCity: 'Austin', notifications: false });
  assert.equal(next['office-aaaa1111'].home, '/Users/o/Moved/Bakery', 'the folder follows a move');
  assert.equal(next['office-aaaa1111'].settings.businessCity, 'Austin');
  assert.equal(next['office-aaaa1111'].settings.businessName, 'Bakery');
  assert.equal(offices['office-aaaa1111'].settings.businessCity, undefined, 'the input is not changed');

  const inst = settings.installConfig();
  for (const k of Object.keys(inst)) assert.ok(settings.INSTALL_KEYS.includes(k), k);
});
