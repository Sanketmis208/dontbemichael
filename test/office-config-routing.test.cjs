'use strict';

/**
 * readConfig() and writeConfig() after the move to per office settings
 * (src/main/config.ts configView and routedToOffice;
 * docs/designs/separate-businesses.md, E3).
 *
 * Protects: every reader of readConfig() sees the open business only, every
 * save of a business field lands in the open office's entry, the top of
 * config.json never holds a business field again, and an office that is moved
 * or copied keeps (or copies) its settings.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'office-routing-'));
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const config = loadTs('src/main/config.ts');
const file = loadTs('src/main/officeFile.ts');
const settings = loadTs('src/main/officeSettings.ts');

const configFile = path.join(userData, 'config.json');
const raw = () => JSON.parse(fs.readFileSync(configFile, 'utf8'));
const quiet = () => {};

let n = 0;
function office(name) {
  n += 1;
  const home = path.join(userData, `${name}-${n}`);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  return home;
}

/** A migrated install with the bakery open. */
function migratedBakery() {
  fs.rmSync(path.join(userData, settings.CONFIG_BEFORE_OFFICES), { force: true });
  const home = office('bakery');
  fs.writeFileSync(configFile, JSON.stringify({
    onboardingComplete: true,
    harnessHome: home,
    recentHives: [home],
    businessName: 'Harbor Bakery',
    businessTeam: [],
    mailboxes: [{ id: 'mb1', address: 'orders@bakery.example', label: 'Orders' }],
    planPriceMonthly: 100,
    notifications: false
  }));
  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  return home;
}

const businessKeysAtTop = () => settings.BUSINESS_KEYS.filter((k) => k in raw());

test('before the move nothing changes: reads and writes use the top of config.json', () => {
  const home = office('before');
  fs.writeFileSync(configFile, JSON.stringify({ onboardingComplete: true, harnessHome: home, businessName: 'Corner Florist' }));
  assert.equal(config.readConfig().businessName, 'Corner Florist');
  config.writeConfig({ businessCity: 'Austin' });
  assert.equal(raw().businessCity, 'Austin');
  assert.equal(raw().offices, undefined);
});

test('after the move readers see the open business, and saves land in its entry', () => {
  const home = migratedBakery();
  const id = file.readOfficeId(home);
  const cfg = config.readConfig();
  assert.equal(cfg.businessName, 'Harbor Bakery');
  assert.equal(cfg.mailboxes.length, 1);
  assert.equal(cfg.notifications, false);
  assert.equal(cfg.offices, undefined, 'other businesses are never part of what readers see');

  const returned = config.writeConfig({ businessCity: 'Austin', notifications: true });
  assert.equal(returned.businessCity, 'Austin', 'a save hands back the same view a read gives');
  assert.equal(raw().offices[id].settings.businessCity, 'Austin');
  assert.equal(raw().notifications, true, 'install fields stay at the top');
  assert.deepEqual(businessKeysAtTop(), [], 'the top never holds a business field again');

  config.writeConfig({ planPriceMonthly: undefined });
  assert.equal('planPriceMonthly' in raw().offices[id].settings, false, 'a field saved as undefined is cleared');
  assert.equal(config.readConfig().planPriceMonthly, undefined);

  config.setAgentTokenCap('pam', 5000);
  assert.equal(raw().offices[id].settings.agentTokenCaps.pam, 5000);
  assert.deepEqual(businessKeysAtTop(), []);
});

test('another office open: its own settings, and saves go to it', () => {
  const bakery = migratedBakery();
  const realty = office('realty');
  const realtyId = file.ensureOfficeId(realty);
  config.writeConfig({ harnessHome: realty });
  settings.adoptOpenOffice();
  const cfg = config.readConfig();
  assert.equal(cfg.businessName, undefined, 'none of the bakery');
  assert.equal(cfg.mailboxes, undefined);
  assert.equal(cfg.onboardingComplete, false, 'a business with nothing saved runs setup');

  config.writeConfig({ businessName: 'Northgate Realty', onboardingComplete: true });
  assert.equal(raw().offices[realtyId].settings.businessName, 'Northgate Realty');

  config.writeConfig({ harnessHome: bakery });
  assert.equal(config.readConfig().businessName, 'Harbor Bakery');
  assert.equal(config.readConfig().mailboxes[0].address, 'orders@bakery.example');
});

