'use strict';

// Agent TUIs paint their own (dark) backgrounds regardless of the app theme.
// The spawn hands every agent a COLORFGBG hint. Crush and OpenCode, which also
// got a theme in their own config dirs, were removed (owner, 2026-11-11).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-tui-theme-'));
}

test('light theme sends the light COLORFGBG hint', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  const injection = await hive.ensureAgent(
    { id: 'gem-t', name: 'Gemini', provider: 'gemini', cwd: home },
    { theme: 'light' }
  );
  assert.equal(injection.env.COLORFGBG, '0;15');
});

test('dark theme sends the dark hint', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  const injection = await hive.ensureAgent(
    { id: 'gem-d', name: 'Gemini', provider: 'gemini', cwd: home },
    { theme: 'dark' }
  );
  assert.equal(injection.env.COLORFGBG, '15;0');
});

test('no theme passed: no hint (old behaviour)', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  const injection = await hive.ensureAgent({ id: 'gem-n', name: 'Gemini', provider: 'gemini', cwd: home });
  assert.equal(injection.env.COLORFGBG, undefined);
});
