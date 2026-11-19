'use strict';

/**
 * The move of the business settings from the top of config.json into
 * `offices[<id>]` (migrateToOfficeSettings, src/main/officeSettings.ts;
 * docs/designs/separate-businesses.md, E2 and decision D11).
 *
 * Protects: an install with one office runs the same business after the move;
 * another business's office never gets these settings; a crash midway loses
 * nothing; a copy of the old config is kept for a downgrade.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'office-migration-'));
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const config = loadTs('src/main/config.ts');
const file = loadTs('src/main/officeFile.ts');
const settings = loadTs('src/main/officeSettings.ts');

const configFile = path.join(userData, 'config.json');
const frozenFile = path.join(userData, settings.CONFIG_BEFORE_OFFICES);
const quiet = () => {};

let n = 0;
/** A fresh userData config and a fresh set of folders for one test. */
function scene() {
  n += 1;
  const root = path.join(userData, `scene-${n}`);
  fs.mkdirSync(root, { recursive: true });
  fs.rmSync(frozenFile, { force: true });
  return root;
}

function office(root, name, team, record) {
  const home = path.join(root, name);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  const agents = { god: { id: 'god', cwd: path.join(home, 'hive', 'agents', 'god') } };
  for (const m of team) agents[m.agentId] = { id: m.agentId, cwd: m.folder };
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents }));
  if (record) fs.writeFileSync(path.join(home, 'office.json'), JSON.stringify({ version: 1, ...record }));
  return home;
}

function teamIn(folder, ids) {
  return ids.map((agentId) => ({ agentId, folder: path.join(folder, agentId) }));
}

function writeRaw(cfg) {
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
}
const raw = () => JSON.parse(fs.readFileSync(configFile, 'utf8'));

function bakery(root, home, extra = {}) {
  const folder = path.join(root, 'biz', 'Harbor Bakery');
  return {
    onboardingComplete: true,
    harnessHome: home,
    recentHives: [home],
    businessName: 'Harbor Bakery',
    businessCity: 'Austin',
    businessType: 'restaurant-food',
    businessFolder: folder,
    businessTeam: teamIn(folder, ['oscar', 'pam']),
    businessTeamStarted: true,
    mailboxes: [{ id: 'mb1', address: 'orders@bakery.example', label: 'Orders' }],
    agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['mb1'] } } },
    missions: [{ id: 'm1', name: 'Morning orders', prompt: 'Check orders', target: 'pam', everyMinutes: 60, enabled: true }],
    connectorsOn: { gmail: true },
    notifications: false,
    autoMode: true,
    ...extra
  };
}

test('one office: the same business, the same settings, after the move', () => {
  const root = scene();
  const folder = path.join(root, 'biz', 'Harbor Bakery');
  const home = office(root, 'office', teamIn(folder, ['oscar', 'pam']));
  writeRaw(bakery(root, home));
  const before = config.readConfig();
  const original = fs.readFileSync(configFile, 'utf8');

  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');

  const id = file.readOfficeId(home);
  assert.ok(id, 'the office got its id');
  assert.equal(settings.currentOfficeId(), id);
  const after = settings.officeSettings();
  for (const k of settings.BUSINESS_KEYS) {
    if (k === 'setupNoticePending') continue;
    assert.deepEqual(after[k], before[k], `${k} is the same after the move`);
  }
  assert.equal(after.setupNoticePending, undefined, 'no notice for the business itself');

  const stored = raw();
  for (const k of settings.BUSINESS_KEYS) assert.equal(k in stored, false, `${k} left the top level`);
  assert.equal(stored.officesMigrated, 1);
  assert.equal(stored.notifications, false, 'install settings stay');
  assert.equal(stored.autoMode, true);
  assert.equal(stored.harnessHome, home);
  assert.equal(fs.readFileSync(frozenFile, 'utf8'), original, 'the old config is kept as it was');

  assert.equal(settings.migrateToOfficeSettings(quiet), 'already', 'it runs once');
});

