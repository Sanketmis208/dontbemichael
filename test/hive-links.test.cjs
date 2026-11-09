'use strict';

/**
 * Members' shells can write the hive root and every folder under it, so a
 * member can put a link (or a second name for a file) where the app is about
 * to write. The app runs with the owner's rights and no sandbox: a write that
 * followed the link would change a file outside the office. And a roster the
 * app can't read must never be saved over as empty, which would lose the team.
 *
 * Links are made with symlinkSync, which Windows allows only with extra rights,
 * so these run on macOS and Linux (platform-scoped tests, owner 2026-10-09).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-links-'));
process.env.HOME = base;
process.env.USERPROFILE = base;
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');
const { MemoryTidy } = loadTs('src/main/memoryTidy.ts');
const { writeHiveFile, appendHiveFile, emptyHiveFile, readHiveText, plainFolderBelow } = loadTs('src/main/hiveFile.ts');

test.after(() => fs.rmSync(base, { recursive: true, force: true }));
const skip = process.platform === 'win32' ? 'links need extra rights on Windows' : false;

/** A file of the owner's outside the office, which no write may touch. */
function ownersFile(name, text = 'owner data\n') {
  const dir = fs.mkdtempSync(path.join(base, 'outside-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, text);
  return { dir, file, text };
}
const plainFile = (p) => { const st = fs.lstatSync(p); return st.isFile() && st.nlink === 1; };
/** Every plain file under `dir`. */
function filesIn(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesIn(p)); else if (e.isFile()) out.push(p);
  }
  return out;
}

test('a whole file replaces a link or second name at its place, and a linked folder on the way is refused', { skip }, () => {
  // Value: protects=the app never writes through a member's link (sandbox escape found reviewing PR 690); fails_when=writeHiveFile or appendHiveFile follows a link at the file or in a folder on the way, or appends through a second name; why_new=new helper; seam=real files and links; no_claim=a link swapped in the instant between the check and the write
  const root = fs.mkdtempSync(path.join(base, 'root-'));
  const owner = ownersFile('notes.txt');
  const target = path.join(root, 'fleet.json');
  fs.symlinkSync(owner.file, target);
  writeHiveFile(root, target, '{"agents":[]}');
  assert.equal(fs.readFileSync(owner.file, 'utf8'), owner.text, 'the owner\'s file is untouched');
  assert.ok(plainFile(target), 'the link is replaced by a plain file');
  assert.equal(fs.readFileSync(target, 'utf8'), '{"agents":[]}');

  const hard = path.join(root, 'cost-ledger.jsonl');
  fs.linkSync(owner.file, hard);
  assert.throws(() => appendHiveFile(root, hard, 'row\n'), /not a plain file/);
  const linked = path.join(root, 'log.jsonl');
  fs.symlinkSync(owner.file, linked);
  assert.throws(() => appendHiveFile(root, linked, 'row\n'));
  assert.throws(() => emptyHiveFile(root, linked));
  assert.throws(() => emptyHiveFile(root, hard), /not a plain file/);
  assert.equal(fs.readFileSync(owner.file, 'utf8'), owner.text, 'no append or emptying went through either name');

  fs.symlinkSync(owner.dir, path.join(root, 'agents'));
  assert.equal(plainFolderBelow(root, path.join(root, 'agents')), false);
  assert.throws(() => writeHiveFile(root, path.join(root, 'agents', 'pam.json'), 'x'), /is a link/);
  assert.equal(fs.existsSync(path.join(owner.dir, 'pam.json')), false, 'nothing was written through the linked folder');

  assert.equal(readHiveText(linked), null, 'a link is not read');
  assert.equal(readHiveText(path.join(root, 'missing.md')), '');
  assert.equal(readHiveText(target), '{"agents":[]}');
});

