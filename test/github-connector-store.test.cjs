'use strict';

/**
 * The main process side of GitHub modes (docs/designs/github-connector-modes.md):
 * held writes run once after the owner approves, keep the approval when GitHub
 * refuses, and the visibility cache never lets a stale or failed check through.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { GitHubHeldStore, RepoVisibilityCache, VISIBILITY_STALE_MS, callHash } = loadTs('src/main/githubConnector.ts');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gh-held-')), 'github-held.json');
const HOLD = { kind: 'hold', repo: 'acme/site', branch: 'agent/x', files: ['blog/a.html'], flags: [], visibility: 'private' };
const INPUT = { owner: 'acme', repo: 'site', branch: 'agent/x', files: [{ path: 'blog/a.html', content: 'hi' }], message: 'Add the pricing page' };

function store() {
  const told = [];
  let now = 1000;
  const s = new GitHubHeldStore({ path: tmp(), tell: (to, subject, body) => told.push({ to, subject, body }), changed: () => {}, now: () => now });
  return { s, told, tick: (ms) => { now += ms; } };
}

test('a held write waits, then runs exactly once after approval', () => {
  // Value: protects=one approval runs one write; fails_when=the approval is reused or skipped; why_new=new store; seam=none; no_claim=real hook timing (direct calls)
  const { s, told } = store();
  assert.equal(s.onHold('nick', 'push_files', INPUT, HOLD, 't1').run, false);
  assert.equal(s.waiting().length, 1);
  assert.equal(s.onHold('nick', 'push_files', INPUT, HOLD, 't2').run, false, 'same call again while waiting files no second card');
  assert.equal(s.waiting().length, 1);
  assert.equal(s.waiting()[0].says, 'Add the pricing page');
  assert.ok(s.decide(s.waiting()[0].id, 'approve'));
  assert.match(told.at(-1).body, /Run the same call again/);
  assert.equal(s.onHold('nick', 'push_files', INPUT, HOLD, 't3').run, true);
  const second = s.onHold('nick', 'push_files', INPUT, HOLD, 't4');
  assert.equal(second.run, false);
  assert.match(second.reason, /already running/);
  s.onEnd('t3', true);
  const after = s.onHold('nick', 'push_files', INPUT, HOLD, 't5');
  assert.equal(after.run, false, 'used: a new card, not a second run');
  assert.equal(s.waiting().length, 1);
});

test('an edited call needs its own approval', () => {
  const { s } = store();
  s.onHold('nick', 'push_files', INPUT, HOLD, 't1');
  s.decide(s.waiting()[0].id, 'approve');
  const edited = { ...INPUT, files: [{ path: 'blog/a.html', content: 'something else' }] };
  assert.equal(s.onHold('nick', 'push_files', edited, HOLD, 't2').run, false);
  assert.notEqual(callHash('push_files', INPUT), callHash('push_files', edited));
});

test('GitHub refusing the write, a failure or the session ending keeps the approval', () => {
  // Value: protects=the owner never approves the same write twice for a GitHub error; fails_when=an error result marks it used; why_new=eng R1 and V5; seam=none; no_claim=the error flag's field name in Claude Code (live probe 2)
  const { s } = store();
  s.onHold('nick', 'push_files', INPUT, HOLD, 't1');
  s.decide(s.waiting()[0].id, 'approve');
  assert.equal(s.onHold('nick', 'push_files', INPUT, HOLD, 'a').run, true);
  s.onEnd('a', false);
  assert.equal(s.onHold('nick', 'push_files', INPUT, HOLD, 'b').run, true);
  s.onSessionEnd('nick');
  assert.equal(s.onHold('nick', 'push_files', INPUT, HOLD, 'c').run, true);
});

test('decline and ask for changes tell the member; changes needs a note; expiry after a day', () => {
  const { s, told, tick } = store();
  s.onHold('nick', 'push_files', INPUT, HOLD, 't1');
  const id = s.waiting()[0].id;
  assert.equal(s.decide(id, 'changes', '  '), false);
  assert.ok(s.decide(id, 'changes', 'Also link it from the home page.'));
  assert.match(told.at(-1).body, /home page/);
  assert.equal(s.decide(id, 'approve'), false, 'decided once');
  s.onHold('nick', 'push_files', { ...INPUT, message: 'v2' }, HOLD, 't2');
  tick(24 * 60 * 60 * 1000 + 1);
  s.sweep();
  assert.equal(s.waiting().length, 0);
  assert.match(told.at(-1).subject, /expired/);
});

test('the store survives a restart from its file', () => {
  const p = tmp();
  const a = new GitHubHeldStore({ path: p, tell: () => {}, changed: () => {} });
  a.onHold('nick', 'push_files', INPUT, HOLD, 't1');
  const b = new GitHubHeldStore({ path: p, tell: () => {}, changed: () => {} });
  assert.equal(b.waiting().length, 1);
});

test('visibility: 200 public, 404 private, a failure or a stale entry is unknown', async () => {
  // Value: protects=writes wait while a repo's visibility is not known fresh; fails_when=a failed check reads as private or a stale entry as fresh; why_new=outside voice O3; seam=none; no_claim=GitHub's real API (stubbed fetch)
  let now = 0;
  const replies = { 'acme/pub': { status: 200, ok: true, json: async () => ({ private: false }) }, 'acme/priv': { status: 404, ok: false, json: async () => ({}) } };
  const c = new RepoVisibilityCache({ now: () => now, fetch: async (url) => { const r = Object.keys(replies).find((k) => url.endsWith(k)); if (!r) throw new Error('offline'); return replies[r]; } });
  assert.equal(c.get('acme/pub'), 'unknown', 'first call starts a check');
  assert.equal(await c.check('acme/pub'), 'public');
  assert.equal(c.get('acme/pub'), 'public');
  assert.equal(await c.check('acme/priv'), 'private');
  assert.equal(await c.check('acme/down'), 'unknown');
  now += VISIBILITY_STALE_MS + 1;
  assert.equal(c.get('acme/pub'), 'unknown', 'stale');
  assert.equal(c.peek('acme/pub'), 'public', 'screens still show the last known');
});
