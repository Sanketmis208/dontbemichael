'use strict';

/**
 * A path from agent text never makes the app reach another machine. statAbs
 * backs the terminal's ⌘-click and the reveal in Finder or Explorer, and the
 * path it gets is whatever an agent printed, which can carry an email or a web
 * page. Looking at a Windows share opens an SMB session that can send the
 * user's Windows sign-in hash; looking at a macOS or Linux automount makes the
 * computer contact that host (PR 687 review, 2026-11-06).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { isNetworkPath, statAbs } = loadTs('src/main/fs.ts');

test('Windows shares are network paths, in every spelling', () => {
  // Value: protects=a quoted share path in agent output never opens an SMB session; fails_when=a slash, backslash or device form of a share passes; why_new=PR 687 review; seam=none
  for (const p of ['\\\\host\\share\\a.md', '//host/share/My Docs/a.md', '\\/host/share/a.md', '\\\\.\\pipe\\x', '\\\\?\\UNC\\host\\share\\a.md', '  //host/share/a.md']) {
    assert.equal(isNetworkPath(p, 'win32'), true, p);
  }
  assert.equal(isNetworkPath('\\\\?\\C:\\Users\\Jane\\a.md', 'win32'), false, 'a local long path');
  assert.equal(isNetworkPath('C:\\Users\\Jane\\My Docs\\a.md', 'win32'), false);
  assert.equal(isNetworkPath('C:/Users/Jane/a.md', 'win32'), false);
});

test('macOS and Linux automounts are network paths, local folders are not', () => {
  // Value: protects=an automount path in agent output never makes the computer contact a host; fails_when=/net, /Network, a case change or a .. route passes, or a local folder is refused; why_new=PR 687 review; seam=none
  for (const p of ['/net/host/x/a b.md', '/Network/Servers/host/a.md', '/NET/host/a.md', '/tmp/../net/host/a.md', '//host/share/a.md', '/net']) {
    assert.equal(isNetworkPath(p, 'darwin'), true, p);
  }
  for (const p of ['/Users/Jane/Business Reports/summary.md', '/tmp/notes.md', '/network-notes/a.md', '/Users/Jane/net/a.md', '/Volumes/Backup/a.md', '~/net/a.md', '/System/Volumes/Data/Users/Jane/a.md', '/System/Volumes/Data', '/System/Volumes/Datanet/a.md']) {
    assert.equal(isNetworkPath(p, 'darwin'), false, p);
  }
  assert.equal(isNetworkPath('/net/host/a.md', 'linux'), true);
});

test('the same automounts spelled through the Mac data volume are network paths', () => {
  // Value: protects=hovering agent text such as "/System/Volumes/Data/net/host/Q3 Docs/a.md" never makes the Mac contact that host; fails_when=the data volume spelling of /net or /Network passes, in any case or through ..; why_new=PR 687 review, 2026-11-12 (hover now stats quoted paths); seam=none
  for (const p of ['/System/Volumes/Data/net/host/Q3 Docs/a.md', '/system/volumes/data/NET/host/a.md', '/System/Volumes/Data/Network/Servers/host/a.md', '/System/Volumes/Data/net', '/tmp/../System/Volumes/Data/net/host/a.md', '/System/Volumes/Data/./net/host/a.md']) {
    assert.equal(isNetworkPath(p, 'darwin'), true, p);
  }
});

test('statAbs never looks at a network path, refuses it as not checked, and still finds a local file', async () => {
  // Value: protects=⌘-click and reveal refuse a share or automount before any stat, and the refusal is never read as "not there" (which made a ⌘-click on an unchecked quoted /net path reveal the one file name inside it), while a real file still opens; fails_when=statAbs stats a network path, answers it as a miss, or stops finding local files; why_new=PR 687 review, then its review at f7311548 (2026-11-15); seam=none
  const share = process.platform === 'win32' ? '\\\\host.invalid\\share\\a.md' : '/net/host.invalid/share/a.md';
  await assert.rejects(statAbs(share), { code: 'ENETPATH' });
  await assert.rejects(statAbs('//host.invalid/share/a.md'), { code: 'ENETPATH' });
  if (process.platform !== 'win32') await assert.rejects(statAbs('/System/Volumes/Data/net/host.invalid/Q3 Docs/a.md'), { code: 'ENETPATH' });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-net-'));
  const file = path.join(dir, 'My Docs a.md');
  fs.writeFileSync(file, 'x');
  const hit = await statAbs(file);
  assert.equal(hit.exists, true);
  assert.equal(hit.isFile, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('statAbs says not there only when the path is not there, and fails a check it could not make', async (t) => {
  // Value: protects=a ⌘-click on a printed path that could not be checked (no permission, a share timing out) reveals nothing, rather than reading as "not there" and revealing the one file name inside it in the agent's folder; fails_when=statAbs answers exists false for an error other than ENOENT or ENOTDIR, or stops answering false for a missing path; why_new=PR 687 review at 49b13c14 (2026-11-13); seam=none
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-err-'));
  t.after(() => { try { fs.chmodSync(path.join(dir, 'locked'), 0o700); } catch { /* not made */ } fs.rmSync(dir, { recursive: true, force: true }); });
  const file = path.join(dir, 'a.md');
  fs.writeFileSync(file, 'x');
  assert.deepEqual(await statAbs(path.join(dir, 'missing.md')), { exists: false, isFile: false, path: path.join(dir, 'missing.md') }, 'ENOENT');
  assert.equal((await statAbs(path.join(file, 'inside.md'))).exists, false, 'ENOTDIR');
  // A folder the app may not look into: POSIX only, and not as root, who can look anyway.
  if (process.platform === 'win32' || process.getuid?.() === 0) return;
  const locked = path.join(dir, 'locked');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, 'Q3 report.md'), 'x');
  fs.chmodSync(locked, 0o000);
  await assert.rejects(statAbs(path.join(locked, 'Q3 report.md')), { code: 'EACCES' });
});

