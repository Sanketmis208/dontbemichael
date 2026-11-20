'use strict';

/**
 * Back up everything, restore it on a new computer
 * (docs/designs/backup-restore.md; src/main/backup.ts, backupArchive.ts,
 * backupSecrets.ts).
 *
 * Protects: a restore brings back every business as it was, under a new home
 * folder if the username differs; saved passwords travel only sealed with the
 * backup password, and a wrong one writes nothing; a crafted or cut backup can
 * never write outside its folders; the owner's own documents already on the
 * new computer are never overwritten.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const loadTs = require('./load-ts.cjs');

const archive = loadTs('src/main/backupArchive.ts');
const sealing = loadTs('src/main/backupSecrets.ts');
const backup = loadTs('src/main/backup.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function tmp(t, name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return fs.realpathSync(d);
}
const put = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); };

test('the file format: what goes in comes out the same, times kept', async (t) => {
  const d = tmp(t, 'bk-format');
  const file = path.join(d, 'a.dbmbackup');
  const big = Buffer.alloc(3 * 1024 * 1024, 7);
  put(path.join(d, 'src', 'deep', 'x.bin'), big);
  const when = new Date(2026, 0, 2).getTime();
  fs.utimesSync(path.join(d, 'src', 'deep', 'x.bin'), new Date(), new Date(when));
  const w = new archive.BackupWriter(file, { v: 1, hello: 'there' });
  const st = fs.statSync(path.join(d, 'src', 'deep', 'x.bin'));
  await w.addFile('r', 'deep/x.bin', path.join(d, 'src', 'deep', 'x.bin'), st.mode, st.mtimeMs, st.size);
  await w.addBuffer('r', 'note.txt', Buffer.from('héllo'));
  assert.deepEqual(await w.finish(), { files: 2, bytes: big.length + Buffer.byteLength('héllo') });

  assert.deepEqual(await archive.readManifest(file), { v: 1, hello: 'there' });
  const out = path.join(d, 'out');
  const res = await archive.readEntries(file, (h) => archive.safeTarget(out, h.p));
  assert.deepEqual(res, { written: 2, skipped: 0 });
  assert.ok(fs.readFileSync(path.join(out, 'deep', 'x.bin')).equals(big));
  assert.equal(fs.readFileSync(path.join(out, 'note.txt'), 'utf8'), 'héllo');
  assert.equal(Math.round(fs.statSync(path.join(out, 'deep', 'x.bin')).mtimeMs / 1000), Math.round(when / 1000), 'its own time');
});

test('a crafted backup never writes outside its folder, and a cut one is refused', async (t) => {
  const d = tmp(t, 'bk-crafted');
  for (const bad of ['../evil', '/etc/evil', 'a/../../evil', '', 'a//b', 'C:/evil']) assert.equal(archive.safeTarget(d, bad), null, bad);
  assert.equal(archive.safeTarget(d, 'a/b.txt'), path.join(d, 'a', 'b.txt'));

  const lines = [archive.BACKUP_MAGIC, JSON.stringify({ v: 1 }) + '\n', JSON.stringify({ r: 'r', p: '../evil', s: 4, m: 420, t: 0 }) + '\n', 'EVIL', JSON.stringify({ end: true }) + '\n'];
  const crafted = path.join(d, 'crafted.dbmbackup');
  fs.writeFileSync(crafted, zlib.gzipSync(Buffer.from(lines.join(''))));
  const out = path.join(d, 'out');
  const res = await archive.readEntries(crafted, (h) => archive.safeTarget(out, h.p));
  assert.deepEqual(res, { written: 0, skipped: 1 });
  assert.equal(fs.existsSync(path.join(d, 'evil')), false);

  const cut = path.join(d, 'cut.dbmbackup');
  fs.writeFileSync(cut, zlib.gzipSync(Buffer.from([archive.BACKUP_MAGIC, '{"v":1}\n', '{"r":"r","p":"a","s":100,"m":420,"t":0}\n', 'short'].join(''))));
  await assert.rejects(archive.readEntries(cut, (h) => archive.safeTarget(out, h.p)), /cut short/);
  const notOne = path.join(d, 'not.dbmbackup');
  fs.writeFileSync(notOne, zlib.gzipSync(Buffer.from('hello\n')));
  await assert.rejects(archive.readManifest(notOne), /not a backup file/);
});

test('passwords travel sealed: the right password opens them, a wrong one or a changed file never does', () => {
  const secrets = { '@abc/mail:mb1': 'bakery-pass', 'apikey:anthropic': 'sk-test' };
  const sealed = sealing.sealSecrets(secrets, 'correct horse');
  assert.ok(!JSON.stringify(sealed).includes('bakery-pass'), 'nothing readable in the file');
  assert.deepEqual(sealing.openSecrets(sealed, 'correct horse'), secrets);
  assert.throws(() => sealing.openSecrets(sealed, 'wrong horse'), /wrong password/);
  const changed = { ...sealed, data: Buffer.from('x' + Buffer.from(sealed.data, 'base64').toString('latin1').slice(1), 'latin1').toString('base64') };
  assert.throws(() => sealing.openSecrets(changed, 'correct horse'), /wrong password/);
  assert.throws(() => sealing.sealSecrets(secrets, 'short'), /too short/);
});

test('paths move to the new home folder, only whole folders', () => {
  assert.equal(backup.movePath('/Users/sam/Documents/Biz', '/Users/sam', '/Users/alex'), '/Users/alex/Documents/Biz');
  assert.equal(backup.movePath('/Users/samuel/x', '/Users/sam', '/Users/alex'), '/Users/samuel/x', 'not a prefix of another name');
  assert.equal(backup.movePath('/Volumes/Work/Biz', '/Users/sam', '/Users/alex'), '/Volumes/Work/Biz', 'outside home: as it was');
  const text = JSON.stringify({ a: '/Users/sam/Biz', b: '/Users/samuel/Biz', c: '/Users/sam' });
  assert.deepEqual(JSON.parse(backup.movePathsInText(text, '/Users/sam', '/Users/alex')), { a: '/Users/alex/Biz', b: '/Users/samuel/Biz', c: '/Users/alex' });
});

test('what the app data part carries: settings, each business\'s place and the window state; never the secrets file, the live database or caches', () => {
  const items = backup.USER_DATA_ITEMS;
  for (const k of ['config.json', 'offices', 'knowledge', 'pastes', 'mail-proposals.json', 'owner-dock-keys.json', 'Local Storage', 'config.before-offices.json']) assert.ok(items.includes(k), k);
  for (const k of ['integration-secrets.json', 'harness.db', 'harness.db-wal', 'Cache', 'GPUCache', 'opened-attachments', 'updater.log']) assert.ok(!items.includes(k), k);
});

/** A whole computer: app data, an office, a business folder with documents,
 *  Claude conversations for a team folder, secrets and a database. */