test('the office files the app rewrites are never written through a link', { skip }, async () => {
  // Value: protects=fleet.json, PROTOCOL.md, COMMANDS.md, the log and a member's own files (review of PR 690, finding 8); fails_when=any of these writes follows a link a member planted; why_new=bug fix; seam=a real hive in a temp folder; no_claim=every other module's writes
  const home = path.join(base, 'office-links');
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', cwd: base, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', cwd: base });
  const root = hive.root();
  const owner = ownersFile('secrets.txt');
  for (const name of ['fleet.json', 'PROTOCOL.md', 'COMMANDS.md', 'log.jsonl', '.gitignore']) {
    fs.rmSync(path.join(root, name), { force: true });
    fs.symlinkSync(owner.file, path.join(root, name));
  }
  hive.writeFleetSnapshot({ agents: [] });
  hive.appendLog({ kind: 'test' });
  hive.ensureHive();
  assert.equal(fs.readFileSync(owner.file, 'utf8'), owner.text, 'the owner\'s file is untouched');
  for (const name of ['fleet.json', 'PROTOCOL.md', 'COMMANDS.md', '.gitignore']) assert.ok(plainFile(path.join(root, name)), `${name} is a plain file again`);

  // A member's folder swapped for a link: nothing is written into the target.
  const away = ownersFile('keep.txt');
  fs.renameSync(path.join(root, 'agents', 'pam'), path.join(base, 'pam-moved'));
  fs.symlinkSync(away.dir, path.join(root, 'agents', 'pam'));
  await hive.ensureAgent({ id: 'pam', name: 'Pam', cwd: base }).catch(() => {});
  assert.deepEqual(filesIn(away.dir), [away.file], 'no file of the app\'s landed outside the office');
});

test('a roster the app cannot read is never saved over', { skip }, async () => {
  // Value: protects=the whole team when registry.json is torn or unreadable (review of PR 690, finding 1); fails_when=an agent start or a roster edit saves an empty or one member roster over it, or the owner is not told; why_new=bug fix; seam=a real hive; no_claim=a member's shell writing a valid but empty roster
  const home = path.join(base, 'office-roster');
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', cwd: base, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', cwd: base });
  const reg = path.join(hive.root(), 'registry.json');
  const torn = fs.readFileSync(reg, 'utf8').slice(0, 60);
  fs.writeFileSync(reg, torn);
  const inj = await hive.ensureAgent({ id: 'jim', name: 'Jim', cwd: base });
  assert.equal(fs.readFileSync(reg, 'utf8'), torn, 'left as it is');
  assert.match(inj.degraded ?? '', /team list could not be read/, 'the owner is told');
  assert.deepEqual(hive.setAgentHold('pam', true), { ok: false, error: 'The team list could not be read, so nothing was changed.' });
  assert.equal(hive.renameAgent('pam', 'Angela').ok, false);
  assert.equal(hive.patchAgentRole('pam', 'Office manager').ok, false);
  assert.equal(fs.readFileSync(reg, 'utf8'), torn);
  // A new office has no roster yet, and starts one.
  const fresh = new HiveManager(() => path.join(base, 'office-new'));
  await fresh.ensureAgent({ id: 'god', name: 'Michael', cwd: base, isGod: true });
  assert.equal(fresh.registry().godId, 'god');
});

test('the memory tidy never reads or writes through a link in a member\'s folder', { skip }, async (t) => {
  // Value: protects=the owner's files from a member's memory folder (a planted memory.md or inbox link would be copied into backups and sent to the model); fails_when=the tidy reads, backs up or writes through a link; why_new=bug fix; seam=a temp hive, model stubbed; no_claim=the model's own output
  const home = fs.mkdtempSync(path.join(base, 'tidy-'));
  const dir = path.join(home, 'hive', 'agents', 'oscar');
  fs.mkdirSync(path.join(dir, 'memory'), { recursive: true });
  const owner = ownersFile('private.md', '# Memory\n- Bank PIN is 0000\n');
  fs.symlinkSync(owner.file, path.join(dir, 'memory.md'));
  fs.writeFileSync(path.join(dir, 'memory', 'inbox.md'), '- Supplier cutoff is Thursday\n');
  const log = [];
  const tidy = new MemoryTidy(() => home, () => 'claude', () => ({}), () => true, () => 'Oscar', (ev) => log.push(ev));
  let asked = false;
  tidy.askModel = async () => { asked = true; return { ops: [] }; };
  const [r] = await tidy.tidyNow();
  assert.equal(r?.reason, 'index-unreadable');
  assert.equal(asked, false, 'nothing went to the model');
  assert.equal(fs.readFileSync(owner.file, 'utf8'), owner.text);
  const backups = path.join(home, 'hive', 'backups');
  assert.ok(!fs.existsSync(backups) || !filesIn(backups).some((f) => fs.readFileSync(f, 'utf8').includes('Bank PIN')), 'not copied into backups');
});

