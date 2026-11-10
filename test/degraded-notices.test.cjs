'use strict';

/**
 * A member that started with something missing is told to the owner inside
 * the app, not only by a desktop notification the notifications setting can
 * turn off (owner, 2026-11-10). The rules are pure (src/shared/degradedNotices.ts);
 * the wiring is pinned in the source, as the repo's renderer tests do.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const D = loadTs('src/shared/degradedNotices.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const team = () => true;
const PROXY = 'Pam is running without hive events: its proxy bridge did not bind after 3 attempts.';

test('a degraded start shows a card; a clean start clears it', () => {
  // Value: protects=the owner hears about a degraded member, and the card goes when it is fixed; fails_when=a degraded start shows nothing or a clean start leaves the card; why_new=new notices; seam=pure; no_claim=none beyond protects
  let s = D.noteStart(D.emptyDegraded(), 'pam', 'Pam', PROXY, 100);
  assert.deepEqual(D.shownNotices(s, team).map((n) => [n.agentId, n.name, n.message]), [['pam', 'Pam', PROXY]]);
  s = D.noteStart(s, 'pam', 'Pam', undefined, 200);
  assert.deepEqual(D.shownNotices(s, team), []);
  // Blank text is a clean start too.
  assert.deepEqual(D.shownNotices(D.noteStart(D.emptyDegraded(), 'pam', 'Pam', '  ', 1), team), []);
});

test('one card per member, the latest start wins, oldest member first', () => {
  // Value: protects=a restart never stacks cards; fails_when=two starts make two cards or the newer text is lost; why_new=new notices; seam=pure; no_claim=none beyond protects
  let s = D.noteStart(D.emptyDegraded(), 'pam', 'Pam', 'first', 100);
  s = D.noteStart(s, 'kelly', 'Kelly', 'kelly text', 150);
  s = D.noteStart(s, 'pam', 'Pam', 'second', 200);
  assert.deepEqual(D.shownNotices(s, team).map((n) => [n.agentId, n.message]), [['kelly', 'kelly text'], ['pam', 'second']]);
});

test('Got it hides the sentence until it changes or the member starts clean', () => {
  // Value: protects=a dismissed card stays away for the same problem, yet comes back for a new one or a recurrence; fails_when=Got it does nothing, or hides a different problem, or hides it forever; why_new=new notices; seam=pure; no_claim=none beyond protects
  let s = D.noteStart(D.emptyDegraded(), 'pam', 'Pam', PROXY, 100);
  s = D.dismissNotice(s, 'pam');
  assert.deepEqual(D.shownNotices(s, team), []);
  // The same problem on the next start stays dismissed.
  s = D.noteStart(s, 'pam', 'Pam', PROXY, 200);
  assert.deepEqual(D.shownNotices(s, team), []);
  // A different problem shows.
  const other = D.noteStart(s, 'pam', 'Pam', 'something else', 300);
  assert.equal(D.shownNotices(other, team).length, 1);
  // A clean start forgets the Got it, so the same problem coming back shows.
  s = D.noteStart(s, 'pam', 'Pam', undefined, 400);
  s = D.noteStart(s, 'pam', 'Pam', PROXY, 500);
  assert.equal(D.shownNotices(s, team).length, 1);
  // Got it on a member with no card changes nothing.
  assert.equal(D.dismissNotice(s, 'nobody'), s);
});

test('a member who left the team takes its card with it, and the list is capped', () => {
  // Value: protects=no card for a member that is gone, and no unbounded growth; fails_when=an archived member's card stays or the list grows past the cap; why_new=new notices; seam=pure; no_claim=none beyond protects
  let s = D.noteStart(D.emptyDegraded(), 'pam', 'Pam', 'x', 1);
  s = D.noteStart(s, 'oscar', 'Oscar', 'y', 2);
  assert.deepEqual(D.shownNotices(s, (id) => id === 'oscar').map((n) => n.agentId), ['oscar']);
  let big = D.emptyDegraded();
  for (let i = 0; i < D.DEGRADED_NOTICES_MAX + 10; i++) big = D.noteStart(big, `m${i}`, `M${i}`, 'z', i);
  assert.equal(big.notices.length, D.DEGRADED_NOTICES_MAX);
});

test('main keeps the notice at every start and answers the window, whatever the notifications setting', () => {
  // Value: protects=the in app card does not depend on the notifications setting; fails_when=the spawn stops noting starts, the note sits behind ownerToast's setting, or the IPC names drift; why_new=new wiring; seam=source pins; no_claim=a rendered card (renderer not run)
  const main = read('src/main/index.ts');
  assert.match(main, /if \(inj\.degraded\) ownerToast\('Agent running degraded', inj\.degraded\);\s*noteDegradedStart\(opts\.hive\.id, opts\.hive\.name, inj\.degraded\);/);
  const toast = main.slice(main.indexOf('function ownerToast('), main.indexOf('let degradedState'));
  assert.ok(!/noteDegradedStart|degradedState/.test(toast), 'the notice is not inside the notifications gate');
  assert.match(main, /ipcMain\.handle\('degraded:list', \(\) => degradedShown\(\)\)/);
  assert.match(main, /ipcMain\.handle\('degraded:dismiss'/);
  assert.match(main, /send\('degraded:changed', degradedShown\(\)\)/);
  const pre = read('src/preload/index.ts');
  for (const ch of ["'degraded:list'", "'degraded:dismiss'", "'degraded:changed'"]) assert.ok(pre.includes(ch), ch);
});

test('Ask me shows each one as Michael\'s report, never in the coral count', () => {
  // Value: protects=the card is a report (no coral pill) on Ask me with Got it, and its title exists in every language; fails_when=it is counted as a question, not rendered, or a locale lacks the title; why_new=new card; seam=source pins; no_claim=visual layout
  const feed = read('src/renderer/src/shell/useNeedsYou.ts');
  assert.match(feed, /\(merged\.knowledgeNotice \? 1 : 0\) \+ merged\.degraded\.length/, 'counted as reports');
  const count = feed.slice(feed.indexOf('count: merged.tasks'), feed.indexOf('reports: merged.tasks'));
  assert.ok(!/degraded/.test(count), 'never in the coral count');
  assert.match(feed, /onDegradedChanged\?\.\(\(list\) => publish\(\{ degraded: list \}\)\)/);
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(ask, /degraded\.map\(\(n\) => \(\s*<DegradedNoticeCard/);
  assert.match(ask, /window\.cth\.degradedDismiss\?\.\(notice\.agentId\)/);
  assert.match(ask, /t\('askMe\.report'\)[\s\S]{0,600}t\('askMe\.gotIt'\)/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const title = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).degradedNotice?.title;
    assert.ok(typeof title === 'string' && title.includes('{{name}}'), `${loc} degradedNotice.title`);
    assert.ok(!/[–—]|\s-\s/.test(title), `${loc}: no dashes`);
  }
});
