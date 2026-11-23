'use strict';

/**
 * Ask me while the office opens or closes (owner, 2026-11-19: "do not allow
 * owner to interact with ask me cards when office is starting or closing").
 *
 * Protects: the asks (questions, replies, schedule requests, emails to
 * approve, job offers, foundation cards, reports) can be read but not answered
 * while the team clocks in or closing time runs; the cards that get a stuck
 * opening going (the office stop or break, Michael's sign in, members not
 * reporting) and the update cards stay usable; one line says why.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ask = read('src/renderer/src/components/AskMeTab.tsx');

test('the lock follows the office opening and closing', () => {
  assert.match(ask, /const officeClosing = useStore\(\(s\) => s\.officeClosing\);/);
  assert.match(ask, /const officeOpening = useStore\(\(s\) => s\.opening\.kind === 'opening'\);/);
  assert.match(ask, /const askLock: 'closing' \| 'opening' \| null = officeClosing \? 'closing' : officeOpening \? 'opening' : null;/);
  // officeClosing is the closing bar being up (App.tsx), set however closing time starts.
  assert.match(read('src/renderer/src/App.tsx'), /useStore\.setState\(\{ officeClosing: closingOpen \}\)/);
});

test('every ask is inside the locked part; the cards that unstick an opening are not', () => {
  const lockAt = ask.indexOf('data-askme-locked={askLock || undefined}');
  assert.ok(lockAt > 0);
  assert.match(ask.slice(lockAt, lockAt + 200), /\{\.\.\.\(askLock \? \(\{ inert: '' \} as Record<string, string>\) : \{\}\)\}/, 'inert: no click, typing or focus inside');
  const board = ask.slice(ask.indexOf('  return (\n    // Design v2'), ask.indexOf('\nconst card: CSSProperties'));
  const at = (s) => { const i = board.indexOf(s); assert.ok(i > 0, s); return i; };
  const lock = at('data-askme-locked');
  for (const outside of ['<OfficeBreakCard />', '<SilentEngineCards />', '<EngineSetupCard ', '<UpdateCard ', '<CliUpdateCard ']) {
    assert.ok(at(outside) < lock, `${outside} stays usable`);
  }
  for (const inside of ['<ScheduleRequestCards', '<WorkStyleUpdateCards', '<MailProposalCards', '{waiting.map((row) => {', '<SetupNoticeCard />', '<DegradedNoticeCard ']) {
    assert.ok(at(inside) > lock, `${inside} is locked`);
  }
});

test('one line says why, without dashes or a hardcoded name', () => {
  assert.match(ask, /\{askLock === 'closing' \? translate\('askMe\.lockedClosing'\) : translate\('askMe\.lockedOpening'\)\}/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).askMe;
  for (const k of ['lockedClosing', 'lockedOpening']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - |Michael/, k);
  }
});
