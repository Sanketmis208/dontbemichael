'use strict';

// The app is English only (owner, 2026-11-11). The strings stay in en.json and
// reach the UI through t(), but there is no other locale, no language picker,
// no right to left layout and no Arabic terminal mode. These checks keep a
// half removed language path from coming back.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(tsx?|cjs|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('en.json is the only locale', () => {
  // Value: protects=the English only decision; fails_when=another locale file is added back; why_new=owner 2026-11-11; seam=none; no_claim=the strings themselves (no-dashes, i18n-keys-exist)
  assert.deepEqual(fs.readdirSync(path.join(root, 'src/renderer/src/i18n/locales')), ['en.json']);
});

test('i18n loads English only and reads no saved language', () => {
  // Value: protects=a language an older build saved is ignored, so English always shows; fails_when=i18n registers another resource or reads cth.language again; why_new=owner 2026-11-11; seam=source pin
  // Comments removed: the header explains what happens to a saved language.
  const src = read('src/renderer/src/i18n/index.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.match(src, /resources: \{ en: \{ translation: en \} \},/);
  assert.match(src, /lng: 'en',/);
  assert.match(src, /supportedLngs: \['en'\],/);
  assert.doesNotMatch(src, /localStorage|cth\.language|navigator/);
  assert.doesNotMatch(src, /export (const LANGUAGES|function setLanguage|function isRtlLanguage|function directionFor)/);
});

test('no right to left or Arabic terminal path is left in the app', () => {
  // Value: protects=the left to right path is the only one; fails_when=a component, style or terminal setting branches on a right to left language again; why_new=owner 2026-11-11; seam=source scan
  for (const f of ['src/renderer/src/i18n/useDirection.ts', 'src/renderer/src/terminal/arabicSetting.ts', 'src/renderer/src/terminal/arabicJoiner.ts', 'src/renderer/src/terminal/arabicSpacingFix.ts']) {
    assert.equal(fs.existsSync(path.join(root, f)), false, `${f} is back`);
  }
  const hits = [];
  for (const f of sourceFiles('src')) {
    const s = read(f);
    if (/\buseRtl\b|\bisRtlLanguage\b|\buseDirectionSync\b|arabicSetting|isArabicTerminalEnabled|SHOW_LANGUAGE_PICKER|\[dir="rtl"\]|cth-bidi/.test(s)) hits.push(f);
  }
  assert.deepEqual(hits, []);
});
