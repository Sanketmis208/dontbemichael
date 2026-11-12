'use strict';

/**
 * Michael no longer starts temporary helpers on his own (owner, 2026-09-24).
 * Starting an agent is a spend the owner never saw. When a job fits no one on
 * the team and is too big for him, he puts it on the ASK ME board with
 * suggestions, and the owner decides. The old route is gone from the code.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const buildFeatures = loadTs('src/shared/buildFeatures.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { OFFICE_ROLES } = loadTs('src/shared/officeRoles.ts');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

function promptOf(inj) {
  const i = inj.args.indexOf('--append-system-prompt');
  return inj.args[i + 1];
}

function setup(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'no-temp-workers-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home, hive: new HiveManager(() => home) };
}

test('there is no switch to bring temporary workers back', () => {
  assert.equal('ALLOW_TEMP_WORKERS' in buildFeatures, false);
});

test('Michael is never told he can start one', async (t) => {
  const { home, hive } = setup(t);
  const p = promptOf(await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true }));
  assert.doesNotMatch(p, /SPAWNING A WORKER/);
  const protocol = fs.readFileSync(path.join(home, 'hive', 'PROTOCOL.md'), 'utf8');
  assert.doesNotMatch(protocol, /Spawning a worker|spawn-requests/);
  assert.match(protocol, /## Private memory/, 'the rest of the protocol is intact');
});

test('instead, a job no one fits goes to the ASK ME board with suggestions', async (t) => {
  const { home, hive } = setup(t);
  const p = promptOf(await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true }));
  // Says outright that it overrides the older spawn wording above it.
  assert.match(p, /WHEN NO ONE FITS \(this overrides anything above about spawning a fresh agent: you cannot start one\):/);
  assert.match(p, /do NOT do it yourself and do NOT start a new agent/);
  assert.match(p, /"status": "blocked" and one humanQA ask/);
  assert.match(p, /give the choices in "options", with "recommended": true on the one you recommend/);
  // Owner, CEO review D5 (2026-11-07): give it to a member, hire, or drop it;
  // never "you do it yourself this once" while a worker member exists.
  for (const option of ['give it to an existing team member', 'add a team member for it', 'or drop it']) {
    assert.ok(p.includes(option), `offers: ${option}`);
  }
  assert.ok(!p.includes('this once'), 'Michael never offers to do the work himself');
  // A link for each role it can suggest (eng review E3): dbm:hire/<card>.
  for (const [who, { role }] of Object.entries(OFFICE_ROLES)) {
    assert.ok(p.includes(`${role} (dbm:hire/${who})`), `${role} links its card ${who}`);
  }
  assert.match(p, /Small jobs .* are not this/);
});

test('team members do not get Michael\'s rule', async (t) => {
  const { home, hive } = setup(t);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  const p = promptOf(await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home }));
  assert.doesNotMatch(p, /WHEN NO ONE FITS/);
});

test('nothing reads a spawn request, and no screen offers temporary workers', () => {
  const main = read('src/main/index.ts');
  assert.doesNotMatch(main, /spawn-requests|processSpawnRequest|orchestratorMaySpawn/);
  assert.doesNotMatch(read('src/renderer/src/components/SettingsModal.tsx'), /Who can add agents|orchestratorMaySpawn/);
  assert.doesNotMatch(read('src/renderer/src/components/CommandCenterPanel.tsx'), /'workers'|WorkersTab/);
});
