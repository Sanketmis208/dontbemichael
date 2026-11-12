'use strict';

/**
 * No fake activity on the floor (2026-11-11). A demo loop used to start
 * whenever no team member had a live terminal (at launch, while the team was
 * restored, or with everyone stopped) and drove the owner's REAL team members:
 * walked them to stations, gave them invented actions and lines such as
 * "Done with that one. What next?", and flew fake hand-offs between pods.
 * It is gone; only real events move people on the floor.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function sources(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(rel));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

test('nothing invents activity for real team members', () => {
  // Value: protects=the floor shows only real work, never a demo loop on the owner's team; fails_when=a mock loop, a synthetic hand-off event or its invented lines come back anywhere in src; why_new=owner, 2026-11-11 (fake activity during launch and restore); seam=source scan; no_claim=a rendered floor (renderer not run)
  assert.ok(!fs.existsSync(path.join(root, 'src/renderer/src/store/mockEvents.ts')), 'the mock loop file is gone');
  for (const f of sources('src')) {
    const s = read(f);
    assert.ok(!/startMockLoop|mockEvents|cth:demo-handoff/.test(s), `${f}: no demo loop or synthetic hand-off`);
    assert.ok(!s.includes('Done with that one. What next?'), `${f}: no invented agent line`);
  }
});

test('the floor flies only real hive messages', () => {
  // Value: protects=hand-off flights come from the hive route events alone; fails_when=another event source feeds fly(); why_new=the demo listener was removed; seam=source pin; no_claim=animation timing
  const life = read('src/renderer/src/scene/studio/life.tsx');
  assert.match(life, /const off = window\.cth\.onHiveMessage\(fly\);\s*return off;/);
});
