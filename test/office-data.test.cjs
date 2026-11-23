'use strict';

/**
 * A business's secrets and files in the app's data folder, once settings are
 * per office (docs/designs/separate-businesses.md, E3 part 2): saved passwords
 * and keys under the office id, the journals, approvals, dock keys, pasted
 * images and knowledge in userData/offices/<id>, and a factory reset that
 * erases only the open business.
 *
 * Protects: one business never reads another's password or key, the move
 * keeps the business's files and secrets, and a reset of one business leaves
 * the others whole.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'office-data-'));
// A stand in for the OS secret store: reversible, so a test can read back.
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`enc:${s}`),
  decryptString: (b) => b.toString().replace(/^enc:/, '')
};
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData }, safeStorage } };
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const config = loadTs('src/main/config.ts');
const file = loadTs('src/main/officeFile.ts');
const settings = loadTs('src/main/officeSettings.ts');
const integrations = loadTs('src/main/integrations.ts');
const reset = loadTs('src/main/factoryReset.ts');

const configFile = path.join(userData, 'config.json');
const secretsFile = path.join(userData, 'integration-secrets.json');
const quiet = () => {};

let n = 0;
function office(name, team = []) {
  n += 1;
  const home = path.join(userData, 'homes', `${name}-${n}`);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  const agents = { god: { id: 'god', cwd: path.join(home, 'hive', 'agents', 'god') } };
  for (const m of team) agents[m.agentId] = { id: m.agentId, cwd: m.folder };
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents }));
  return home;
}

/** A clean data folder with the bakery open, not moved yet. */
function bakeryBeforeTheMove(extra = {}) {
  for (const e of fs.readdirSync(userData)) if (e !== 'homes') fs.rmSync(path.join(userData, e), { recursive: true, force: true });
  const folder = path.join(userData, 'biz', `Harbor Bakery ${n}`);
  const team = [{ agentId: 'pam', folder: path.join(folder, 'Front desk') }];
  const home = office('bakery', team);
  fs.writeFileSync(configFile, JSON.stringify({
    onboardingComplete: true, harnessHome: home, recentHives: [home],
    businessName: 'Harbor Bakery', businessFolder: folder, businessTeam: team,
    mailboxes: [{ id: 'mb1', address: 'orders@bakery.example', label: 'Orders' }],
    ...extra
  }));
  return { home, folder, team };
}

test('before the move a business\'s files stay where they always were', () => {
  bakeryBeforeTheMove();
  assert.equal(config.officeDataPath('pastes'), path.join(userData, 'pastes'));
  assert.equal(config.openOfficeId(), null);
  assert.equal(integrations.setSecret('mail:mb1', 'bakery-pass').ok, true);
  assert.ok('mail:mb1' in JSON.parse(fs.readFileSync(secretsFile, 'utf8')));
});

test('the move keeps the business\'s secrets and files, and the old keys stay for a downgrade', () => {
  const { home } = bakeryBeforeTheMove();
  integrations.setSecret('mail:mb1', 'bakery-pass');
  integrations.setSecret('apikey:anthropic', 'sk-bakery');
  fs.writeFileSync(path.join(userData, 'mail-proposals.json'), '[]');
  fs.writeFileSync(path.join(userData, 'owner-dock-keys.json'), '["k1"]');
  fs.mkdirSync(path.join(userData, 'pastes'));
  fs.writeFileSync(path.join(userData, 'pastes', 'p1.png'), 'png');
  fs.mkdirSync(path.join(userData, 'knowledge', 'docs'), { recursive: true });

  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  const id = file.readOfficeId(home);
  const mine = path.join(userData, 'offices', id);

  assert.equal(config.officeDataPath('pastes'), path.join(mine, 'pastes'));
  for (const f of ['mail-proposals.json', 'owner-dock-keys.json', 'pastes', 'knowledge']) {
    assert.ok(fs.existsSync(path.join(mine, f)), `${f} moved into the office`);
    assert.ok(!fs.existsSync(path.join(userData, f)), `${f} not left behind`);
  }
  assert.equal(fs.readFileSync(path.join(mine, 'pastes', 'p1.png'), 'utf8'), 'png');

  assert.equal(integrations.getSecret('mail:mb1'), 'bakery-pass', 'the same password after the move');
  assert.equal(integrations.getSecret('apikey:anthropic'), 'sk-bakery');
  const blob = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
  assert.ok('mail:mb1' in blob, 'the key from before the move is still in the file');
  assert.ok(`@${id}/mail:mb1` in blob);
});

test('another business never reads this one\'s password, and keeps its own under the same id', () => {
  const { home, folder, team } = bakeryBeforeTheMove();
  integrations.setSecret('mail:mb1', 'bakery-pass');
  const realtyFolder = path.join(userData, 'biz', `Northgate ${n}`);
  const realtyTeam = [{ agentId: 'dwight', folder: path.join(realtyFolder, 'Listings') }];
  const realty = office('realty', realtyTeam);
  fs.writeFileSync(path.join(realty, 'office.json'), JSON.stringify({ version: 1, businessName: 'Northgate Realty', businessFolder: realtyFolder, team: realtyTeam }));
  config.writeConfig({ recentHives: [home, realty] });
  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  void folder; void team;

  config.writeConfig({ harnessHome: realty });
  settings.adoptOpenOffice();
  assert.equal(integrations.getSecret('mail:mb1'), undefined, 'the bakery\'s password is not the realty\'s');
  assert.equal(integrations.hasSecret('mail:mb1'), false);
  assert.equal(integrations.setSecret('mail:mb1', 'realty-pass').ok, true);
  assert.equal(integrations.getSecret('mail:mb1'), 'realty-pass');

  config.writeConfig({ harnessHome: home });
  assert.equal(integrations.getSecret('mail:mb1'), 'bakery-pass', 'each keeps its own');

  const realtyId = file.readOfficeId(realty);
  assert.equal(integrations.deleteOfficeSecrets(realtyId), true);
  const blob = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
  assert.equal(Object.keys(blob).some((k) => k.startsWith(`@${realtyId}/`)), false);
  assert.equal(integrations.getSecret('mail:mb1'), 'bakery-pass', 'a reset of one leaves the other');
});

