'use strict';

// A hidden call whose session never takes the prompt (Claude signed out, or a
// trust screen waiting) gives up early, so the caller's fallback answers
// instead of the owner waiting out the timeout (TODOS: "End a hidden Claude
// call early when it can't answer"). Runs a fake `claude` in a real PTY.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const POSIX = process.platform !== 'win32';

// Transcripts live under ~/.claude/projects; keep this test's out of the real one.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-prompt-home-'));
process.env.HOME = home;
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

const { runHiddenClaude } = loadTs('src/main/hiddenClaude.ts');
const { projectDir } = loadTs('src/main/transcript.ts');

// The fake: "signin" shows a login screen and ignores input, noting any it
// gets in FAKE_INPUT. "unknown" does the same on a screen the app does not
// know. "slow" takes the prompt into its transcript at once and answers a
// while later. "booting" swallows the first Enter, as Claude Code still
// starting up does: the pasted question stays in its input box, unsent (seen
// live, 2026-10-15).
const FAKE = `
const fs = require('fs');
const path = require('path');
const id = process.argv[process.argv.indexOf('--session-id') + 1];
const line = (type, text) => JSON.stringify({ type, message: { content: [{ type: 'text', text }] } }) + '\\n';
let enters = 0;
if (process.env.FAKE_MODE === 'signin' || process.env.FAKE_MODE === 'unknown') {
  process.stdout.write(process.env.FAKE_MODE === 'signin' ? 'Select login method:\\r\\n' : 'Something new to choose\\r\\n');
  process.stdin.on('data', (d) => { if (process.env.FAKE_INPUT) fs.appendFileSync(process.env.FAKE_INPUT, d); });
} else {
  process.stdout.write('> ');
  process.stdin.on('data', (d) => {
    if (!/[\\r\\n]/.test(String(d))) return;
    if (process.env.FAKE_MODE === 'booting' && enters++ === 0) return;
    const dir = process.env.FAKE_PROJECT_DIR;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, id + '.jsonl');
    fs.writeFileSync(file, line('user', 'check'));
    setTimeout(() => fs.appendFileSync(file, line('assistant', 'slow answer')), Number(process.env.FAKE_ANSWER_MS));
  });
}
`;

function fakeClaude() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-prompt-bin-'));
  fs.writeFileSync(path.join(dir, 'fake.cjs'), FAKE);
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(dir, 'fake.cjs')}" "$@"\n`, { mode: 0o755 });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-prompt-cwd-'));
  return { bin, cwd };
}

