'use strict';

/**
 * Nothing is typed into Michael's terminal when he starts (owner, 2026-09-25):
 * no /remote-control and no orientation prompt. His startup instructions and
 * the standup sent when the office opens give him his first turn. The last
 * engine that took its protocol by typing (Crush's seedPrompt) was removed
 * (owner, 2026-11-11), so nothing at all is typed at his start.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/hooks/useHive.ts'), 'utf8');

test('Michael gets no remote-control command or orientation prompt at start', () => {
  assert.doesNotMatch(src, /remoteControlCommandForProvider/);
  assert.doesNotMatch(src, /INITIAL_GOD_PROMPT/);
});

test('no seed prompt is typed at start any more', () => {
  // Value: protects=Michael's start types nothing into his terminal; fails_when=a typed seed comes back; why_new=owner 2026-11-11, the only engines that needed one were removed; seam=source pin; no_claim=a live start
  assert.doesNotMatch(src, /seedPrompt/);
});