test('a knowledge store the owner placed elsewhere stays where it is', () => {
  bakeryBeforeTheMove({ knowledgeGraph: { enabled: true, rootPath: path.join(userData, 'elsewhere-kg') } });
  fs.mkdirSync(path.join(userData, 'knowledge'), { recursive: true });
  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  assert.ok(fs.existsSync(path.join(userData, 'knowledge')), 'the app\'s own store was not in use, and is left alone');
});

test('a move that stopped midway keeps what it already moved', () => {
  const { home } = bakeryBeforeTheMove();
  const id = file.ensureOfficeId(home);
  fs.mkdirSync(path.join(userData, 'offices', id), { recursive: true });
  fs.writeFileSync(path.join(userData, 'offices', id, 'mail-proposals.json'), '["moved"]');
  fs.writeFileSync(path.join(userData, 'mail-proposals.json'), '["older"]');
  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  assert.equal(fs.readFileSync(path.join(userData, 'offices', id, 'mail-proposals.json'), 'utf8'), '["moved"]');
});

test('a factory reset of one business erases its own place, entry and secrets only', () => {
  const { home } = bakeryBeforeTheMove();
  const other = office('other');
  config.writeConfig({ recentHives: [home, other] });
  assert.equal(settings.migrateToOfficeSettings(quiet), 'done');
  const id = file.readOfficeId(home);
  const otherId = file.readOfficeId(other);
  fs.mkdirSync(path.join(userData, 'offices', otherId), { recursive: true });
  fs.writeFileSync(path.join(userData, 'offices', otherId, 'mail-proposals.json'), '[]');
  fs.writeFileSync(path.join(userData, 'harness.db'), 'db');
  fs.mkdirSync(path.join(userData, 'offices', id, 'pastes'), { recursive: true });

  const failed = reset.eraseOfficeData({ home, userData, officeId: id });
  assert.deepEqual(failed, []);
  assert.ok(!fs.existsSync(path.join(userData, 'offices', id)), 'its own place is gone');
  assert.ok(fs.existsSync(path.join(userData, 'offices', otherId, 'mail-proposals.json')), 'another office\'s stays');
  assert.ok(fs.existsSync(path.join(userData, 'harness.db')), 'the shared database stays (its rows are erased by office)');
  assert.ok(fs.existsSync(path.join(userData, 'config.json')));

  config.writeConfig({ notifications: false });
  config.forgetOffice(id);
  const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(stored.offices[id], undefined, 'its settings are gone');
  assert.ok(stored.offices[otherId], 'the other business\'s stay');
  assert.equal(stored.notifications, false, 'install settings stay');
  assert.equal(stored.officesMigrated, 1);
});

test('the database rows erased by office are every table with an office column', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'db.ts'), 'utf8');
  const withOffice = [...src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([^;]*?)\);/gs)]
    .filter((m) => /\boffice\s+TEXT/.test(m[2])).map((m) => m[1]).sort();
  assert.deepEqual([...loadTs('src/main/db.ts').OFFICE_TABLES].sort(), withOffice);
});

test('the reset keeps the store open for this business\'s rows, and forgets only its settings', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const body = main.slice(main.indexOf("ipcMain.handle('app:resetAll'"), main.indexOf('restartApp(app);', main.indexOf("ipcMain.handle('app:resetAll'")));
  assert.match(body, /stopForReset\('reset', \{ keepPersist: !!resetOfficeId \}\)/);
  assert.match(body, /officeId: resetOfficeId/);
  assert.match(body, /persist\.eraseOffice\(office\)/);
  assert.match(body, /forgetOffice\(resetOfficeId\)/);
});

// Value: protects=a move of the business files that fails partway puts back what it moved, so the launch runs on the old places with nothing missing and the next launch moves them all; fails_when=moveIntoOffice leaves some files in offices/<id> while the app still reads userData (pre-landing review, outside voice); seam=none; no_claim=real disk errors (a folder in the way stands in for one)
test('a move of the business files that fails partway puts back what it moved', () => {
  const id = 'office-rollback';
  fs.writeFileSync(path.join(userData, 'rb-one.json'), 'one');
  fs.writeFileSync(path.join(userData, 'rb-two.json'), 'two');
  // The third cannot move: where its folder would go, a file is in the way.
  fs.mkdirSync(path.join(userData, 'offices', id), { recursive: true });
  fs.writeFileSync(path.join(userData, 'offices', id, 'sub'), 'a file where a folder goes');
  fs.mkdirSync(path.join(userData, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'sub', 'x.json'), 'x');
  assert.equal(config.moveIntoOffice(id, ['rb-one.json', 'rb-two.json', 'sub/x.json']), false);
  assert.equal(fs.readFileSync(path.join(userData, 'rb-one.json'), 'utf8'), 'one', 'put back');
  assert.equal(fs.readFileSync(path.join(userData, 'rb-two.json'), 'utf8'), 'two', 'put back');
  assert.equal(fs.existsSync(path.join(userData, 'offices', id, 'rb-one.json')), false);
  assert.equal(fs.readFileSync(path.join(userData, 'sub', 'x.json'), 'utf8'), 'x');
});