test('a save that also opens a folder files its business fields under that folder', () => {
  migratedBakery();
  const later = path.join(userData, `not-yet-${++n}`);
  config.writeConfig({ harnessHome: later, businessName: 'New Shop', onboardingComplete: false });
  const entry = Object.entries(raw().offices).find(([, e]) => e.home === later);
  assert.ok(entry, 'kept under an id for that folder');
  assert.equal(entry[1].settings.businessName, 'New Shop');
  assert.equal(config.readConfig().businessName, 'New Shop');

  // Setup makes the office there: it takes the id its settings were filed under.
  fs.mkdirSync(path.join(later, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(later, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  assert.equal(settings.adoptOpenOffice(), entry[0]);
  assert.equal(file.readOfficeId(later), entry[0]);
  assert.equal(config.readConfig().businessName, 'New Shop');
});

test('a moved office keeps its settings; a copied one gets its own id and a copy', () => {
  const home = migratedBakery();
  const id = file.readOfficeId(home);

  // Settings, Change office folder, Move: office.json goes with the copy and
  // the entry follows the office.
  const moved = path.join(userData, `moved-${++n}`);
  fs.mkdirSync(moved, { recursive: true });
  loadTs('src/main/homeFolder.ts').copyOfficeData(home, moved);
  assert.equal(file.readOfficeId(moved), id, 'the id came with the move');
  config.writeConfig({ harnessHome: moved, offices: settings.officesAfterMove(home, moved) });
  assert.equal(settings.adoptOpenOffice(), id, 'the moved office is the same office');
  assert.equal(config.readConfig().businessName, 'Harbor Bakery');

  // The backup left behind still holds the same id: opened, it is a copy.
  config.writeConfig({ harnessHome: home });
  const copyId = settings.adoptOpenOffice();
  assert.notEqual(copyId, id);
  assert.equal(file.readOfficeId(home), copyId);
  assert.equal(config.readConfig().businessName, 'Harbor Bakery', 'the copy starts with the same settings');
  config.writeConfig({ businessCity: 'Backup Town' });
  config.writeConfig({ harnessHome: moved });
  assert.equal(config.readConfig().businessCity, undefined, 'and the two never write each other\'s');
});

test('an office moved in Finder: its entry follows it', () => {
  const home = migratedBakery();
  const id = file.readOfficeId(home);
  const found = path.join(userData, `found-${++n}`);
  fs.renameSync(home, found);
  config.writeConfig({ harnessHome: found });
  assert.equal(settings.adoptOpenOffice(), id);
  assert.equal(raw().offices[id].home, found);
  assert.equal(config.readConfig().businessName, 'Harbor Bakery');
});

test('what a save announces is the view of the open business', () => {
  migratedBakery();
  let seen = null;
  const stop = config.onConfigWritten((cfg) => { seen = cfg; });
  config.writeConfig({ businessCity: 'Austin' });
  stop();
  assert.equal(seen.businessName, 'Harbor Bakery');
  assert.equal(seen.businessCity, 'Austin');
  assert.equal(seen.offices, undefined);
});

test('a retired schedule saved in an office is never read', () => {
  const home = migratedBakery();
  const id = file.readOfficeId(home);
  const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  cfg.offices[id].settings.missions = [{ id: 'compact-maintenance', name: 'old', prompt: 'x', target: 'god', everyMinutes: 60, enabled: true }];
  fs.writeFileSync(configFile, JSON.stringify(cfg));
  assert.deepEqual(config.readConfig().missions, []);
});

test('until step one is complete, launch moves settings only when asked (DBM_OFFICE_SETTINGS=1), before any service starts', () => {
  // A dev run shares config.json with the installed app, which cannot read
  // moved settings: the move must never happen on its own yet.
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const ready = main.slice(main.indexOf('app.whenReady().then('));
  const gate = ready.indexOf("process.env.DBM_OFFICE_SETTINGS === '1' || readStoredConfig().officesMigrated");
  const move = ready.indexOf('migrateToOfficeSettings()');
  assert.ok(gate > 0 && move > gate, 'the move sits behind the switch');
  assert.ok(move < ready.indexOf('bootstrapHiveServices()'), 'and runs before the services start');
});
