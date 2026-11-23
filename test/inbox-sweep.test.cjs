'use strict';

/**
 * Michael never moves his inbox with a wildcard (owner, 2026-11-20: twice he
 * moved the whole inbox to .done after reading a few, and confirmations that
 * had just arrived were filed unread; closing time held both times;
 * src/shared/inboxSweep.ts, the PreToolUse check in hooks.ts).
 *
 * Protects: a move picked by a wildcard (mv, a loop, find or xargs) is refused
 * for Michael with how to do it instead; moving one message by name, reading
 * with a wildcard, and other moves still run; team members are not changed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const S = loadTs('src/shared/inboxSweep.ts');

test('a move picked by a wildcard is a sweep; one by name, or reading, is not', () => {
  const sweeps = [
    'cd "/hive"; python3 -c "x"; mv agents/god/inbox/*.json agents/god/inbox/.done/',
    'for f in agents/god/inbox/*.json; do cat "$f"; mv "$f" agents/god/inbox/.done/; done',
    'ls agents/god/inbox/*.json | xargs mv -t agents/god/inbox/.done/',
    'find agents/god/inbox -name "*.json" -exec mv {} agents/god/inbox/.done/ \;',
    'sudo mv inbox/2026* inbox/.done/'
  ];
  for (const c of sweeps) assert.equal(S.sweepsInbox(c), true, c);
  const fine = [
    'mv agents/god/inbox/2026-11-20T07-35-08-125Z-a0919c.json agents/god/inbox/.done/',
    'for f in agents/god/inbox/*.json; do python3 -c "print(1)" "$f"; done',
    'mv tasks.json tasks.json.bak',
    'cat agents/god/inbox/*.json'
  ];
  for (const c of fine) assert.equal(S.sweepsInbox(c), false, c);
  assert.match(S.INBOX_SWEEP_REASON, /one mv per file/);
  assert.doesNotMatch(S.INBOX_SWEEP_REASON, /[–—]/);
});

test('refused for Michael alone, before the command runs', () => {
  const hooks = fs.readFileSync(path.join(__dirname, '..', 'src/main/hooks.ts'), 'utf8');
  assert.match(hooks, /if \(isGod && typeof cmd === 'string' && sweepsInbox\(cmd\)\) \{\s*return \{ hookSpecificOutput: \{ hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: INBOX_SWEEP_REASON \} \};/);
});

// Value: protects=through the real PreToolUse hook Michael's wildcard move is refused and a team member's same command and Michael's move by name run; fails_when=the isGod check inverts, reads the wrong id, or the hook stops calling sweepsInbox; why_new=the hook was pinned only by a source regex; seam=none; no_claim=that Claude Code obeys the deny (hook output shape only)
test('through the real hook: refused for Michael, never for a team member, and a move by name runs', async (t) => {
  const os = require('node:os');
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };
  const { HiveManager } = loadTs('src/main/hive.ts');
  const { HookServer } = loadTs('src/main/hooks.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-inbox-sweep-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const server = new HookServer(hive, () => ({ send() {} }), () => ({ harnessHome: home }), undefined, undefined);
  const bash = (agent_id, command) => server.handle({ agent_id, session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: home });
  const denied = (r) => !!(r && r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny');
  const sweep = 'mv agents/god/inbox/*.json agents/god/inbox/.done/';

  const r = await bash('god', sweep);
  assert.equal(denied(r), true, 'Michael\'s sweep is refused');
  assert.equal(r.hookSpecificOutput.permissionDecisionReason, S.INBOX_SWEEP_REASON);
  assert.equal(denied(await bash('pam', 'mv agents/pam/inbox/*.json agents/pam/inbox/.done/')), false, 'a team member is not changed');
  assert.equal(denied(await bash('god', 'mv agents/god/inbox/2026-11-20T07-35-08-125Z-a0919c.json agents/god/inbox/.done/')), false, 'one by name runs');
});
