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
