'use strict';

/**
 * Always allowed (owner, 2026-11-20: "Pete should evaluate blocked categories
 * and maintain an exception list which only owner can provide"; a question
 * with the owner's public releases page lost the link, because the address
 * holds the owner's name; src/shared/publicTerms.ts, src/main/trustLayer.ts,
 * PublicTermsList).
 *
 * Protects: the owner's entries reach the check as theirs and public, kept as
 * written even inside a link or handle; the shape checks skip them (the
 * business's public email is not a contact detail), but never let a password
 * or key through; the list is cleaned and capped; Company profile is only
 * ever a suggestion; it is a business setting only Settings writes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const P = loadTs('src/shared/publicTerms.ts');
const T = loadTs('src/main/trustLayer.ts');
const { dataClassSettings } = loadTs('src/shared/dataClasses.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function layer(answer, terms) {
  const prompts = [];
  const l = T.makeTrustLayer({
    run: async (p) => { prompts.push(p); return typeof answer === 'function' ? answer(p) : answer; },
    settings: () => dataClassSettings(undefined),
    publicTerms: () => terms,
    retryAfterMs: 1
  });
  return { l, prompts };
}

test('the list: one line each, no repeats, capped', () => {
  assert.deepEqual(P.cleanPublicTerms(['Dana Reyes', ' dana  reyes ', 'https://github.com/danareyes', '', 7, 'a\nb', 'x'.repeat(200)]),
    ['Dana Reyes', 'https://github.com/danareyes']);
  assert.equal(P.cleanPublicTerms(Array.from({ length: 50 }, (_, i) => `term ${i}`)).length, P.MAX_PUBLIC_TERMS);
  assert.deepEqual(P.cleanPublicTerms('Dana'), [], 'only a list');
});

test('Company profile is offered, never added, and what is on the list is not offered again', () => {
  const s = P.publicSuggestions({ businessName: 'Harbor & Pine', ceo: 'Sam Rivera', website: 'harborpine.example', social: ['https://x.com/harborpine'], email: 'hello@harborpine.example' }, ['sam rivera']);
  assert.deepEqual(s, ['Harbor & Pine', 'harborpine.example', 'hello@harborpine.example', 'https://x.com/harborpine']);
});

test('the check is told the owner\'s entries are public, kept as written inside a link or handle', async () => {
  const q = 'Read https://github.com/danareyes/harborpine/releases/ and list the last five releases';
  const { l, prompts } = layer(JSON.stringify({ decision: 'PASS' }), ['Dana Reyes']);
  assert.deepEqual(await l.inbound({ subject: 'Releases', body: q }), { decision: 'pass', subject: 'Releases', body: q });
  assert.match(prompts[0], /The business owner says these are the business's own and public\. They are not private: keep them as written, also inside a web address, an email address or a handle/);
  assert.match(prompts[0], /- "Dana Reyes"/);
  const none = layer(JSON.stringify({ decision: 'PASS' }), []);
  await none.l.inbound({ subject: 'Releases', body: q });
  assert.doesNotMatch(none.prompts[0], /The business owner says these are/, 'no list, no line');
});

test('the business\'s own public email passes the shape checks; anyone else\'s does not, and a key never does', async () => {
  const pass = JSON.stringify({ decision: 'PASS' });
  const own = layer(pass, ['hello@harborpine.example']);
  assert.equal((await own.l.inbound({ subject: 'Reviews', body: 'Find reviews that mention hello@harborpine.example' })).decision, 'pass');
  const other = layer(pass, ['hello@harborpine.example']);
  assert.equal((await other.l.inbound({ subject: 'Reviews', body: 'Find reviews that mention jane@northwind.example' })).decision, 'deny');
  // A dummy key, joined at run time so the secret scanner never reads it as one.
  const dummy = 'sk-ant-' + 'api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef';
  const key = layer(pass, [dummy]);
  const v = await key.l.inbound({ subject: 'x', body: `Use ${dummy} to search` });
  assert.equal(v.decision, 'deny');
  assert.equal(key.prompts.length, 0, 'a key never reaches the check, list or not');
});

test('only Settings writes it: a business setting, staged in Research & privacy', () => {
  assert.match(read('src/main/officeKeys.ts'), /'research', 'dataClasses', 'researchPublic',/);
  assert.match(read('src/main/index.ts'), /publicTerms: \(\) => readConfig\(\)\.researchPublic \?\? \[\],/);
  assert.match(read('src/renderer/src/components/SettingsModal.tsx'), /onPublicTermsChange=\{\(next\) => stage\(\{ researchPublic: next \} as Partial<HarnessConfig>\)\}/);
  assert.match(read('src/renderer/src/components/ResearchPrivacySettings.tsx'), /suggestions=\{publicSuggestions\(/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).research;
  for (const k of ['publicTitle', 'publicTip', 'publicPlaceholder', 'publicAdd', 'publicMax']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, k);
  }
});
