'use strict';

// runGit (src/main/git.ts) decoded each pipe chunk on its own. A chunk can end
// in the middle of a multi-byte UTF-8 character, and decoding the two halves
// apart turns it into U+FFFD. So a large file of Hindi or Chinese text read
// back with changed characters, and a large status listed paths that don't
// exist. Every git query the app runs (the worktree checks among them) goes
// through runGit.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { runGit } = loadTs('src/main/git.ts');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-utf8-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'core.autocrlf', 'false');
  return dir;
}

// About 700 KB, so the output crosses many pipe chunks; mixed 3- and 4-byte
// characters make sure some chunk ends inside one.
const BODY = 'नमस्ते दुनिया, दीपावली की शुभकामनाएँ 🪔 你好世界\n'.repeat(9000);

test('a large non-Latin file reads back from git exactly as committed', async (t) => {
  // Value: protects=git output split across pipe chunks decodes whole; fails_when=runGit decodes per chunk again; why_new=rewritten on runGit when the diff view was removed; seam=real git
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'notes.txt'), BODY);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  const r = await runGit(dir, ['show', 'HEAD:notes.txt']);
  assert.equal(r.ok, true, r.ok ? '' : r.error);
  assert.equal(r.stdout.includes('�'), false, 'the committed file came back with U+FFFD');
  assert.equal(r.stdout, BODY);
});

test('every path in a large status of non-Latin names exists', async (t) => {
  // Value: protects=a long status of non-Latin names names real files; fails_when=runGit decodes per chunk again; why_new=rewritten on runGit when the git views were removed; seam=real git
  const dir = repo(t);
  const sub = path.join(dir, 'नोट्स');
  fs.mkdirSync(sub);
  // Devanagari digits too, so nearly every byte of the listing (about 400 KB,
  // several pipe chunks) sits inside a 3-byte character.
  const digits = (n) => String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x966 + Number(d)));
  for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(sub, `दस्तावेज़शुभदीपावली${digits(i)}`), 'x');
  const r = await runGit(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  assert.equal(r.ok, true, r.ok ? '' : r.error);
  const untracked = r.stdout.split('\0').filter((e) => e.startsWith('?? ')).map((e) => e.slice(3));
  assert.equal(untracked.length, 3000);
  const missing = untracked.filter((p) => !fs.existsSync(path.join(dir, p)));
  assert.deepEqual(missing, [], 'these paths were cut apart in the middle of a character');
});
