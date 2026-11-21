'use strict';

/**
 * The office switch guard (officeSwitchGuard in src/main/officeFile.ts).
 *
 * Several offices share one config, and a switch changes only the folder, so
 * opening another business's office handed it this business's name, mailboxes,
 * schedules and grants. Until each office keeps its own settings
 * (docs/designs/separate-businesses.md) the switch is refused when the office
 * in the folder is not this business, or when there is no office there yet.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const file = loadTs('src/main/officeFile.ts');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-guard-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

/** An office folder with this registry and, optionally, an office.json. */
function office(name, agents, record) {
  const home = path.join(root, name);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents }));
  if (record) fs.writeFileSync(path.join(home, 'office.json'), JSON.stringify({ version: 1, ...record }));
  return home;
}

function god(home) {
  return { god: { id: 'god', cwd: path.join(home, 'hive', 'agents', 'god') } };
}

const bakeryFolder = path.join(root, 'biz', 'Harbor Bakery');
const realtyFolder = path.join(root, 'biz', 'Northgate Realty');
const bakeryTeam = [
  { agentId: 'oscar', folder: path.join(bakeryFolder, 'Finance') },
  { agentId: 'pam', folder: path.join(bakeryFolder, 'Front desk') }
];
const realtyTeam = [
  { agentId: 'oscar', folder: path.join(realtyFolder, 'Finance') },
  { agentId: 'dwight', folder: path.join(realtyFolder, 'Listings') }
];

function registryFor(home, team) {
  const agents = god(home);
  for (const m of team) agents[m.agentId] = { id: m.agentId, cwd: m.folder };
  return agents;
}

function bakeryConfig(home, extra = {}) {
  return {
    onboardingComplete: true,
    harnessHome: home,
    businessName: 'Harbor Bakery',
    businessFolder: bakeryFolder,
    businessTeam: bakeryTeam,
    ...extra
  };
}

test('the same business opens, with or without office.json', () => {
  const bare = path.join(root, 'bakery-bare');
  office('bakery-bare', registryFor(bare, bakeryTeam));
  const recorded = path.join(root, 'bakery-recorded');
  office('bakery-recorded', registryFor(recorded, bakeryTeam), { businessName: 'Harbor Bakery', businessFolder: bakeryFolder, team: bakeryTeam });

  const cfg = bakeryConfig('/elsewhere/old');
  assert.equal(file.officeSwitchGuard(cfg, bare), 'ok', 'team matches the registry, no record');
  assert.equal(file.officeSwitchGuard(cfg, recorded), 'ok', 'team matches the registry, with a record');
});

test('another business is refused, with or without office.json', () => {
  const bare = path.join(root, 'realty-bare');
  office('realty-bare', registryFor(bare, realtyTeam));
  const recorded = path.join(root, 'realty-recorded');
  office('realty-recorded', registryFor(recorded, realtyTeam), { businessName: 'Northgate Realty', businessFolder: realtyFolder, team: realtyTeam });

  const cfg = bakeryConfig('/elsewhere/old');
  assert.equal(file.officeSwitchGuard(cfg, bare), 'otherBusiness', 'a shared member id in another folder is not the same team');
  assert.equal(file.officeSwitchGuard(cfg, recorded), 'otherBusiness');
  // The name never decides: another business renamed to this one is still another.
  const sameName = path.join(root, 'realty-same-name');
  office('realty-same-name', registryFor(sameName, realtyTeam), { businessName: 'Harbor Bakery', businessFolder: realtyFolder, team: realtyTeam });
  assert.equal(file.officeSwitchGuard(cfg, sameName), 'otherBusiness', 'same name, other team');
});

test('a folder with no office would start a new business, and is refused', () => {
  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty, { recursive: true });
  const cfg = bakeryConfig('/elsewhere/old');
  assert.equal(file.officeSwitchGuard(cfg, empty), 'newBusiness');
  assert.equal(file.officeSwitchGuard(cfg, path.join(root, 'not-there')), 'newBusiness');
});

test('before setup finishes nothing carries over, so any folder opens', () => {
  const realty = path.join(root, 'realty-before-setup');
  office('realty-before-setup', registryFor(realty, realtyTeam));
  const cfg = { ...bakeryConfig('/elsewhere/old'), onboardingComplete: false };
  assert.equal(file.officeSwitchGuard(cfg, realty), 'ok');
  assert.equal(file.officeSwitchGuard(cfg, path.join(root, 'empty-2')), 'ok');
});

test('a registry that drifted from the settings still opens when office.json names this business folder', () => {
  const home = path.join(root, 'bakery-drifted');
  const renamed = [bakeryTeam[0], { agentId: 'pam', folder: path.join(bakeryFolder, 'Front Desk 2') }];
  office('bakery-drifted', registryFor(home, renamed), { businessName: 'Harbor Bakery', businessFolder: bakeryFolder, team: renamed });
  assert.equal(file.officeSwitchGuard(bakeryConfig('/elsewhere/old'), home), 'ok');
});

test('a business with no team yet: told apart by office.json, or by members outside the office', () => {
  const solo = bakeryConfig('/elsewhere/old', { businessTeam: [] });

  const mine = path.join(root, 'solo-mine');
  office('solo-mine', god(mine), { businessName: 'Harbor Bakery', businessFolder: bakeryFolder, team: [] });
  assert.equal(file.officeSwitchGuard(solo, mine), 'ok', 'same business folder on record');

  const theirs = path.join(root, 'solo-theirs');
  office('solo-theirs', god(theirs), { businessName: 'Northgate Realty', businessFolder: realtyFolder, team: [] });
  assert.equal(file.officeSwitchGuard(solo, theirs), 'otherBusiness', 'another business folder on record');

  const unknown = path.join(root, 'solo-unknown');
  office('solo-unknown', god(unknown));
  assert.equal(file.officeSwitchGuard(solo, unknown), 'ok', 'nothing to tell them apart: allowed');

  const staffed = path.join(root, 'solo-staffed');
  office('solo-staffed', registryFor(staffed, realtyTeam));
  assert.equal(file.officeSwitchGuard(solo, staffed), 'otherBusiness', 'that office has a team in its own folders');
});

test('the Settings switch asks the guard before it touches anything', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const start = src.indexOf("ipcMain.handle('config:changeHome'");
  assert.ok(start > 0, 'the switch handler is there');
  const body = src.slice(start, src.indexOf('ipcMain.handle(', start + 10));
  const guard = body.indexOf('officeSwitchGuard(readConfig(), newHome)');
  assert.ok(guard > 0, 'a fresh switch asks the guard');
  assert.ok(guard < body.indexOf('ensureHarnessHome(newHome)'), 'before the folder is made');
  assert.ok(guard < body.indexOf('writeConfig(movedOffices'), 'before the folder is saved');
});
