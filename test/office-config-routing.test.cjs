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

// Value: protects=a copied office gets its own entry without the original's business folder, so two businesses never share one; fails_when=adoptOpenOffice copies businessFolder or the old officeFolder launch fills it from; why_new=the copy test above has no business folder; seam=none; no_claim=what the copy shows the owner
test('a copied office never keeps the original\'s business folder', () => {
  const home = migratedBakery();
  const id = file.readOfficeId(home);
  const docs = path.join(userData, `docs-${++n}`, 'Harbor Bakery');
  config.writeConfig({ businessFolder: docs, officeFolder: path.join(docs, 'Office') });
  const copy = path.join(userData, `copy-${++n}`);
  fs.mkdirSync(copy, { recursive: true });
  loadTs('src/main/homeFolder.ts').copyOfficeData(home, copy);
  config.writeConfig({ harnessHome: copy });
  const copyId = settings.adoptOpenOffice();
  assert.notEqual(copyId, id);
  const mine = raw().offices[copyId].settings;
  assert.equal(mine.businessFolder, undefined, 'not the original\'s folder');
  assert.equal(mine.officeFolder, undefined, 'nor the old folder launch would fill it from');
  assert.equal(mine.businessName, 'Harbor Bakery', 'the rest is copied');
  assert.equal(raw().offices[id].settings.businessFolder, docs, 'the original keeps it');
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

test('launch moves settings on every launch, with no switch, before any service starts', () => {
  // Step one is complete (owner, 2026-11-20): the move no longer waits for
  // DBM_OFFICE_SETTINGS=1, and nothing else asks for it.
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  assert.ok(!/DBM_OFFICE_SETTINGS/.test(main), 'no switch left');
  const gate = main.indexOf('const moved = migrateToOfficeSettings();');
  const move = main.indexOf('migrateToOfficeSettings()');
  assert.ok(gate > 0 && move >= gate, 'the move runs at launch');
  assert.ok(gate > main.indexOf("app.setPath('userData'"), 'after the data folder is set');
  // Before anything opens a business's journal or file, so they open in the
  // office's own place, and before any service starts.
  for (const first of ['new MailService(', 'new MailApprovals(', 'app.whenReady().then(']) {
    assert.ok(move < main.indexOf(first), `before ${first}`);
  }
});

// Value: protects=after the move, with no office open, a business field has nowhere to go and is left out, and the business's files point at offices/none, never another business's place or the top; fails_when=routedToOffice keeps the field at the top or files it under the last office, or officeDataPath falls back to userData; why_new=every routing test above has an office open; seam=none; no_claim=what the missing office screen shows (main only)
test('no office open after the move: a business field is left out, and business files go nowhere shared', () => {
  const home = migratedBakery();
  const id = file.readOfficeId(home);
  const before = JSON.stringify(raw().offices);
  const errors = [];
  const err = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try { config.writeConfig({ harnessHome: null, businessName: 'Typed with no office', notifications: true }); } finally { console.error = err; }
  assert.equal(raw().notifications, true, 'an install field is still saved');
  assert.deepEqual(businessKeysAtTop(), [], 'never at the top');
  assert.equal(JSON.stringify(raw().offices), before, 'never in another business\'s entry');
  assert.ok(errors.some((l) => /left out: businessName/.test(l)), 'and says so in the log');
  assert.equal(config.officeDataPath('pastes'), path.join(userData, 'offices', 'none', 'pastes'));
  config.writeConfig({ harnessHome: home });
  assert.equal(config.officeDataPath('pastes'), path.join(userData, 'offices', id, 'pastes'));
  assert.equal(config.readConfig().businessName, 'Harbor Bakery');
});