test('several offices: by team match (D11), another business keeps only its identity, the rest run setup', () => {
  const root = scene();
  const folder = path.join(root, 'biz', 'Harbor Bakery');
  const realtyFolder = path.join(root, 'biz', 'Northgate Realty');
  const open = office(root, 'bakery', teamIn(folder, ['oscar', 'pam']));
  // The same business in an older folder (left behind after a move).
  const oldCopy = office(root, 'bakery-old', teamIn(folder, ['oscar', 'pam']));
  // Another business, described by its office.json.
  const realty = office(root, 'realty', teamIn(realtyFolder, ['oscar', 'dwight']), {
    businessName: 'Northgate Realty', businessCity: 'Denver', businessFolder: realtyFolder, team: teamIn(realtyFolder, ['oscar', 'dwight'])
  });
  // An office with a team elsewhere and nothing to say who it is.
  const unknown = office(root, 'unknown', teamIn(path.join(root, 'biz', 'Somewhere'), ['kelly']));
  writeRaw(bakery(root, open, { recentHives: [open, oldCopy, realty, unknown, path.join(root, 'deleted')] }));

  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  const offices = raw().offices;
  const of = (home) => offices[file.readOfficeId(home)].settings;

  assert.equal(of(open).businessName, 'Harbor Bakery');
  assert.equal(of(oldCopy).businessName, 'Harbor Bakery', 'the same team elsewhere is the same business');
  assert.equal(of(oldCopy).mailboxes.length, 1);

  const r = of(realty);
  assert.equal(r.businessName, 'Northgate Realty');
  assert.equal(r.businessCity, 'Denver');
  assert.deepEqual(r.businessTeam.map((m) => m.agentId), ['oscar', 'dwight']);
  assert.equal(r.onboardingComplete, true);
  assert.equal(r.setupNoticePending, true, 'the owner is told its mail and schedules did not carry over');
  assert.equal(r.mailboxes, undefined, 'none of the bakery\'s mailboxes');
  assert.equal(r.agentCapabilities, undefined, 'none of its grants');
  assert.equal(r.connectorsOn, undefined, 'none of its connectors');
  assert.ok(!JSON.stringify(r).includes('Morning orders'), 'none of its schedules');

  assert.deepEqual(of(unknown), {}, 'nothing to go on: setup runs');
  assert.equal(Object.keys(offices).length, 4, 'a recent folder that is gone gets nothing');

  config.writeConfig({ harnessHome: unknown });
  assert.equal(settings.officeSettings().onboardingComplete, false);
});

test('a business with no team yet moves to its open office', () => {
  const root = scene();
  const home = office(root, 'solo', []);
  writeRaw(bakery(root, home, { businessTeam: [] }));
  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  assert.equal(settings.officeSettings().businessName, 'Harbor Bakery');
  assert.equal(settings.officeSettings().mailboxes.length, 1);
});

test('setup not finished: what was typed so far goes to the open office', () => {
  const root = scene();
  const home = office(root, 'new', []);
  writeRaw({ onboardingComplete: false, harnessHome: home, recentHives: [home], businessName: 'Corner Florist' });
  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  const s = settings.officeSettings();
  assert.equal(s.businessName, 'Corner Florist');
  assert.equal(s.onboardingComplete, false);
});

test('nothing changes while the open office is missing, or none is open yet', () => {
  const root = scene();
  writeRaw(bakery(root, path.join(root, 'moved-away')));
  const before = fs.readFileSync(configFile, 'utf8');
  assert.equal(settings.migrateToOfficeSettings(quiet), 'waiting');
  assert.equal(fs.readFileSync(configFile, 'utf8'), before);
  assert.equal(fs.existsSync(frozenFile), false);

  writeRaw({ onboardingComplete: false, harnessHome: null, businessName: 'Typed before a folder was picked' });
  assert.equal(settings.migrateToOfficeSettings(quiet), 'waiting');
  assert.equal(raw().businessName, 'Typed before a folder was picked');
});

test('a run that stopped midway resumes: entries and the first copy are kept', () => {
  const root = scene();
  const folder = path.join(root, 'biz', 'Harbor Bakery');
  const home = office(root, 'office', teamIn(folder, ['oscar', 'pam']));
  const id = file.ensureOfficeId(home);
  const original = JSON.stringify(bakery(root, home), null, 2);
  // The copy and the entry were written, then the app stopped before the top
  // level was cleared (and the owner changed the city on the old build).
  fs.writeFileSync(frozenFile, original);
  writeRaw({ ...bakery(root, home, { businessCity: 'Round Rock' }), offices: { [id]: { home, settings: { businessName: 'Harbor Bakery', businessCity: 'Austin' } } } });

  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  assert.equal(fs.readFileSync(frozenFile, 'utf8'), original, 'the first copy is never overwritten');
  assert.equal(settings.officeSettings().businessCity, 'Austin', 'the entry already written is kept');
  assert.equal('businessCity' in raw(), false);
});

test('the pure rule: identity only from a record that describes a business', () => {
  const cfg = { businessName: 'Harbor Bakery', mailboxes: [{ id: 'mb1' }], notifications: true };
  const mine = settings.settingsForMigration(cfg, { home: '/o', id: 'office-aaaa1111', isThisBusiness: true, record: null });
  assert.equal(mine.outcome, 'business');
  assert.deepEqual(Object.keys(mine.settings).sort(), ['businessName', 'mailboxes'], 'install keys never go into an office');
  const idOnly = settings.settingsForMigration(cfg, { home: '/o', id: 'office-aaaa1111', isThisBusiness: false, record: { version: 1, id: 'office-aaaa1111', team: [] } });
  assert.equal(idOnly.outcome, 'setup');
});
