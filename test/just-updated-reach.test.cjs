'use strict';

// The just-updated mark (What's new shows this release's notes) must reach
// fresh installs.
//
// It used to require a `last-run-version` stamp to ALREADY exist, but the stamp
// and its reader shipped in the same release, so no earlier install had the
// file, `previous` read null on the upgrade into that release, and the check
// fired for almost nobody. These are the card's acceptance criteria (a)-(d).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { shouldMarkJustUpdated, isNewer } = loadTs('src/shared/updateState.ts');

// (a) a machine that has NEVER run this app
test('(a) a fresh install is marked on first launch', () => {
  assert.equal(shouldMarkJustUpdated(null, '0.4.7'), true);
});

// (b) the ordinary upgrade
test('(b) 0.4.6 -> 0.4.7 is marked', () => {
  assert.equal(shouldMarkJustUpdated('0.4.6', '0.4.7'), true);
});

// (c) seen once is seen
test('(c) the same version never fires twice', () => {
  assert.equal(shouldMarkJustUpdated('0.4.7', '0.4.7'), false);
  // …and the launch after a fresh install reads its own stamp back.
  assert.equal(shouldMarkJustUpdated('0.4.7', '0.4.7'), false);
});

// (d) a second RC of the SAME version — deliberate, not accidental
test('(d) 0.4.7-rc.1 -> 0.4.7-rc.2 fires, deliberately', () => {
  // isNewer discards -rc.N, so the two compare EQUAL. That is exactly why the
  // decision asks "is this a downgrade?" instead of "is this newer?".
  assert.equal(isNewer('0.4.7-rc.2', '0.4.7-rc.1'), false, 'isNewer still ignores -rc.N');
  assert.equal(shouldMarkJustUpdated('0.4.7-rc.1', '0.4.7-rc.2'), true);
  // and the rehearsal hop itself
  assert.equal(shouldMarkJustUpdated('0.4.6-rc.1', '0.4.7-rc.1'), true);
});

test('a downgrade announces nothing', () => {
  assert.equal(shouldMarkJustUpdated('0.4.8', '0.4.7'), false);
});

// ── the updater wires the decision, and keeps the stamp unconditional ────────

const updater = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/updater.ts'), 'utf8');

test('the stamp write is still unconditional on a version change', () => {
  // This is what arms every install that boots this version even once, and it
  // is the half that ALREADY worked — it must not be re-gated.
  assert.match(updater, /if \(previous !== current\) \{\s*\n\s*try \{\s*\n\s*mkdirSync/);
});

test('the mark fires only when the stamp actually landed', () => {
  // Otherwise an unwritable userData marks every boot as just updated forever.
  assert.match(updater, /if \(stamped && shouldMarkJustUpdated\(previous, current\)\)/);
});

test('a failed stamp write cannot skip the decision by throwing', () => {
  assert.match(updater, /logLine\(`last-run-version stamp failed/);
});
