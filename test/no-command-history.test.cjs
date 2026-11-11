'use strict';

/**
 * Prompts the owner types to a team member are not recorded (owner,
 * 2026-11-11). The app used to save every one to the command_history table,
 * and nothing ever read it back. The table stays, empty, because shipped
 * database migrations are never edited.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('nothing records the prompts the owner types', () => {
  // Value: protects=typed prompts are not kept in a store nobody reads; fails_when=the recording, its bridge method or its handler comes back; why_new=owner 2026-11-11; seam=source pins; no_claim=rows an older build already saved
  for (const f of ['src/main/index.ts', 'src/main/db.ts', 'src/preload/index.ts',
    'src/renderer/src/components/AgentDetailPanel.tsx', 'src/renderer/src/components/CommandCenterPanel.tsx']) {
    const s = read(f);
    assert.ok(!/historyAdd|history:add|addHistory|INSERT INTO command_history/.test(s), `${f}: no prompt recording`);
  }
  // The shipped migration that creates the table is left as it was.
  assert.match(read('src/main/db.ts'), /CREATE TABLE IF NOT EXISTS command_history/);
});
