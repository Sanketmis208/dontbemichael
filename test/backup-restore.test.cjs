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

test('the suggested file name has no spaces or special characters', () => {
  const name = backup.backupFileName(new Date(2026, 10, 19));
  assert.equal(name, 'Dont_Be_Michael_backup_2026_11_19.dbmbackup');
  assert.match(name, /^[A-Za-z0-9_]+\.dbmbackup$/);
  assert.match(read('src/main/index.ts'), /defaultPath: join\(app\.getPath\('documents'\), backupFileName\(\)\)/);
});

// Mac and Linux paths as written; Windows adds a drive to each (platform scoped).
test('paths move to the new home folder, only whole folders', { skip: process.platform === 'win32' }, () => {
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

// Value: protects=after the move to per office settings a backup carries every business's office, folders and name; fails_when=backupRoots reads only the top of config.json or skips offices[].home; why_new=the whole computer test uses a config from before the move; seam=none; no_claim=the Claude conversations and secrets of the second business (real files, no electron)
test('two separate businesses: the backup carries each one\'s office, folders and name', (t) => {
  const d = tmp(t, 'bk-two');
  const home = path.join(d, 'Users', 'sam');
  const office = (name) => { const o = path.join(home, name); put(path.join(o, 'hive', 'registry.json'), '{"agents":{}}'); return o; };
  const bakeryOffice = office('BakeryOffice');
  const realtyOffice = office('RealtyOffice');
  const bakery = path.join(home, 'Documents', 'Harbor Bakery');
  const bakeryTeam = path.join(bakery, 'Front desk');
  const realty = path.join(home, 'Documents', 'Northgate Realty');
  const repo = path.join(home, 'Code', 'listings-site');
  for (const f of [bakeryTeam, realty, repo]) fs.mkdirSync(f, { recursive: true });
  const config = {
    harnessHome: bakeryOffice,
    officesMigrated: 1,
    offices: {
      'office-bakery': { home: bakeryOffice, settings: { businessName: 'Harbor Bakery', businessFolder: bakery, businessTeam: [{ agentId: 'pam', folder: bakeryTeam }] } },
      // Never opened from the recent list: still carried, as its own office.
      'office-realty': { home: realtyOffice, settings: { businessName: 'Northgate Realty', businessFolder: realty, registeredRepos: [repo] } }
    }
  };
  const roots = backup.backupRoots({ config, home });
  assert.deepEqual(roots.offices.sort(), [bakeryOffice, realtyOffice].sort(), 'both offices');
  assert.deepEqual(roots.folders.sort(), [bakery, realty, repo].sort(), 'each business folder once; a team folder inside one is not taken twice');
  assert.deepEqual(roots.names.sort(), ['Harbor Bakery', 'Northgate Realty']);
});

// Value: protects=a backup with no saved secrets restores with any password, and a restore that cannot lock secrets says so; fails_when=checkBackupPassword demands a password with nothing sealed, or importSecrets false is ignored; why_new=only the sealed case is tested; seam=none; no_claim=Keychain behavior (importSecrets is a stub)
test('no secrets in the backup: no password needed; secrets that cannot be locked here are reported', async (t) => {
  const d = tmp(t, 'bk-nosecret');
  const userData = path.join(d, 'Users', 'sam', 'data');
  put(path.join(userData, 'config.json'), JSON.stringify({ onboardingComplete: true }));
  const src = { userData, home: path.join(d, 'Users', 'sam'), appVersion: '0.4.3', platform: 'darwin', config: {}, claudeDirFor: () => null, dbSnapshot: async () => false };
  const plain = path.join(d, 'plain.dbmbackup');
  await backup.writeBackup(plain, 'correct horse', { ...src, secrets: () => ({}) });
  await backup.checkBackupPassword(plain, '');
  assert.equal((await backup.inspectBackup(plain, src.home)).hasSecrets, false);

  const sealed = path.join(d, 'sealed.dbmbackup');
  await backup.writeBackup(sealed, 'correct horse', { ...src, secrets: () => ({ 'mail:mb1': 'bakery-pass' }) });
  await assert.rejects(backup.checkBackupPassword(sealed, 'wrong horse'), /wrong password/);
  const target = { userData: path.join(d, 'new'), home: src.home, claudeDirFor: () => path.join(d, 'c'), importSecrets: () => false, moveDbPaths: () => {} };
  await assert.rejects(backup.restoreBackup(sealed, 'correct horse', target), /secrets not saved/);
});

const entriesOf = async (file) => { const out = []; await archive.readEntries(file, (h) => { out.push(`${h.r}:${h.p}`); return null; }); return out; };
const restoreTarget = (d, home) => ({ userData: path.join(d, 'newdata'), home, claudeDirFor: (f) => path.join(home, '.claude', 'projects', f.replace(/[^A-Za-z0-9]/g, '-')), importSecrets: () => true, moveDbPaths: () => {} });

// Value: protects=a backup cannot name its own folders to write into the owner's home, settings, keys or login items; fails_when=restoreBackup trusts a manifest root's kind or path; why_new=safeTarget only checked entry names, not roots (pre-landing review, reproduced writing ~/.zshrc); seam=none; no_claim=symlinked homes (realpath only)
test('a crafted backup that names its own folders writes only where a team could work', async (t) => {
  const d = tmp(t, 'bk-roots');
  const home = path.join(d, 'Users', 'sam');
  put(path.join(home, '.zshrc'), 'original');
  const shop = path.join(home, 'Documents', 'Shop');
  const roots = {
    u: { kind: 'userData', path: path.join(d, 'olddata') },
    h: { kind: 'office', path: home },
    l: { kind: 'folder', path: path.join(home, 'Library', 'LaunchAgents') },
    s: { kind: 'folder', path: path.join(home, '.ssh') },
    b: { kind: 'folder', path: path.join(home, '.local', 'bin') },
    w: { kind: 'weird', path: path.join(home, 'Documents') },
    ok: { kind: 'folder', path: shop }
  };
  const file = path.join(d, 'crafted.dbmbackup');
  const w = new archive.BackupWriter(file, { v: 1, home, roots, businesses: [] });
  for (const [r, p] of [['h', '.zshrc'], ['l', 'x.plist'], ['s', 'authorized_keys'], ['b', 'tool'], ['w', 'w.txt'], ['ok', 'menu.txt']]) await w.addBuffer(r, p, Buffer.from('EVIL'));
  await w.finish();
  await backup.restoreBackup(file, '', restoreTarget(d, home));
  assert.equal(fs.readFileSync(path.join(home, '.zshrc'), 'utf8'), 'original', 'the home folder itself is never a root');
  for (const p of [['Library', 'LaunchAgents', 'x.plist'], ['.ssh', 'authorized_keys'], ['.local', 'bin', 'tool'], ['Documents', 'w.txt']]) {
    assert.equal(fs.existsSync(path.join(home, ...p)), false, p.join('/'));
  }
  assert.equal(fs.readFileSync(path.join(shop, 'menu.txt'), 'utf8'), 'EVIL', 'a business folder is restored');
  assert.equal(backup.restorableFolder(path.join(home, 'Library', 'CloudStorage', 'Dropbox', 'Shop'), home), true, 'cloud storage stays usable');
});

// Value: protects=restoring over an office that is already there replaces its files, read only git objects included, and a folder named as an office that is not one keeps what it holds; fails_when=readEntries opens existing files to write (EACCES on 0444) or office roots overwrite any folder; why_new=every restore test wrote into empty folders (pre-landing review); seam=none; no_claim=Windows read only attributes (POSIX modes only)
test('restoring over an office already there replaces its files, read only ones included', async (t) => {
  const d = tmp(t, 'bk-over');
  const home = path.join(d, 'Users', 'sam');
  const office = path.join(home, 'HarnessAgents');
  const obj = path.join(office, 'hive', '.git', 'objects', 'ab', 'cdef');
  put(path.join(office, 'hive', 'registry.json'), '{"agents":{"old":{}}}');
  put(obj, 'old object');
  fs.chmodSync(obj, 0o444);
  const notOffice = path.join(home, 'Documents', 'Stuff');
  put(path.join(notOffice, 'a.txt'), 'mine');
  const file = path.join(d, 'b.dbmbackup');
  const w = new archive.BackupWriter(file, { v: 1, home, roots: { o: { kind: 'office', path: office }, n: { kind: 'office', path: notOffice } }, businesses: [] });
  await w.addBuffer('o', 'hive/registry.json', Buffer.from('{"agents":{"new":{}}}'));
  await w.addBuffer('o', 'hive/.git/objects/ab/cdef', Buffer.from('new object'), 0o444);
  await w.addBuffer('n', 'a.txt', Buffer.from('from the backup'));
  await w.finish();
  await backup.restoreBackup(file, '', restoreTarget(d, home));
  assert.equal(fs.readFileSync(path.join(office, 'hive', 'registry.json'), 'utf8'), '{"agents":{"new":{}}}');
  assert.equal(fs.readFileSync(obj, 'utf8'), 'new object', 'a read only git object is replaced');
  assert.equal(fs.readFileSync(path.join(notOffice, 'a.txt'), 'utf8'), 'mine', 'a folder that holds no office keeps its files');
});

// Value: protects=a Claude sign in file and earlier backups never go into a backup; fails_when=walk carries .credentials.json (Windows and Linux keep the sign in there) or *.dbmbackup; why_new=no test put either where a backup walks (pre-landing review); seam=none; no_claim=the macOS Keychain (never a file)
test('a backup never carries a Claude sign in file or another backup', async (t) => {
  const d = tmp(t, 'bk-skip');
  const home = path.join(d, 'Users', 'sam');
  const userData = path.join(d, 'data');
  put(path.join(userData, 'config.json'), '{}');
  put(path.join(userData, 'offices', 'abc', 'claude', '.credentials.json'), '{"token":"x"}');
  put(path.join(userData, 'offices', 'abc', 'claude', 'settings.json'), '{}');
  const shop = path.join(home, 'Documents', 'Shop');
  put(path.join(shop, 'menu.txt'), 'menu');
  put(path.join(shop, 'Dont_Be_Michael_backup_2026_11_01.dbmbackup'), 'an older backup');
  const config = { harnessHome: path.join(home, 'NoOffice'), businessFolder: shop };
  const file = path.join(shop, 'Dont_Be_Michael_backup_2026_11_20.dbmbackup');
  await backup.writeBackup(file, 'correct horse', { userData, home, appVersion: '0.4.3', platform: 'win32', config, claudeDirFor: () => null, dbSnapshot: async () => false, secrets: () => ({}) });
  const names = await entriesOf(file);
  assert.ok(names.some((n) => n.endsWith('offices/abc/claude/settings.json')), names.join(','));
  assert.ok(names.some((n) => n.endsWith('menu.txt')));
  assert.ok(!names.some((n) => n.endsWith('.credentials.json')), 'no sign in');
  assert.ok(!names.some((n) => n.endsWith('.dbmbackup')), 'neither itself nor an older backup');
});

// Value: protects=a restore that stops partway is told to the owner, who reopens the app; fails_when=the handler restarts on a failure or the panel drops the message; why_new=the IPC path only logged the failure (pre-landing review); seam=none; no_claim=layout (source check, no DOM harness)
test('a restore that stops partway says so, and the owner reopens the app', () => {
  const main = read('src/main/index.ts');
  const h = main.slice(main.indexOf("ipcMain.handle('backup:restore'"), main.indexOf("ipcMain.handle('backup:reopen'"));
  assert.match(h, /return \{ ok: false as const, error: reason === 'secrets not saved' \? 'secretsNotSaved' : 'stopped' \};/);
  assert.ok(h.indexOf('restartApp(app)') > h.indexOf("'stopped'"), 'no restart after a failure');
  assert.match(main, /ipcMain\.handle\('backup:reopen', \(\) => \{ allowQuit = true; restartApp\(app\);/);
  assert.match(read('src/preload/index.ts'), /backupReopen: \(\): Promise<\{ ok: boolean \}> => ipcRenderer\.invoke\('backup:reopen'\)/);
  const panel = read('src/renderer/src/components/BackupRestore.tsx');
  assert.match(panel, /setState\(\{ kind: 'restoreStopped', secrets: res\.error === 'secretsNotSaved' \}\)/);
  assert.match(panel, /onClick=\{\(\) => \{ void window\.cth\.backupReopen\(\); \}\}>\{t\('backup\.reopen'\)\}/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).backup;
  for (const k of ['stopped', 'stoppedSecrets', 'reopen']) assert.ok(en[k], k);
});

// Value: protects=a link already inside a restored folder never leads a file outside it; fails_when=restore writes through a linked folder (safeTarget is only lexical); why_new=no test had a link on the disk (pre-landing review, outside voice); seam=none; no_claim=Windows junctions (POSIX links only)
test('a link already in a restored folder never takes a file outside it', { skip: process.platform === 'win32' }, async (t) => {
  const d = tmp(t, 'bk-link');
  const home = path.join(d, 'Users', 'sam');
  const shop = path.join(home, 'Documents', 'Shop');
  const outside = path.join(d, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(shop, { recursive: true });
  fs.symlinkSync(outside, path.join(shop, 'linked'));
  const file = path.join(d, 'l.dbmbackup');
  const w = new archive.BackupWriter(file, { v: 1, home, roots: { s: { kind: 'folder', path: shop }, n: { kind: 'folder', path: path.join(home, 'Documents', 'New') } }, businesses: [] });
  await w.addBuffer('s', 'linked/evil.txt', Buffer.from('EVIL'));
  await w.addBuffer('s', 'menu.txt', Buffer.from('menu'));
  await w.addBuffer('n', 'deep/a.txt', Buffer.from('a'));
  await w.finish();
  await backup.restoreBackup(file, '', restoreTarget(d, home));
  assert.equal(fs.existsSync(path.join(outside, 'evil.txt')), false, 'not through the link');
  assert.equal(fs.readFileSync(path.join(shop, 'menu.txt'), 'utf8'), 'menu');
  assert.equal(fs.readFileSync(path.join(home, 'Documents', 'New', 'deep', 'a.txt'), 'utf8'), 'a', 'a folder not there yet is made');
});

// Value: protects=a restore file that cannot be written stops the restore with its error instead of waiting forever with the office stopped; fails_when=readEntries awaits close with no error listener; why_new=every restore test wrote where it could (pre-landing review pass 2, reproduced a hang); seam=none; no_claim=a full disk (a folder in the way stands in for it)
test('a file that cannot be written stops the restore with its error, never a wait', async (t) => {
  const d = tmp(t, 'bk-stuck');
  const file = path.join(d, 's.dbmbackup');
  const w = new archive.BackupWriter(file, { v: 1 });
  await w.addBuffer('r', 'busy', Buffer.alloc(2 * 1024 * 1024, 1));
  await w.finish();
  const out = path.join(d, 'out');
  fs.mkdirSync(path.join(out, 'busy', 'inside'), { recursive: true });
  const timeout = new Promise((_, no) => { const h = setTimeout(() => no(new Error('the restore hung')), 5000); h.unref(); });
  await assert.rejects(Promise.race([archive.readEntries(file, (h) => archive.safeTarget(out, h.p)), timeout]), (e) => e.message !== 'the restore hung');
});

// Value: protects=a backup takes only folders a restore puts back, so nothing promised is left out, and Windows AppData is never a restore folder; fails_when=backupRoots and restorableFolder disagree, or AppData passes; why_new=the pass 1 fix refused dot folders on restore only (pre-landing review pass 2); seam=none; no_claim=Windows paths on a Mac (path checks only)
test('a backup takes only folders a restore puts back', (t) => {
  const d = tmp(t, 'bk-agree');
  const home = path.join(d, 'Users', 'sam');
  const hidden = path.join(home, '.work', 'listings-site');
  const shop = path.join(home, 'Documents', 'Shop');
  for (const f of [hidden, shop]) fs.mkdirSync(f, { recursive: true });
  const roots = backup.backupRoots({ config: { businessFolder: shop, registeredRepos: [hidden] }, home });
  assert.deepEqual(roots.folders, [shop], 'a folder under a dot folder is not promised');
  assert.equal(backup.restorableFolder(path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), home), false);
  assert.equal(backup.restorableFolder(shop, home), true);
});

// Value: protects=a cut backup never leaves the owner's file half gone, and a link inside a restore folder that leads to a kept folder is refused by its real path; fails_when=readEntries unlinks before the new copy is whole, or restorableFolder checks only the spelling; why_new=pre-landing review (outside voice pass 2); seam=none; no_claim=Windows short names (realpath on POSIX only)
test('a cut backup leaves an existing file whole, and a link to a kept folder is refused', { skip: process.platform === 'win32' }, async (t) => {
  const d = tmp(t, 'bk-whole');
  const out = path.join(d, 'out');
  put(path.join(out, 'registry.json'), 'the original');
  const cut = path.join(d, 'cut.dbmbackup');
  fs.writeFileSync(cut, zlib.gzipSync(Buffer.from([archive.BACKUP_MAGIC, '{"v":1}\n', '{"r":"r","p":"registry.json","s":1000,"m":420,"t":0}\n', 'short'].join(''))));
  await assert.rejects(archive.readEntries(cut, (h) => archive.safeTarget(out, h.p)), /cut short/);
  assert.equal(fs.readFileSync(path.join(out, 'registry.json'), 'utf8'), 'the original', 'kept whole');
  assert.deepEqual(fs.readdirSync(out), ['registry.json'], 'no half written file left beside it');

  const home = path.join(d, 'Users', 'sam');
  fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Documents', 'Shop'), { recursive: true });
  fs.symlinkSync(path.join(home, '.ssh'), path.join(home, 'Documents', 'Shop', 'link'));
  assert.equal(backup.restorableFolder(path.join(home, 'Documents', 'Shop', 'link', 'NewFolder'), home), false, 'it really leads into .ssh');
  assert.equal(backup.restorableFolder(path.join(home, 'Documents', 'Shop', 'NewFolder'), home), true);
});
