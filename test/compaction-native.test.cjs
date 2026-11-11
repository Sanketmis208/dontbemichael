'use strict';

/**
 * Compaction is Claude Code's own auto compact (owner, 2026-09-25). The app no
 * longer types /compact into idle terminals on a clock; it only sets where
 * Claude Code compacts, at spawn. The owner's optional auto-clear stays.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const triggers = loadTs('src/shared/triggers.ts');
const { AUTO_COMPACT_WINDOW_TOKENS } = triggers;
const main = read('src/main/index.ts');

test('no context upkeep runs on a clock, and the old context trigger is gone', () => {
  // Value: protects=nothing types /compact or /clear on a timer and the renderer cannot reach a context trigger; fails_when=the context timers, the triggers:getContext/setContext channels, the trigger:context event, the bridge methods or the compact-maintenance retire step come back; why_new=dead code removal 2026-11-11; seam=source pins on index.ts and the preload
  assert.deepEqual(Object.keys(triggers).filter((k) => k !== '__esModule'), ['AUTO_COMPACT_WINDOW_TOKENS']);
  assert.doesNotMatch(main, /syncContextTriggers|clearContextTimers|contextTimers|contextTrigger|COMPACT_MAINTENANCE_MISSION|compact-maintenance/);
  assert.doesNotMatch(main, /['"`]triggers:(get|set)Context['"`]|['"`]trigger:context['"`]/);
  assert.doesNotMatch(main, /emitContextTrigger/);
  assert.doesNotMatch(main, /mission:autoCompact/);
  const preload = read('src/preload/index.ts');
  assert.doesNotMatch(preload, /getContextTrigger|setContextTrigger|onContextTrigger|onAutoCompact|['"`]triggers?:/);
  assert.doesNotMatch(read('src/renderer/src/components/SettingsModal.tsx'), /compact-maintenance|autoCompact/);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../src/renderer/src/components/triggers/ContextSection.tsx')), false);
});

test('a compact-maintenance schedule left in an old config is dropped and never armed', () => {
  // Value: protects=an install from before the retirement never runs a compact schedule; fails_when=readConfig hands the leftover to syncMissions, a save writes it back, or the old trigger fields stop the config loading; why_new=dead code removal 2026-11-11; seam=electron app.getPath
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-compact-retired-'));
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
  try {
    const leftover = { id: 'compact-maintenance', label: 'Auto-compact (maintenance)', intervalMs: 3_600_000, to: '', body: '', enabled: true, autoCompact: true, kind: 'compact', lastFiredAt: 1 };
    const job = { id: 'weekly-report', label: 'Weekly report', intervalMs: 86_400_000, to: 'god', body: '', enabled: true };
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
      onboardingComplete: true,
      missions: [leftover, job],
      contextTrigger: { compact: { enabled: true, everyMs: 3_600_000 } },
      triggersMigratedV1: false,
      compactMaintenanceSeeded: true,
      officeTheme: 'friends'
    }));
    const { readConfig, writeConfig } = loadTs('src/main/config.ts');
    const cfg = readConfig();
    assert.equal(cfg.onboardingComplete, true, 'the old fields do not stop the config loading');
    assert.deepEqual(cfg.missions.map((m) => m.id), ['weekly-report'], 'the leftover is dropped on read');
    // A stale copy of the missions cannot write it back.
    writeConfig({ missions: [...cfg.missions, leftover] });
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
    assert.deepEqual(saved.missions.map((m) => m.id), ['weekly-report'], 'a save leaves it out of config.json');
    assert.deepEqual(readConfig().missions.map((m) => m.id), ['weekly-report']);
    // The scheduler arms only what readConfig returns.
    assert.match(main, /function syncMissions\(\): void \{\s*clearMissionTimers\(\);\s*const missions = readConfig\(\)\.missions \?\? \[\];/);
  } finally {
    delete require.cache[electron];
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('every Claude agent starts with Claude Code compacting at 300k, clamped to its window', () => {
  assert.equal(AUTO_COMPACT_WINDOW_TOKENS, 300000);
  assert.match(main, /CLAUDE_CODE_AUTO_COMPACT_WINDOW: String\(AUTO_COMPACT_WINDOW_TOKENS\)/);
  assert.match(main, /if \(!process\.env\.CLAUDE_CODE_AUTO_COMPACT_WINDOW && !opts\.env\?\.CLAUDE_CODE_AUTO_COMPACT_WINDOW\)/, 'the owner\'s own value wins');
});
