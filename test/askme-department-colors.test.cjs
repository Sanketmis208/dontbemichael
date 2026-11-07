'use strict';

/**
 * The Ask me department row that shows one department's cards, its chips in
 * each department's wash, with the cards themselves kept white
 * (docs/designs/ask-me-department-colors.md; owner 2026-11-05: after seeing
 * colored cards, white cards and the filter row).
 *
 * The pure rules (askMeFilter.ts, the wash in theme.ts) are tested as code;
 * the board wiring in AskMeTab and the card components is pinned by source,
 * since these tests do not render React.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

// theme.ts imports '@/design/tokens', which load-ts does not resolve: hand it
// the real module.
const tokens = loadTs('src/renderer/src/design/tokens.ts');
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@/design/tokens') return tokens;
  return origLoad.call(this, request, ...rest);
};
const { family } = loadTs('src/renderer/src/scene/studio/theme.ts');
Module._load = origLoad;

const F = loadTs('src/renderer/src/components/askMeFilter.ts');

test('each department has the measured wash, light and dark', () => {
  // Value: protects=the department chip fill, measured for 4.5:1 text; fails_when=a mix ratio or the card hex changes; why_new=no family test existed; seam=none; no_claim=how distinct the colors look (screenshot check)
  const expected = {
    'front-desk': ['#FFF2F6', '#3B2736'], support: ['#EEF7FF', '#283043'], sales: ['#FFF9E6', '#3B3530'],
    finance: ['#ECFAF4', '#283A3B'], marketing: ['#FFF3EC', '#3B2E30'], people: ['#F7F3FE', '#2F2743'],
    it: ['#F0F3FB', '#282C43'], operations: ['#EAF9FA', '#283943'], team: ['#F6F5FB', '#2B2743']
  };
  for (const [d, [light, dark]] of Object.entries(expected)) {
    assert.equal(family(d, false).wash, light, `${d} light`);
    assert.equal(family(d, true).wash, dark, `${d} dark`);
  }
});

test('adding the wash leaves the studio colors as they were', () => {
  // Value: protects=pods, avatars and chips keep their l, m, d and acc; fails_when=the wash change alters another field; why_new=no family test existed; seam=none; no_claim=studio rendering
  for (const [d, c] of Object.entries(tokens.departments)) {
    const f = family(d, false);
    assert.deepEqual([f.l, f.m, f.d, f.acc], [c.l, c.m, c.d, c.acc], d);
  }
  const darkL = { 'front-desk': '#7B3D4F', support: '#3D5B7B', sales: '#7B6B3D', finance: '#3D7B5F', marketing: '#7B523D', people: '#533D7B', it: '#3D4C7B', operations: '#3D797B', team: '#463D7B' };
  for (const [d, l] of Object.entries(darkL)) assert.equal(family(d, true).l, l, `${d} dark l`);
});

test('the card surface in tokens.ts is the one in tokens.css', () => {
  // Value: protects=the wash is mixed into the real card color; fails_when=one file's card changes alone; why_new=new duplicate value; seam=none; no_claim=none beyond protects
  const css = read('src/renderer/src/design/tokens.css');
  const cards = [...css.matchAll(/--cth-card:\s*(#[0-9A-Fa-f]{6});/g)].map((m) => m[1].toUpperCase());
  assert.deepEqual(cards.slice(0, 2), [tokens.cardSurface.light, tokens.cardSurface.dark]);
});

const roster = [
  { id: 'god', isGod: true },
  { id: 'oscar', character: 'oscar' },
  { id: 'kelly', character: 'kelly' },
  { id: 'nick', character: 'nick' }
];
const restorable = [{ id: 'dwight', character: 'dwight' }];

test('a member card takes its member\'s department; Michael, strangers and odd ids take none', () => {
  // Value: protects=the color rule's white cases; fails_when=Michael or an unknown id gets a color, or a not yet restored member loses theirs; why_new=new rule; seam=none; no_claim=none beyond protects
  assert.equal(F.memberDepartment('oscar', roster, restorable), 'finance');
  assert.equal(F.memberDepartment('nick', roster, restorable), 'it');
  assert.equal(F.memberDepartment('dwight', roster, restorable), 'sales', 'restorable roster, like the avatar');
  assert.equal(F.memberDepartment('god', roster, restorable), null);
  assert.equal(F.memberDepartment('nobody', roster, restorable), null);
  assert.equal(F.memberDepartment({ id: 'oscar' }, roster, restorable), null, 'agents write tasks.json');
  assert.equal(F.memberDepartment(undefined, roster, restorable), null);
});

test('a Company foundations card takes the area its question is about', () => {
  // Value: protects=design D2, D3: area color, shared questions take the asker's area; fails_when=the raiser's department or white is used; why_new=new rule; seam=none; no_claim=none beyond protects
  assert.equal(F.foundationDepartment('money', 'sales'), 'finance', 'a bank question is Finance whoever asks');
  assert.equal(F.foundationDepartment('accounting', null), 'finance');
  assert.equal(F.foundationDepartment('offer', 'support'), 'support', 'shared: the asker\'s area when it is one of them');
  assert.equal(F.foundationDepartment('offer', 'it'), 'sales', 'shared: else the first in section order');
  assert.equal(F.foundationDepartment('offer', 'team'), 'sales');
  assert.equal(F.foundationDepartment('hours', null), 'support');
});

const board = [
  { key: 'schedule:1', dept: 'finance' },
  { key: 'update', dept: null },
  { key: 'r1', dept: 'it' },
  { key: 'r2', dept: 'finance' },
  { key: 'report', dept: 'sales', keep: true },
  { key: 'r3', dept: 'support' }
];

test('chips follow the order departments first appear on the board', () => {
  // Value: protects=design 1B order; fails_when=chips sort another way; why_new=new; seam=none; no_claim=none beyond protects
  assert.deepEqual(F.departmentsOnBoard(board), ['finance', 'it', 'sales', 'support']);
});

test('no pick hides nothing; a pick hides other departments but keeps reports and cards with no department', () => {
  // Value: protects=D6 and the unchanged board with no pick (newest first stays, D9); fails_when=a card is hidden with no pick, or Michael or a report hides; why_new=new; seam=none; no_claim=render order on screen
  assert.equal(F.hiddenKeys(board, null).size, 0);
  assert.deepEqual([...F.hiddenKeys(board, 'finance')].sort(), ['r1', 'r3']);
  assert.deepEqual([...F.hiddenKeys(board, 'it')].sort(), ['r2', 'r3', 'schedule:1']);
});

test('the row shows with two departments, and stays while one is picked', () => {
  // Value: protects=a pick can always be undone; fails_when=the row hides with one department left while picked; why_new=new; seam=none; no_claim=none beyond protects
  const one = [{ key: 'a', dept: 'finance' }, { key: 'b', dept: null }];
  assert.equal(F.showDepartmentRow(one, null), false);
  assert.equal(F.showDepartmentRow(one, 'finance'), true);
  assert.equal(F.showDepartmentRow(board, null), true);
});

test('a card arriving while another department is picked marks its chip until that chip or Show all', () => {
  // Value: protects=design 2A dot rules; fails_when=the picked department marks itself, a switch forgets another mark, or nothing marks; why_new=new; seam=none; no_claim=how visible the dot is
  let s = F.pickDepartment(null, 'finance', board);
  assert.equal(F.noteArrivals(s, board), s, 'nothing new: same object');
  s = F.noteArrivals(s, [...board, { key: 'r4', dept: 'it' }, { key: 'r5', dept: 'finance' }]);
  assert.deepEqual([...s.fresh], ['it'], 'the picked department\'s own arrivals are not marked');
  s = F.noteArrivals(s, [...board, { key: 'r4', dept: 'it' }, { key: 'r5', dept: 'finance' }, { key: 'r6', dept: 'support' }]);
  s = F.pickDepartment(s, 'it', board);
  assert.equal(s.picked, 'it');
  assert.deepEqual([...s.fresh], ['support'], 'picking IT clears IT only');
  assert.equal(F.pickDepartment(s, 'it', board), null, 'picking it again shows all');
});

test('a pick clears itself when its department runs dry, but not on a roster gap', () => {
  // Value: protects=auto clear and the roster gate (eng V8); fails_when=a stale pick stays or a reload clears it; why_new=new; seam=none; no_claim=none beyond protects
  const s = F.pickDepartment(null, 'marketing', board);
  assert.equal(F.pickRunsDry(s, board, true), true);
  assert.equal(F.pickRunsDry(s, board, false), false, 'roster not loaded yet');
  assert.equal(F.pickRunsDry(F.pickDepartment(null, 'it', board), board, true), false);
  assert.equal(F.pickRunsDry(null, board, true), false);
});

test('the board wires the filter, the washes and the focus rules', () => {
  // Value: protects=E1 reset on hide, D6 focus on a hidden card, D7 state in the board, the sticky row's clearance and quiet status; fails_when=an effect, guard or selector is removed; why_new=new; seam=source pin; no_claim=real Electron behavior (source check only)
  const src = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(src, /useState<FilterState \| null>\(null\)/, 'filter state lives in the board, not the store');
  assert.match(src, /s\.columnMinimized \|\| \(s\.floorView !== 'office' && s\.floorView !== 'file'\)/);
  assert.match(src, /if \(boardHidden\) setFilter\(null\)/);
  assert.match(src, /if \(hiddenRef\.current\.has\(first\.key\)\) setFilter\(null\);/);
  assert.match(src, /'\.cth-askme-card\.is-open:not\(\[data-askme-hidden\]\)'/);
  assert.match(src, /scrollPaddingTop: rowHeight \? rowHeight \+ 12 : undefined/);
  assert.match(src, /<div role="status" className="cth-sr-only">\{filterStatus\}<\/div>/);
  assert.match(src, /if \(lastPicked\.current === picked\) return;/, 'speaks only when the pick changes');
  assert.match(src, /pickRunsDry\(filter, cardsRef\.current, rosterLoaded\)/);
  assert.match(src, /\.\.\.\(isHidden \? \{ display: 'none' \} : \{\}\)/);
  assert.match(src, /boxShadow: `inset 0 0 0 1px \$\{f\.m\}`/, 'the person chip as it always was');
  assert.match(src, /areaName=\{area \? deptName\(area\) : undefined\} hidden=\{isHidden\}/);
  assert.doesNotMatch(src, /background: (x)?[fF]am\.wash|fam\?\.wash/, 'cards stay white (owner, 2026-11-05)');
  assert.equal(src.includes('ask-me-department-colors.md'), true);
});

test('hidden list cards stay mounted and draw nothing, whatever their own layout', () => {
  // Value: protects=eng W1: inline display flex beats the hidden attribute; fails_when=a card kind goes back to the hidden attribute or drops the none branch; why_new=new; seam=source pin; no_claim=real rendering
  for (const f of ['ScheduleRequestCards', 'WorkStyleUpdateCards', 'MailProposalCards']) {
    const src = read(`src/renderer/src/components/${f}.tsx`);
    assert.match(src, /style=\{foldCardStyle\(f\.open, hide\)\}/, f);
    assert.doesNotMatch(src, /lk\?\.fill|lk\?\.ring/, `${f}: stays white`);
    assert.match(src, /lk\.dept\}/, `${f}: department in words`);
  }
  assert.match(read('src/renderer/src/components/AskCardFold.tsx'), /display: hide \? 'none' : 'flex'/);
  assert.match(read('src/renderer/src/components/AskCardFold.tsx'), /background: 'var\(--cth-card\)',/);
  assert.match(read('src/renderer/src/components/FoundationCard.tsx'), /style=\{\{ \.\.\.cardStyle, \.\.\.\(hidden \? \{ display: 'none' \} : \{\}\) \}\}/);
});

test('the new words exist in every language, with no dashes', () => {
  // Value: protects=copy in en, ar and zh-CN and the no dashes rule; fails_when=a key is missing or a dash slips in; why_new=new copy; seam=none; no_claim=translation quality
  const keys = ['deptFilter', 'showing', 'showAll', 'showingEvery', 'deptNew', 'personDept', 'areaQuestion', 'areaQuestionFrom'];
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const askMe = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).askMe;
    for (const k of keys) {
      assert.equal(typeof askMe[k], 'string', `${loc}.${k}`);
      assert.doesNotMatch(askMe[k], /[–—]| - /, `${loc}.${k} has a dash`);
    }
  }
});

test('mail, schedule and Work style cards fold under the board\'s one open card rule', () => {
  // Value: protects=the owner's 2026-11-05 ask (fold them like questions) and edits surviving a fold; fails_when=a card kind loses its header, unmounts its body when folded, or opens apart from the board's rule; why_new=new behavior; seam=source pin; no_claim=the look and real clicks (source check only)
  const fold = read('src/renderer/src/components/AskCardFold.tsx');
  assert.match(fold, /role="button"\s+tabIndex=\{0\}\s+aria-expanded=\{open\}/);
  assert.match(fold, /if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  assert.match(fold, /<div onFocusCapture=\{pin\} style=\{\{ display: open \? 'flex' : 'none'/, 'folded bodies stay mounted');
  assert.match(fold, /className="cth-askme-chevron"/);
  for (const f of ['ScheduleRequestCards', 'WorkStyleUpdateCards', 'MailProposalCards']) {
    const src = read(`src/renderer/src/components/${f}.tsx`);
    assert.match(src, /<FoldHeader open=\{f\.open\} toggle=\{f\.toggle\}/, f);
    assert.match(src, /<FoldBody open=\{f\.open\} pin=\{f\.pin\}>/, f);
    assert.match(src, /className=\{foldCardClass\(f\.open\)\}/, f);
  }
  assert.match(read('src/renderer/src/components/MailProposalCards.tsx'), /summary=\{<>\{t\('askMe\.mailTo', \{ to: isolate\(p\.to\) \}\)\}<br \/>\{subject\}<\/>\}/, 'folded mail shows the recipient and subject');
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  for (const k of ['schedule:', 'offer:', 'mail:']) assert.ok(ask.includes(`fold={foldFor('${k}')}`), k);
  assert.match(ask, /toggle: \(\) => setOpenId\(openKey === key \? null : key\), pin: \(\) => setOpenId\(key\)/);
});
