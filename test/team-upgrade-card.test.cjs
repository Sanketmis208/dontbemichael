'use strict';

/**
 * The team upgrade is Michael's card on Ask me, with no top bar chip
 * (docs/designs/team-upgrade-card.md; owner 2026-11-05, D2: Later until a
 * newer Claude Code). These tests do not render React: the wiring is pinned by
 * source; the shown rule is cliUpdateToastVisible (cli-update.test.cjs).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('no chip in the top bar and no corner toast', () => {
  // Value: protects=U1 and U2: the chip and the toast are gone; fails_when=either comes back; why_new=owner ask; seam=source pin; no_claim=none beyond protects
  assert.doesNotMatch(read('src/renderer/src/shell/TopBar.tsx'), /CliUpdateBadge/);
  assert.doesNotMatch(read('src/renderer/src/App.tsx'), /CliUpdateToast/);
  for (const loc of ['en']) {
    const cli = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).cliUpdate;
    assert.equal(cli.chip, undefined, loc);
    assert.equal(typeof cli.title, 'string', loc);
  }
});

test('the card is on Ask me from Michael, counted, and keeps All clear away', () => {
  // Value: protects=the card shows where the owner works, from Michael, and the number agrees; fails_when=it leaves Ask me, the count or boardEmpty; why_new=new card; seam=source pin; no_claim=the look
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(ask, /<CliUpdateCard status=\{cliUpdate\} later=\{cliUpdateLater\} \/>/);
  assert.match(ask, /const boardEmpty = [^;]*!cliShown/);
  const card = read('src/renderer/src/components/CliUpdateNotice.tsx');
  assert.match(card, /<AgentAvatar id=\{godId\} name=\{godName\} size=\{16\} \/>\{godName\}/, 'from Michael');
  const feed = read('src/renderer/src/shell/useNeedsYou.ts');
  assert.match(feed, /if \(cliUpdateToastVisible\(merged\.cliUpdate, merged\.cliUpdateLater\)\) feed = \{ \.\.\.feed, count: feed\.count \+ 1 \};/);
});

test('Later lasts until a newer Claude Code; starting a close is not a Later', () => {
  // Value: protects=owner D2 and eng O1: a cancelled close brings the card back; fails_when=the start writes Later or Later stops persisting; why_new=the chip that brought it back is gone; seam=source pin; no_claim=real closing time (manual check)
  const card = read('src/renderer/src/components/CliUpdateNotice.tsx');
  assert.match(card, /onClick=\{\(\) => putOffCliUpdate\(status\.installed\)\}/);
  assert.match(card, /onClick=\{\(\) => \{ void closeAndReopen\?\.\(\); \}\}/, 'no Later on start');
  assert.match(card, /if \(!status \|\| !cliUpdateToastVisible\(status, later\) \|\| closing\) return null;/);
  const feed = read('src/renderer/src/shell/useNeedsYou.ts');
  assert.match(feed, /window\.localStorage\.setItem\(CLI_LATER_KEY, version\)/);
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /useEffect\(\(\) => \{ useStore\.setState\(\{ officeClosing: closingOpen \}\); \}, \[closingOpen\]\);/, 'aside only while the closing bar is up');
  assert.match(app, /setCloseAndReopen\(\(\) => closeOfficeAndReopenRef\.current\(\)\)/, 'a registered source, not an event');
});

test('a caught up team takes the card away, and a late read never brings back an old status', () => {
  // Value: protects=eng O2; fails_when=a null push is ignored or the start up read overwrites a push; why_new=the update card pattern ignores nulls; seam=source pin; no_claim=none beyond protects
  const feed = read('src/renderer/src/shell/useNeedsYou.ts');
  assert.match(feed, /cliPushed = true;\s*\/\/[^\n]*\n\s*publish\(\{ cliUpdate: s \?\? null \}\);/);
  assert.match(feed, /if \(!cliPushed\) publish\(\{ cliUpdate: cur \?\? null \}\);/);
});