function computer(t) {
  const d = tmp(t, 'bk-e2e');
  const oldHome = path.join(d, 'Users', 'sam');
  const userData = path.join(oldHome, 'Library', 'Application Support', 'dontbemichael');
  const office = path.join(oldHome, 'HarnessAgents');
  const biz = path.join(oldHome, 'Documents', 'Harbor Bakery');
  const team = path.join(biz, 'Front desk');
  const claudeRoot = path.join(oldHome, '.claude', 'projects');
  put(path.join(userData, 'config.json'), JSON.stringify({ onboardingComplete: true, harnessHome: office, businessName: 'Harbor Bakery', businessFolder: biz, businessTeam: [{ agentId: 'pam', folder: team }] }));
  put(path.join(userData, 'knowledge', 'docs', 'a', 'meta.json'), '{"title":"menu"}');
  put(path.join(userData, 'Cache', 'junk'), 'cache');
  put(path.join(userData, 'integration-secrets.json'), '{"mail:mb1":"locked-to-this-mac"}');
  put(path.join(office, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: { god: { cwd: path.join(office, 'hive', 'agents', 'god') }, pam: { cwd: team } } }));
  put(path.join(office, 'hive', 'tasks.json'), '[]');
  put(path.join(office, 'hive', 'hooks.sock'), '');
  put(path.join(team, 'orders.xlsx'), 'orders');
  put(path.join(biz, 'menu.pdf'), 'menu');
  const key = (folder) => folder.replace(/[^a-zA-Z0-9]/g, '-');
  put(path.join(claudeRoot, key(team), 'session.jsonl'), '{"cwd":"' + team + '"}\n');
  return { d, oldHome, userData, office, biz, team, claudeRoot, key };
}

