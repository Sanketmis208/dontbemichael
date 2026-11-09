'use strict';

// runGit (src/main/git.ts) decoded each pipe chunk on its own. A chunk can end
// in the middle of a multi-byte UTF-8 character, and decoding the two halves
// apart turns it into U+FFFD. So a large diff of a Hindi or Chinese file showed
// changed lines in a file nobody touched, and a large status listed paths that
// don't exist, which the IDE then failed to open.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { getDiff, getStatus, getFileAtRev } = loadTs('src/main/git.ts');

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

test('the diff of an unchanged non-Latin file has no changed line', async (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'notes.txt'), BODY);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  const d = await getDiff(dir, 'notes.txt');
  assert.equal(d.head.includes('�'), false, 'the committed side came back with U+FFFD');
  assert.equal(d.head, d.working);
  const r = await getFileAtRev(dir, 'HEAD', 'notes.txt');
  assert.equal(r.content, BODY);
});

test('every path in a large status of non-Latin names exists', async (t) => {
  const dir = repo(t);
  const sub = path.join(dir, 'नोट्स');
  fs.mkdirSync(sub);
  // Devanagari digits too, so nearly every byte of the listing (about 400 KB,
  // several pipe chunks) sits inside a 3-byte character.
  const digits = (n) => String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x966 + Number(d)));
  for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(sub, `दस्तावेज़शुभदीपावली${digits(i)}`), 'x');
  const st = await getStatus(dir);
  assert.equal(st.untracked.length, 3000);
  const missing = st.untracked.filter((p) => !fs.existsSync(path.join(dir, p)));
  assert.deepEqual(missing, [], 'these paths were cut apart in the middle of a character');
});
