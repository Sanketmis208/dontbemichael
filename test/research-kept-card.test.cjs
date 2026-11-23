'use strict';

/**
 * What the privacy check kept back from a team member's question to Research,
 * offered on Ask me (owner, 2026-11-20: "user may not know to go to settings
 * to do this. ask me card should offer adding whats blocked in this case to
 * this allow list"; trustLayer keptParts, HiveManager.recordKept,
 * ResearchKeptCards).
 *
 * Protects: the card shows only words really in the question; one card per
 * question; Ask again sends the same question again from the one who asked,
 * through the check; Keep private just closes it; Always allow writes the
 * owner's list from the owner's click alone.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };
const T = loadTs('src/main/trustLayer.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { dataClassSettings } = loadTs('src/shared/dataClasses.ts');
const { MAX_KEPT_OPEN } = loadTs('src/shared/researchKept.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const Q = 'Please read the public releases page https://github.com/danareyes/harborpine/releases/ and list the last five releases';
const LINK = 'https://github.com/danareyes/harborpine/releases/';

test('the check names what it took out, and only words that are in the question count', async () => {
  assert.deepEqual(T.keptParts([LINK, 'made up words', 'x\ny', 7, LINK.toUpperCase()], Q), [LINK]);
  const l = T.makeTrustLayer({
    run: async () => JSON.stringify({ decision: 'CLEAN', subject: 'Releases', body: 'Read the releases page of a GitHub project', removed: ['contact'], parts: [LINK, 'Jane Smith'] }),
    settings: () => dataClassSettings(undefined), retryAfterMs: 1
  });
  const v = await l.inbound({ subject: 'Releases', body: Q });
  assert.equal(v.decision, 'clean');
  assert.deepEqual(v.parts, [LINK], 'Jane Smith is not in the question');
});

async function office(t, verdict) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-kept-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'ryan', name: 'Ryan', provider: 'claude', cwd: home });
  await hive.ensureAgent({ id: 'research', name: 'Pete', provider: 'claude', cwd: path.join(home, 'research-desk'), isResearch: true });
  hive.setResearchEnabled(() => true);
  const calls = [];
  hive.setTrustLayer({ inbound: async (m) => { calls.push(m); return verdict(m, calls.length); }, outbound: async (m) => ({ decision: 'pass', subject: String(m.subject), body: String(m.body), flagged: false }) });
  return { hive, home, calls };
}
const send = (hive, from, msg, name) => fs.writeFileSync(path.join(hive.root(), 'agents', from, 'outbox', name), JSON.stringify(msg));
const settle = async () => { for (let i = 0; i < 4; i++) { await new Promise((r) => setImmediate(r)); await new Promise((r) => setTimeout(r, 2)); } };
const route = async (hive, n = 3) => { for (let i = 0; i < n; i++) { hive.routeOnce(); await settle(); } };

test('a question sent without some words gets one card; Ask again sends it once more through the check', async (t) => {
  const cleaned = { decision: 'clean', subject: 'Releases', body: 'Read the releases page of a GitHub project', removed: ['contact'], parts: [LINK] };
  const { hive, calls } = await office(t, (m, n) => (n === 1 ? cleaned : { decision: 'pass', subject: String(m.subject), body: String(m.body) }));
  send(hive, 'ryan', { to: 'research', act: 'query', subject: 'Releases', body: Q }, 'a.json');
  await route(hive);
  const kept = hive.researchKept();
  assert.equal(kept.length, 1);
  assert.deepEqual({ from: kept[0].from, fromName: kept[0].fromName, parts: kept[0].parts, denied: kept[0].denied }, { from: 'ryan', fromName: 'Ryan', parts: [LINK], denied: false });
  assert.equal('again' in kept[0], false, 'the question\'s own words stay in the app\'s folder');

  assert.equal(hive.decideKept(kept[0].id, 'again'), true);
  assert.equal(hive.researchKept().length, 0, 'the card goes');
  await route(hive);
  assert.equal(calls.length, 2, 'checked again');
  assert.equal(calls[1].body, Q, 'the same question, as Ryan wrote it');
});

test('Keep private closes the card and sends nothing; a question stopped outright is a card too', async (t) => {
  const denied = { decision: 'deny', reason: 'Not sent', by: 'model', kinds: ['names'], parts: ['danareyes'] };
  const { hive, calls } = await office(t, () => denied);
  send(hive, 'ryan', { to: 'research', act: 'query', subject: 'Releases', body: Q }, 'a.json');
  await route(hive);
  const kept = hive.researchKept();
  assert.equal(kept.length, 1);
  assert.equal(kept[0].denied, true);
  assert.equal(hive.decideKept(kept[0].id, 'keep'), true);
  assert.equal(hive.researchKept().length, 0);
  await route(hive);
  assert.equal(calls.length, 1, 'nothing asked again');
});

test('wiring: the owner\'s click alone adds to the list; the card is on Ask me and counts', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /ipcMain\.handle\('research:allow', \(_evt, term: unknown\) => \{\s*const t = cleanPublicTerm\(term\);/);
  assert.match(main, /writeConfig\(\{ researchPublic: cleanPublicTerms\(\[\.\.\.now, t\]\) \}\);/);
  assert.match(read('src/renderer/src/shell/useNeedsYou.ts'), /\+ merged\.requests\.length \+ merged\.researchKept\.length \+/);
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(ask, /<ResearchKeptCards kept=\{researchKept\} refresh=\{refreshNeedsYou\}/);
  const card = read('src/renderer/src/components/ResearchKeptCards.tsx');
  assert.match(card, /window\.cth\.researchAllow\(part\)/);
  assert.match(card, /disabled=\{busy !== null \|\| !anyAllowed\}/, 'Ask again once something is allowed');
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).askMe;
  for (const k of ['keptTitle', 'keptCleaned', 'keptDenied', 'keptAllow', 'keptAllowed', 'keptHint', 'keptKeep', 'keptAgain', 'keptFailed']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, k);
  }
});

// Value: protects=one card per question: the same question kept back again adds its new words to that card (no repeats, at most 5) and the card says not sent only while every try was stopped; at most MAX_KEPT_OPEN cards wait; fails_when=recordKept stops matching the same question, drops the merge or the caps; why_new=each test above sends a question once; seam=none; no_claim=the model's real parts (fake check)
test('the same question kept back again adds to its one card; open cards are capped', async (t) => {
  const Q2 = 'Compare prices at Northwind Bakery and Contoso Cafe on Main Street';
  const tries = [
    { decision: 'clean', subject: 'Prices', body: 'Compare prices at two local bakeries', removed: ['names'], parts: ['Northwind Bakery', 'Main Street'] },
    { decision: 'deny', reason: 'Not sent', by: 'model', kinds: ['names'], parts: ['northwind bakery', 'Contoso Cafe', 'Compare prices', 'prices at', 'at Northwind'] }
  ];
  const { hive } = await office(t, (m, n) => tries[Math.min(n, tries.length) - 1]);
  send(hive, 'ryan', { to: 'research', act: 'query', subject: 'Prices', body: Q2 }, 'a.json');
  await route(hive);
  send(hive, 'ryan', { to: 'research', act: 'query', subject: 'Prices', body: Q2 }, 'b.json');
  await route(hive);
  const kept = hive.researchKept();
  assert.equal(kept.length, 1, 'one card for the one question');
  assert.deepEqual(kept[0].parts, ['Northwind Bakery', 'Main Street', 'Contoso Cafe', 'Compare prices', 'prices at'], 'new words added once each, at most five');
  assert.equal(kept[0].denied, false, 'it went once without them, so it is not "not sent"');

  const many = await office(t, () => tries[1]);
  for (let i = 0; i <= MAX_KEPT_OPEN; i++) send(many.hive, 'ryan', { to: 'research', act: 'query', subject: `Shop ${i}`, body: `Prices at Northwind Bakery number ${i}` }, `q${String(i).padStart(2, '0')}.json`);
  await route(many.hive, 6);
  assert.equal(fs.readdirSync(path.join(many.hive.root(), 'agents', 'ryan', 'outbox')).filter((f) => f.endsWith('.json')).length, 0, 'every question was checked');
  assert.equal(many.hive.researchKept().length, MAX_KEPT_OPEN, 'the oldest drops past the cap');
});

// Value: protects=the two answers not yet tested on each kind of card: a question stopped outright can be asked again, and Keep private on a partly sent one sends nothing more; fails_when=decideKept treats denied cards or Keep private differently; why_new=state matrix cells denied x again and clean x keep had no test (pre-landing review); seam=none; no_claim=the model's verdicts (fake check)
test('every card answers both ways: a stopped question can be asked again, a partly sent one kept private', async (t) => {
  const denied = { decision: 'deny', reason: 'Not sent', by: 'model', kinds: ['names'], parts: ['danareyes'] };
  const a = await office(t, (m, n) => (n === 1 ? denied : { decision: 'pass', subject: String(m.subject), body: String(m.body) }));
  send(a.hive, 'ryan', { to: 'research', act: 'query', subject: 'Releases', body: Q }, 'a.json');
  await route(a.hive);
  const stopped = a.hive.researchKept();
  assert.equal(stopped[0].denied, true);
  assert.equal(a.hive.decideKept(stopped[0].id, 'again'), true);
  assert.equal(a.hive.researchKept().length, 0, 'the card goes');
  await route(a.hive);
  assert.equal(a.calls.length, 2, 'checked again');
  assert.equal(a.calls[1].body, Q);

  const cleaned = { decision: 'clean', subject: 'Releases', body: 'Read the releases page of a GitHub project', removed: ['contact'], parts: [LINK] };
  const b = await office(t, () => cleaned);
  send(b.hive, 'ryan', { to: 'research', act: 'query', subject: 'Releases', body: Q }, 'a.json');
  await route(b.hive);
  const partly = b.hive.researchKept();
  assert.equal(partly[0].denied, false);
  assert.equal(b.hive.decideKept(partly[0].id, 'keep'), true);
  assert.equal(b.hive.researchKept().length, 0, 'the card goes');
  await route(b.hive);
  assert.equal(b.calls.length, 1, 'nothing asked again');
});

// Value: protects=a question kept back again counts as new for the cap, so it is not the card dropped; fails_when=writeKept caps by list position instead of time; why_new=the cap test sends only different questions (pre-landing review); seam=none; no_claim=the model's verdicts (fake check)
test('a question kept back again stays when the cap drops the oldest card', async (t) => {
  const denied = { decision: 'deny', reason: 'Not sent', by: 'model', kinds: ['names'], parts: ['Northwind Bakery'] };
  const { hive } = await office(t, () => denied);
  const ask = (i, name) => send(hive, 'ryan', { to: 'research', act: 'query', subject: `Shop ${i}`, body: `Prices at Northwind Bakery number ${i}` }, name);
  for (let i = 0; i < MAX_KEPT_OPEN; i++) ask(i, `q${String(i).padStart(2, '0')}.json`);
  await route(hive, 6);
  assert.equal(hive.researchKept().length, MAX_KEPT_OPEN);
  await new Promise((r) => setTimeout(r, 5));
  ask(0, 'r00.json');
  await route(hive);
  await new Promise((r) => setTimeout(r, 5));
  ask(99, 's99.json');
  await route(hive);
  const subjects = hive.researchKept().map((k) => k.subject);
  assert.equal(subjects.length, MAX_KEPT_OPEN);
  assert.ok(subjects.includes('Shop 0'), 'asked again just now, so it stays');
  assert.ok(subjects.includes('Shop 99'));
  assert.ok(!subjects.includes('Shop 1'), 'the oldest goes');
});
