'use strict';

/**
 * The Ask me answer box shows its whole hint, a picked option's question stays
 * above the box, and files attach on the card (docs/designs/ask-me-answer-box.md;
 * owner 2026-11-05, D2, D3). These tests do not render React: the wiring is
 * pinned by source, and the answer text by the shared helper.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const { withAttachments } = loadTs('src/shared/ownerRequests.ts');

test('an empty box grows to its whole hint, measured on a hidden copy', () => {
  // Value: protects=A1, a hint longer than one line is never cut off; fails_when=the placeholder measure is removed or writes into the box's value; why_new=the owner's screenshot showed a clipped hint; seam=source pin; no_claim=real layout (dev app check)
  const src = read('src/renderer/src/components/GrowingTextarea.tsx');
  assert.match(src, /if \(!el\.value && el\.placeholder && el\.parentNode\) \{/);
  assert.match(src, /const probe = el\.cloneNode\(false\) as HTMLTextAreaElement;/);
  assert.match(src, /probe\.value = el\.placeholder;/);
  assert.match(src, /probe\.remove\(\);/);
  assert.match(src, /\[value, maxHeight, rest\.placeholder\]/, 're-measures when the hint changes');
  assert.doesNotMatch(src, /el\.value = /, 'never writes into the box itself');
});

test('a picked option\'s question stays above the box, whole', () => {
  // Value: protects=owner D2: the question stays readable while typing, never clamped; fails_when=it goes back into the placeholder or gets a line clamp; why_new=new; seam=source pin; no_claim=the look
  const src = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(src, /\{pickedNote && \(\s*<div data-askme-note style=\{\{[^}]*whiteSpace: 'pre-wrap'/);
  assert.doesNotMatch(src.slice(src.indexOf('data-askme-note'), src.indexOf('data-askme-note') + 300), /WebkitLineClamp/);
  assert.match(src, /pickedNote \? translate\('askMe\.yourAnswer'\)/, 'the box itself says Your answer');
});

test('files attach on the card by paste, drop or the paperclip, and go with the answer', () => {
  // Value: protects=A2: every way in, the chips, and a file alone being an answer; fails_when=a way in is unwired, Reply ignores files, or the files are not in the sent text; why_new=new; seam=source pin; no_claim=real clipboard and drop in Electron
  const src = read('src/renderer/src/components/AskMeTab.tsx');
  assert.equal((src.match(/onPaste=\{\(e\) => \{ void attachmentsFromPaste\(e\)\?\.then\(\(f\) => addFiles\(row\.key, f\)\); \}\}/g) ?? []).length, 2, 'both boxes take a paste');
  assert.match(src, /onDragOver=\{\(e\) => \{ if \(e\.dataTransfer\.types\.includes\('Files'\)\) e\.preventDefault\(\); \}\}/);
  assert.match(src, /addFiles\(row\.key, dropped\);/);
  assert.equal((src.match(/<AddFileButton onPick=\{\(\) => void pickFiles\(row\.key\)\}/g) ?? []).length, 2, 'a paperclip in both layouts');
  assert.match(src, /const text = withAttachments\(words, files\);/);
  assert.match(src, /const toSend = pickedNote && !draft\.trim\(\) && !files\.length \? '' : answerFor\(row, shape\);/);
  assert.match(src, /disabled=\{\(!toSend && !files\.length\) \|\| sending === row\.key\}/);
  assert.match(src, /disabled=\{\(!draft\.trim\(\) && !files\.length\) \|\| sending === row\.key\}/);
  assert.match(src, /setAnswerFiles\(row\.key, \[\]\);/, 'cleared once the answer lands');
  assert.match(src, /files: files\.map\(\(f\) => f\.name\)/, 'the answered card shows names, not paths');
  const store = read('src/renderer/src/store/store.ts');
  assert.match(store, /answerFiles: Record<string, Array<\{ path: string; name: string \}>>;/);
});

test('the sent text carries the paths, and a file alone is an answer', () => {
  // Value: protects=the format Michael and the member read; fails_when=the helper changes shape; why_new=first use from Ask me; seam=none; no_claim=none beyond protects
  assert.equal(withAttachments('It said 403', [{ path: '/x/a.png', name: 'a.png' }]), 'It said 403\n\nAttached files:\n- /x/a.png (a.png)');
  assert.equal(withAttachments('', [{ path: '/x/a.png', name: 'a.png' }]), 'Attached files:\n- /x/a.png (a.png)');
  assert.equal(withAttachments('Done', []), 'Done');
});

test('Michael asks for a file to be attached on the card, never saved and named', () => {
  // Value: protects=owner D3, the agent rule; fails_when=the sentence is dropped; why_new=new rule; seam=prompt text; no_claim=that Michael follows it
  const hive = read('src/main/hive.ts');
  assert.ok(hive.includes('When an ask needs a screenshot or a file from the owner, ask them to attach it on the card: they can paste it into the answer box, drop it on the card or press Add a file. Never ask them to save it in a folder and type its name.'));
});

test('the paperclip label exists in every language, with no dashes', () => {
  // Value: protects=the paperclip copy; fails_when=a locale lacks it or a dash slips in; why_new=new copy; seam=none; no_claim=translation quality
  for (const loc of ['en']) {
    const askMe = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).askMe;
    assert.equal(typeof askMe.addFile, 'string', loc);
    assert.doesNotMatch(askMe.addFile, /[–—]| - /);
  }
});