test('path checks wait on the disk at most MAX_PATH_CHECKS at a time, so a stale share never takes every file thread', async () => {
  // Value: protects=⌘-clicks and link hovers on a share gone stale cannot hold all four of Node's file threads and stall every file read and write in the main process; fails_when=a fourth distinct check starts while three hang, a check for a path already waiting starts a second stat, a refusal queues instead of failing at once, or a settled or thrown check keeps its place; why_new=PR 687 review at f7311548: clicks had no cap; seam=fake look that never answers until told
  const { pathCheckLimiter, MAX_PATH_CHECKS } = loadTs('src/main/fs.ts');
  assert.ok(MAX_PATH_CHECKS < 4, 'one of the four file threads always stays free');
  const pending = new Map();
  const looked = [];
  const look = (abs) => { looked.push(abs); return new Promise((resolve, reject) => pending.set(abs, { resolve, reject })); };
  const check = pathCheckLimiter(look, 3);

  const hung = ['/Volumes/stale/a.md', '/Volumes/stale/b.md', '/Volumes/stale/c.md'].map((p) => check(p));
  const again = check('/Volumes/stale/a.md');
  assert.equal(looked.length, 3, 'a second check for a waiting path joins it');
  await assert.rejects(check('/Users/Jane/notes.md'), { code: 'EBUSY' });
  assert.equal(looked.length, 3, 'past the cap nothing is looked at');

  pending.get('/Volumes/stale/a.md').reject(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }));
  await assert.rejects(hung[0], { code: 'ETIMEDOUT' });
  await assert.rejects(again, { code: 'ETIMEDOUT' });
  const local = check('/Users/Jane/notes.md');
  assert.equal(looked.at(-1), '/Users/Jane/notes.md', 'a settled check frees its place');
  pending.get('/Users/Jane/notes.md').resolve('stat');
  assert.equal(await local, 'stat');

  const throws = pathCheckLimiter(() => { throw new Error('sync'); }, 1);
  await assert.rejects(throws('/x.md'), /sync/);
  await assert.rejects(throws('/y.md'), /sync/, 'a check that threw keeps no place');
  for (const p of ['/Volumes/stale/b.md', '/Volumes/stale/c.md']) pending.get(p).resolve('stat');
  await Promise.all(hung.slice(1));
});

test('statAbs looks at the disk only through the shared path check cap', () => {
  // Value: protects=every ⌘-click, hover and reveal stat counts against MAX_PATH_CHECKS; fails_when=statAbs calls stat directly again; why_new=PR 687 review at f7311548; seam=source pin
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/fs.ts'), 'utf8');
  const body = src.slice(src.indexOf('export async function statAbs'), src.indexOf('\n}\n', src.indexOf('export async function statAbs')));
  assert.match(body, /await statLimited\(abs\)/);
  assert.doesNotMatch(body, /\bstat\(/);
  assert.match(src, /const statLimited = pathCheckLimiter\(\(abs: string\) => stat\(abs\)\);/);
});