test('a file the app moves aside never lands through a folder a member swapped for a link', { skip }, async () => {
  // Value: protects=the owner's folders from the app's own moves (outbox archive, triage set aside, handoff archive), which run with the owner's rights and no sandbox (ship review 2026-11-09); fails_when=a rename follows a linked .sent, triage .done or memory/handoffs folder; why_new=bug fix; seam=a real hive; no_claim=a folder swapped in the instant between the check and the move
  const home = path.join(base, 'office-moves');
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', cwd: base, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', cwd: base });
  const root = hive.root();
  const away = ownersFile('keep.txt');
  const outbox = path.join(root, 'agents', 'pam', 'outbox');
  fs.rmSync(path.join(outbox, '.sent'), { recursive: true, force: true });
  fs.symlinkSync(away.dir, path.join(outbox, '.sent'));
  fs.writeFileSync(path.join(outbox, 'settings.json'), JSON.stringify({ to: 'god', act: 'inform', subject: 'Hello', body: 'A note.' }));
  fs.writeFileSync(path.join(outbox, 'broken.json'), '{ not json');
  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(path.join(outbox, 'broken.json'), old, old);
  hive.routeOnce();
  assert.deepEqual(filesIn(away.dir), [away.file], 'nothing was moved into the linked folder');
  assert.equal(fs.existsSync(path.join(outbox, 'settings.json')), false, 'the message left the outbox');

  const mem = path.join(root, 'agents', 'pam', 'memory');
  fs.mkdirSync(mem, { recursive: true });
  fs.rmSync(path.join(mem, 'handoffs'), { recursive: true, force: true });
  fs.symlinkSync(away.dir, path.join(mem, 'handoffs'));
  fs.writeFileSync(path.join(mem, 'handoff.md'), 'Where I was.');
  assert.equal(hive.takeHandoff('pam'), 'Where I was.');
  assert.deepEqual(filesIn(away.dir), [away.file], 'the handoff was not archived through the link');
  assert.equal(fs.existsSync(path.join(mem, 'handoff.md')), false, 'and is taken once');
});

test('a pipe left where the app reads or appends never stalls it', { skip }, async () => {
  // Value: protects=the app's main process from a member's named pipe at a triage filing, a handoff or the office log (ship review 2026-11-09); fails_when=reading a filing or handoff, or appending to the log, waits on a pipe; why_new=bug fix; seam=a real hive and mkfifo; no_claim=other modules' reads
  const { execFileSync } = require('node:child_process');
  const home = path.join(base, 'office-pipes');
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', cwd: base, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', cwd: base });
  const root = hive.root();
  fs.mkdirSync(path.join(root, 'triage'), { recursive: true });
  execFileSync('mkfifo', [path.join(root, 'triage', 'stall.json')]);
  execFileSync('mkfifo', [path.join(root, 'agents', 'pam', 'memory', 'handoff.md')]);
  fs.rmSync(path.join(root, 'log.jsonl'), { force: true });
  execFileSync('mkfifo', [path.join(root, 'log.jsonl')]);
  assert.ok(Array.isArray(hive.pendingFilings()), 'the filing is skipped, not waited on');
  assert.equal(hive.takeHandoff('pam'), null);
  hive.appendLog({ kind: 'test' });
});
