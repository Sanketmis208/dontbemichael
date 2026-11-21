'use strict';

/**
 * An Ask me card with several questions shows three at a time (owner,
 * 2026-11-19: seven at once was a lot to face for a new owner, and one card
 * filled the whole column; src/renderer/src/components/AskAnswerFields.tsx).
 *
 * Protects: never more than three questions on screen; the numbering stays the
 * card's own (4 is still 4 on the second page); answers are kept by the card,
 * not the page, so turning the page loses nothing and Reply sends them all; a
 * card of three or fewer has no page line.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = read('src/renderer/src/components/AskAnswerFields.tsx');

test('three at a time, numbered as the card numbers them, answers kept across pages', () => {
  assert.match(src, /export const QUESTIONS_PER_PAGE = 3;/);
  assert.match(src, /const shown = parts\.slice\(from, from \+ QUESTIONS_PER_PAGE\);/);
  assert.match(src, /\{shown\.map\(\(p, k\) => \{\s*const i = from \+ k;\s*const a = answers\[i\] \?\? \{\};/, 'the index into the card\'s answers, not the page');
  assert.match(src, /const all = parts\.map\(\(_, j\) => answers\[j\]\);/, 'a change keeps every page\'s answers');
  assert.match(src, /\{pages > 1 && \(/, 'no page line for three or fewer');
});

test('the page line and its copy', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).askMe;
  assert.equal(en.questionsShown, 'Questions {{from}} to {{to}} of {{total}}');
  for (const k of ['questionsShown', 'questionsBack', 'questionsNext_one', 'questionsNext_other']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, k);
  }
});
