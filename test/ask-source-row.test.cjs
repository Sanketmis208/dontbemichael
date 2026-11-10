'use strict';

/**
 * The Sources row on Ask me cards and in card history
 * (docs/designs/ask-me-source-links.md). Renderer checks in this repo are
 * source pins plus pure helper tests: what shows and counts is tested in
 * ask-sources.test.cjs; these pin how the row opens and shows it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const row = read('src/renderer/src/components/SourceRow.tsx');

test('every source opens only through the paths the app already guards', () => {
  // Value: protects=a source opens only http(s) through main's scheme gate, emails in their tab, files through main's folder check; fails_when=the row opens a link directly or renders a raw anchor; why_new=new row; seam=source pins; no_claim=a real click in a browser (renderer not run)
  assert.match(row, /onClick=\{\(\) => \{ if \(isExternal\(url\)\) void window\.cth\.openExternal\?\.\(url\); \}\}/);
  assert.ok(!/<a[\s>]/.test(row), 'no raw anchor');
  assert.ok(!/window\.open\(/.test(row), 'no window.open');
  assert.match(row, /<EmailChip key=\{i\} email=\{ref\}/);
  assert.match(row, /<FileChip key=\{i\} path=\{s\.url\}/);
  assert.match(row, /sourcesOf\(entry\)/, 'the same reader the checks use');
});

test('a web chip shows the site it opens, and labels are plain text', () => {
  // Value: protects=a label can never hide where a link goes, and agent text never renders as markdown; fails_when=the site is dropped, the mismatch mark is lost, or a label is rendered through markdown; why_new=new row; seam=source pins; no_claim=visual layout
  assert.match(row, /import \{ isExternal, labelMismatch, linkName \} from '@\/markdown\/mdLinks';/, 'the same site names card links use');
  assert.match(row, /<bdi dir="ltr"/, 'the site reads left to right in a right to left interface');
  assert.ok(!/MarkdownPreview|FileText|dangerouslySetInnerHTML/.test(row), 'labels never go through markdown or raw HTML');
  assert.match(row, /if \(!items\.length && !searched\.length\) return null;/, 'no sources, no row');
  assert.match(row, /t\('askMe\.lookedIn', \{ places:/);
});

test('the row is under See full context, not on the Ask me card', () => {
  // Value: protects=the Ask me card shows the decision and its file, background sources sit in the card detail (owner, 2026-11-10, revising D1); fails_when=the row comes back on the card or leaves card detail; why_new=owner moved it; seam=source pins; no_claim=none beyond protects
  const ask = read('src/renderer/src/components/AskMeTab.tsx');
  assert.ok(!/SourceRow/.test(ask), 'no sources row on the Ask me card');
  assert.match(read('src/renderer/src/components/TasksKanban.tsx'), /<SourceRow entry=\{e\} who=\{\{ raisedBy: e\.raisedBy, assignee: qaAssignee \}\} margin="8px 0 0" \/>/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).askMe;
    for (const k of ['sources', 'lookedIn', 'sourceOpens']) assert.ok(typeof d[k] === 'string' && d[k], `${loc} askMe.${k}`);
    assert.match(d.lookedIn, /\{\{places\}\}/);
    assert.ok(!/[–—]/.test(d.lookedIn + d.sourceOpens), `${loc}: no dashes`);
  }
});

test('a source the question already shows is dropped, and a file source shows its label', () => {
  // Value: protects=the draft to review shows once and a background file says what it is (owner, 2026-11-10: three rows read as three drafts); fails_when=the row lists files the question already draws, or file chips go back to the bare file name; why_new=new display rule; seam=source pins; no_claim=a rendered card (renderer not run)
  assert.match(row, /sourcesBesideText\(sourcesOf\(entry\), chipPaths\(entryText\(entry\)\)\)/, 'the same parse that draws the question chips');
  assert.match(row, /<FileChip key=\{i\} path=\{s\.url\} label=\{s\.label\}/);
  const chip = read('src/renderer/src/components/FileChip.tsx');
  assert.match(chip, /const name = label\?\.trim\(\) \|\| \(folder \? folderTitle\(path\) : fileTitle\(path\)\);/);
  assert.match(chip, /title=\{`\u2068\$\{path\}\u2069`\}/, 'the path stays in the tooltip');
});