test('a session stuck on a sign-in screen is given up on soon after the prompt', { skip: !POSIX }, async () => {
  const { bin, cwd } = fakeClaude();
  const t0 = Date.now();
  const r = await runHiddenClaude('Is this a distinct job?', {
    model: 'haiku', cwd, command: bin, noTools: true, promptTakenMs: 1000, timeoutMs: 60_000,
    env: { FAKE_MODE: 'signin' }
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /never took the prompt/);
  assert.ok(Date.now() - t0 < 15_000, `gave up after ${Date.now() - t0} ms, not the 60 s timeout`);
});

test('a slow answer is still waited for once the prompt is in', { skip: !POSIX }, async () => {
  const { bin, cwd } = fakeClaude();
  const r = await runHiddenClaude('Is this a distinct job?', {
    model: 'haiku', cwd, command: bin, noTools: true, promptTakenMs: 1000, timeoutMs: 60_000,
    env: { FAKE_MODE: 'slow', FAKE_PROJECT_DIR: projectDir(cwd), FAKE_ANSWER_MS: '3000' }
  });
  assert.deepEqual(r, { ok: true, text: 'slow answer' });
});

test('an Enter swallowed while the session starts is pressed again, so the check still answers', { skip: !POSIX }, async () => {
  // Value: protects=the Research trust layer at app launch, when a dozen agents start at once and a check's Enter is lost while its session boots; fails_when=a lost Enter makes the call give up as "never took the prompt" (every launch time trust check denied after 23 s, seen live 2026-10-15); why_new=root cause of the trust layer's no-answer denials; seam=fake claude in a real PTY; no_claim=the real Claude Code boot timing
  const { bin, cwd } = fakeClaude();
  const r = await runHiddenClaude('Is this a distinct job?', {
    model: 'haiku', cwd, command: bin, noTools: true, promptTakenMs: 6000, timeoutMs: 60_000,
    env: { FAKE_MODE: 'booting', FAKE_PROJECT_DIR: projectDir(cwd), FAKE_ANSWER_MS: '200' }
  });
  assert.deepEqual(r, { ok: true, text: 'slow answer' });
});

test('a session that starts on the sign-in screen is given up on before anything is typed', { skip: !POSIX }, async () => {
  // Value: protects=a signed out owner waits about two seconds on "checking...", not promptTakenMs, and no Enter picks a way to sign in; fails_when=a known sign in screen waits for promptTakenMs again, or gets the prompt typed into it; why_new=TODOS "End a hidden Claude call early when it can't answer"; seam=fake claude in a real PTY; no_claim=the exact words every Claude Code version shows when signed out
  const { bin, cwd } = fakeClaude();
  const input = path.join(cwd, 'input.txt');
  const t0 = Date.now();
  const r = await runHiddenClaude('Is this a distinct job?', {
    model: 'haiku', cwd, command: bin, noTools: true, promptTakenMs: 20_000, timeoutMs: 60_000,
    env: { FAKE_MODE: 'signin', FAKE_INPUT: input }
  });
  assert.deepEqual(r, { ok: false, error: 'hidden session never took the prompt (signed out, or a screen is waiting)', exitCause: 'signed-out' });
  assert.ok(Date.now() - t0 < 8_000, `gave up after ${Date.now() - t0} ms, not at promptTakenMs`);
  assert.equal(fs.existsSync(input), false, 'nothing was typed into the sign in screen');
});

test('a screen the app does not know is still given up on at promptTakenMs', { skip: !POSIX }, async () => {
  const { bin, cwd } = fakeClaude();
  const t0 = Date.now();
  const r = await runHiddenClaude('Is this a distinct job?', {
    model: 'haiku', cwd, command: bin, noTools: true, promptTakenMs: 3000, timeoutMs: 60_000,
    env: { FAKE_MODE: 'unknown' }
  });
  assert.deepEqual(r, { ok: false, error: 'hidden session never took the prompt (signed out, or a screen is waiting)' });
  const took = Date.now() - t0;
  assert.ok(took >= 3000 && took < 15_000, `gave up after ${took} ms`);
});

test('promptWait gives up at once only on a sign-in screen, and on slowness only at promptTakenMs', () => {
  const { promptWait } = loadTs('src/main/hiddenClaude.ts');
  const at = (bootScreen, waitedMs, taken = false) => promptWait({ taken, bootScreen, waitedMs, promptTakenMs: 20_000 });
  // Words drawn with cursor moves, as Claude Code draws them.
  assert.deepEqual(at('Select\x1b[1Clogin\x1b[1Cmethod:\r\n❯ 1. Claude account with subscription', 0), { verdict: 'give-up', exitCause: 'signed-out' });
  assert.deepEqual(at('> \r\n  Not logged in · Run /login', 0), { verdict: 'give-up', exitCause: 'signed-out' });
  // A slow start is waited for; the transcript showing the prompt ends the wait.
  assert.deepEqual(at('> ', 0), { verdict: 'wait' });
  assert.deepEqual(at('> ', 19_999), { verdict: 'wait' });
  assert.deepEqual(at('> ', 30_000, true), { verdict: 'taken' });
  // No transcript by promptTakenMs: something is waiting, with no screen to name.
  assert.deepEqual(at('> ', 20_000), { verdict: 'give-up' });
  // Trust and bypass questions end the session themselves on the Enter.
  assert.deepEqual(at('Quick\x1b[1Csafety\x1b[1Ccheck\n❯ No,\x1b[1Cexit\n  Yes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder', 0), { verdict: 'wait' });
});