test('back up a whole computer, restore it under another username, and it is all there', async (t) => {
  const c = computer(t);
  const file = path.join(c.d, 'backup.dbmbackup');
  const done = await backup.writeBackup(file, 'correct horse', {
    userData: c.userData, home: c.oldHome, appVersion: '0.4.3', platform: 'darwin',
    config: JSON.parse(fs.readFileSync(path.join(c.userData, 'config.json'), 'utf8')),
    claudeDirFor: (folder) => { const p = path.join(c.claudeRoot, c.key(folder)); return fs.existsSync(p) ? p : null; },
    dbSnapshot: async (dest) => { fs.writeFileSync(dest, 'SQLITE'); return true; },
    secrets: () => ({ 'mail:mb1': 'bakery-pass' })
  });
  assert.ok(done.files >= 7, String(done.files));
  const summary = await backup.inspectBackup(file, path.join(c.d, 'Users', 'alex'));
  assert.deepEqual({ ...summary, createdAt: 0 }, { createdAt: 0, appVersion: '0.4.3', businesses: ['Harbor Bakery'], hasSecrets: true, fromOtherHome: true });

  // The new computer: another username, and a document of the owner's already there.
  const newHome = path.join(c.d, 'Users', 'alex');
  const newData = path.join(newHome, 'Library', 'Application Support', 'dontbemichael');
  const newClaude = path.join(newHome, '.claude', 'projects');
  put(path.join(newHome, 'Documents', 'Harbor Bakery', 'menu.pdf'), 'the owner\'s newer menu');
  let imported = null;
  let moved = null;
  const target = {
    userData: newData, home: newHome,
    claudeDirFor: (folder) => path.join(newClaude, c.key(folder)),
    importSecrets: (s) => { imported = s; return true; },
    moveDbPaths: (db, from, to) => { moved = [db, from, to]; }
  };
  await assert.rejects(backup.restoreBackup(file, 'wrong horse', target), /wrong password/);
  assert.equal(fs.existsSync(newData), false, 'a wrong password writes nothing');

  const res = await backup.restoreBackup(file, 'correct horse', target);
  assert.ok(res.written >= 6);
  const cfg = JSON.parse(fs.readFileSync(path.join(newData, 'config.json'), 'utf8'));
  assert.equal(cfg.harnessHome, path.join(newHome, 'HarnessAgents'), 'paths moved to the new home folder');
  assert.equal(cfg.businessTeam[0].folder, path.join(newHome, 'Documents', 'Harbor Bakery', 'Front desk'));
  const reg = JSON.parse(fs.readFileSync(path.join(newHome, 'HarnessAgents', 'hive', 'registry.json'), 'utf8'));
  assert.equal(reg.agents.pam.cwd, path.join(newHome, 'Documents', 'Harbor Bakery', 'Front desk'));
  assert.equal(fs.readFileSync(path.join(newHome, 'Documents', 'Harbor Bakery', 'Front desk', 'orders.xlsx'), 'utf8'), 'orders', 'the team\'s documents');
  assert.equal(fs.readFileSync(path.join(newHome, 'Documents', 'Harbor Bakery', 'menu.pdf'), 'utf8'), 'the owner\'s newer menu', 'a document already there is kept');
  assert.equal(fs.readFileSync(path.join(newData, 'knowledge', 'docs', 'a', 'meta.json'), 'utf8'), '{"title":"menu"}');
  assert.equal(fs.readFileSync(path.join(newData, 'harness.db'), 'utf8'), 'SQLITE', 'the database snapshot');
  assert.ok(fs.existsSync(path.join(newClaude, c.key(path.join(newHome, 'Documents', 'Harbor Bakery', 'Front desk')), 'session.jsonl')), 'the conversations, under the folder\'s new name');
  assert.equal(fs.existsSync(path.join(newData, 'Cache')), false, 'no caches');
  assert.equal(fs.existsSync(path.join(newData, 'integration-secrets.json')), false, 'the old computer\'s locked file never travels');
  assert.equal(fs.existsSync(path.join(newHome, 'HarnessAgents', 'hive', 'hooks.sock')), false);
  assert.deepEqual(imported, { 'mail:mb1': 'bakery-pass' }, 'secrets locked to the new computer');
  assert.deepEqual(moved, [path.join(newData, 'harness.db'), c.oldHome, newHome]);
});

test('main checks the password before it stops anything, and the app offers both in Settings and on a new computer', () => {
  const main = read('src/main/index.ts');
  const h = main.slice(main.indexOf("ipcMain.handle('backup:restore'"), main.indexOf("/** The business menu and Settings' Your businesses"));
  assert.ok(h.indexOf('await checkBackupPassword(path, password)') > 0);
  assert.ok(h.indexOf('await checkBackupPassword(path, password)') < h.indexOf("stopForReset('restore')"), 'a wrong password stops nothing');
  assert.ok(h.indexOf('restartApp(app)') > h.indexOf('await restoreBackup('));
  assert.match(main, /ipcMain\.handle\('backup:create'/);
  assert.match(main, /dbSnapshot: async \(dest\) => \{ const db = persist\.database\(\); if \(!db\) return false; await db\.backup\(dest\); return true; \}/, 'a consistent database snapshot');
  assert.match(read('src/renderer/src/components/SettingsModal.tsx'), /<BackupRestore hasOffice=\{!!config\.onboardingComplete\} \/>/);
  assert.match(read('src/renderer/src/components/OnboardingWizard.tsx'), /\{!add && !preview && step === 'business' && \(/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).backup;
  for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /[\u2013\u2014]| - |Michael/, k);
});
