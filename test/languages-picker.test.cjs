'use strict';

/**
 * Languages served, one chip per language (owner, 2026-11-19: a comma list
 * was hard to fill in, and languages are picked, not typed; src/shared/languages.ts,
 * src/renderer/src/components/LanguagesPicker.tsx).
 *
 * Protects: the line every agent reads keeps its shape ("English, Spanish")
 * and reads back as the same chips; repeats and blanks never reach it;
 * languages are picked from a list in the app's language, never typed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const l = loadTs('src/shared/languages.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the saved line as chips and back', () => {
  assert.deepEqual(l.splitLanguages('English, Spanish'), ['English', 'Spanish']);
  assert.deepEqual(l.splitLanguages('English; Spanish and French\nenglish.'), ['English', 'Spanish', 'French'], 'typed or written other ways');
  assert.deepEqual(l.splitLanguages(undefined), []);
  assert.equal(l.joinLanguages(['English', ' ', 'spanish', 'ENGLISH']), 'English, spanish');
  assert.equal(l.joinLanguages([]), undefined, 'none: no line at all');
  assert.equal(l.joinLanguages(Array.from({ length: 20 }, (_, i) => `L${i}`)).split(', ').length, l.MAX_LANGUAGES);
  const line = 'English, Spanish, Vietnamese';
  assert.equal(l.joinLanguages(l.splitLanguages(line)), line);
});

test('the list to pick from: in the app language, each once, sorted', () => {
  const names = l.languageNames('en');
  for (const n of ['English', 'Spanish', 'Chinese', 'Vietnamese', 'American Sign Language']) assert.ok(names.includes(n), n);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length, 'each once');
  assert.deepEqual(names, [...names].sort(new Intl.Collator('en').compare));
  assert.ok(l.languageNames('es').includes('Español'), 'named in the app language');
});

test('the picker: picked from a list, never typed, in the profile as a group, and the copy', () => {
  const picker = read('src/renderer/src/components/LanguagesPicker.tsx');
  assert.match(picker, /const save = \(next: string\[\]\): void => onChange\(joinLanguages\(next\)\);/);
  assert.match(picker, /<select\s+value=""\s+onChange=\{\(e\) => \{ if \(e\.target\.value\) save\(\[\.\.\.chosen, e\.target\.value\]\); \}\}/);
  assert.match(picker, /open\.map\(\(n\) => <option key=\{n\} value=\{n\}>/, 'only languages not chosen yet');
  assert.doesNotMatch(picker, /<input/, 'nothing to type (owner, 2026-11-19)');
  // A <label> would pass a click on a chip's remove button (gone once
  // clicked) to its first button, removing a second language.
  assert.match(read('src/renderer/src/components/CompanyProfileFields.tsx'),
    /<Field label=\{t\('companyProfile\.languages'\)\} group>\s*<LanguagesPicker value=\{value\.languages\} onChange=\{\(languages\) => set\(\{ languages \}\)\}/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).companyProfile;
  for (const k of ['languagesMore', 'languagesAdd', 'languagesChosen', 'languagesRemove', 'languagesMax']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, k);
  }
});
