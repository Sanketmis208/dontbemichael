'use strict';

/**
 * The app has no feature that uses the microphone since voice was removed
 * (2026-11-11), so the Mac build neither asks for it nor explains a use it
 * does not have, and the window refuses it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the Mac build does not ask for the microphone', () => {
  // Value: protects=the installed app claims no microphone use it does not have; fails_when=the mic entitlement or its privacy text comes back without a feature; why_new=stale voice text found at /ship 2026-11-11; seam=build config pins; no_claim=a signed build's entitlements (the /ship DMG check reads those)
  assert.doesNotMatch(read('electron-builder.yml'), /NSMicrophoneUsageDescription/);
  assert.doesNotMatch(read('build/entitlements.mac.plist'), /com\.apple\.security\.device\.audio-input/);
  assert.match(read('src/main/index.ts'), /callback\(permission !== 'media'\)/, 'the window still refuses media capture');
});
