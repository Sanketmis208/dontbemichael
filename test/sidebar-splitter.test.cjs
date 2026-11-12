'use strict';

/**
 * The side panel's splitter: dragged with the mouse or moved with the arrow
 * keys, it widens toward the office floor and stays between its limits.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { splitterMax, dragWidth, keyWidth, KEY_STEP } = loadTs('src/renderer/src/components/sidebarWidth.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const lim = { min: 320, max: 1200, viewportWidth: 1400 };

test('the arrow keys change the width by one step, and other keys do nothing', () => {
  // Value: protects=the splitter works from the keyboard; fails_when=an arrow is ignored or the step is lost; why_new=PR #299; seam=none
  assert.equal(keyWidth('ArrowLeft', 500, lim), 500 + KEY_STEP);
  assert.equal(keyWidth('ArrowRight', 500, lim), 500 - KEY_STEP);
  assert.equal(keyWidth('Enter', 500, lim), undefined);
});

test('the width stays between its limits', () => {
  // Value: protects=the panel never swallows the floor or vanishes; fails_when=a key or drag passes min or the viewport cap; why_new=PR #299; seam=none
  assert.equal(splitterMax(lim), 1040, 'viewport leaves 360 px of floor');
  assert.equal(keyWidth('ArrowRight', 330, lim), 320);
  assert.equal(keyWidth('ArrowLeft', 1030, lim), 1040);
  assert.equal(dragWidth(500, 100, -900, lim), 1040);
  assert.equal(dragWidth(500, 100, 900, lim), 320);
});

test('dragging toward the floor widens the panel, away narrows it', () => {
  // Value: protects=the panel resizes the way the hand moves; fails_when=a drag right widens the panel on the right; why_new=owner review on #299; seam=none
  assert.equal(dragWidth(500, 100, 150, lim), 450);
  assert.equal(dragWidth(500, 100, 50, lim), 550);
});

test('the splitter uses these rules, and its hint is short', () => {
  // Value: protects=the component and the tested rules stay one; fails_when=the drag or keys keep their own copy, or the hint grows back; why_new=owner review on #299; seam=source pins
  const src = read('src/renderer/src/components/SidebarSplitter.tsx');
  assert.match(src, /dragWidth\(startRef\.current\.width, startRef\.current\.clientX, e\.clientX, limits\)/);
  assert.match(src, /keyWidth\(e\.key, width, limits\)/);
  const hints = { en: 'Drag to resize. Double click to reset.' };
  for (const l of ['en']) {
    const s = JSON.parse(read(`src/renderer/src/i18n/locales/${l}.json`)).sidebar;
    assert.ok(s.resizeTitle && s.resizeLabel, l);
    if (hints[l]) assert.equal(s.resizeTitle, hints[l]);
    assert.doesNotMatch(s.resizeTitle, /arrow/i, `${l}: the hint stays short`);
  }
});
