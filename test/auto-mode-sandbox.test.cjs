/**
 * Auto mode keeps the OS sandbox ON.
 *
 * The app used to spawn every auto-mode agent with no sandbox at all (codex
 * `--dangerously-bypass-approvals-and-sandbox`; Claude with its opt-in sandbox
 * never enabled) for one reason: a hive worker writes to its agent folder under
 * <harnessHome>/hive/agents/<id>/, which sits OUTSIDE the project cwd. That is a
 * path-layout problem. Fix: keep the sandbox and declare those paths writable —
 * codex via `--add-dir`, Claude via `sandbox.filesystem.allowWrite` plus
 * `permissions.additionalDirectories` in the per-session settings file, and
 * Gemini CLI via `context.includeDirectories` in its per-agent settings file
 * (its file tools refuse any path outside the workspace).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager, geminiIncludeDirArg } = loadTs('src/main/hive.ts');
const { autoModeFlagForProvider } = loadTs('src/shared/agentProvider.ts');

function tmpHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'md-sandbox-')); }

test('codex auto mode is workspace-write with approvals off, never the full bypass', () => {
  const flag = autoModeFlagForProvider('codex');
  assert.equal(flag, '-a never -s workspace-write');
  assert.ok(!flag.includes('dangerously'));
});

test('a Claude agent gets a native sandbox that still allows its agent dir and the hive root', async () => {
  const home = tmpHome();
  const hive = new HiveManager(() => home);
  const palace = path.join(home, 'palace');
  const inj = await hive.ensureAgent(
    { id: 'jim-1', name: 'Jim', provider: 'claude', cwd: home },
    { extraWritableDirs: [palace] }
  );
  const i = inj.args.indexOf('--settings');
  assert.ok(i >= 0, 'claude spawn carries --settings');
  const settings = JSON.parse(fs.readFileSync(inj.args[i + 1], 'utf8'));
  const agentDir = path.join(home, 'hive', 'agents', 'jim-1');
  const hiveRoot = path.join(home, 'hive');
  assert.equal(settings.sandbox.enabled, true);
  assert.notEqual(settings.sandbox.failIfUnavailable, true, 'Windows must still spawn');
  assert.deepEqual(settings.sandbox.filesystem.allowWrite, [agentDir, hiveRoot, palace]);
  // Both layers, or the agent deadlocks: Edit/Write allowed but `mv … .done/` denied.
  assert.deepEqual(settings.permissions.additionalDirectories, settings.sandbox.filesystem.allowWrite);
  // No bypass of the sandbox anywhere in the injected args.
  assert.ok(!inj.args.some((a) => /dangerously/.test(a)));
});

test('a Gemini agent gets its agent dir and the triage folder in its workspace, in its settings and on argv, never the whole hive', async () => {
  const base = tmpHome();
  // The office sits inside the business folder beside the agent's own folder,
  // and the business name holds a comma, which Gemini's flag splits on.
  const biz = path.join(base, 'Acme, LLC');
  const home = path.join(biz, 'Office');
  const cwd = path.join(biz, 'Support');
  fs.mkdirSync(cwd, { recursive: true });
  const palace = path.join(base, 'Mem, Palace');
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent(
    { id: 'kelly-1', name: 'Kelly', provider: 'gemini', cwd },
    { extraWritableDirs: [palace] }
  );
  assert.equal(
    inj.env.GEMINI_CLI_TRUST_WORKSPACE,
    'true',
    'Gemini worker explicitly trusts its workspace'
  );
  const agentDir = path.join(home, 'hive', 'agents', 'kelly-1');
  const triage = path.join(home, 'hive', 'triage');

  // Gemini CLI up to 0.59 reads the per-agent settings file: every folder, commas and all.
  const settingsPath = inj.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
  assert.equal(typeof settingsPath, 'string', 'gemini spawn points at its own settings file');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepEqual(settings.context.includeDirectories, [agentDir, triage, palace]);
  assert.equal(settings.hooksConfig.enabled, true);

  // 0.60 and later skip that file, so the folders ride on argv as well. A path
  // with a comma goes relative to cwd; the palace, still holding one, stays off.
  const included = [];
  inj.args.forEach((a, i) => { if (a === '--include-directories') included.push(inj.args[i + 1]); });
  assert.deepEqual(included, [
    path.join('..', 'Office', 'hive', 'agents', 'kelly-1'),
    path.join('..', 'Office', 'hive', 'triage')
  ]);
  assert.ok(included.every((d) => !d.includes(',')));
  // The protocol seed still comes last, after Gemini's own flags.
  assert.equal(inj.args[inj.args.length - 2], '-i');
  assert.match(inj.args[inj.args.length - 1], /HIVE PROTOCOL/);
});

test('geminiIncludeDirArg keeps a plain path and moves a comma out of the way when it can', () => {
  const cwd = path.join(os.tmpdir(), 'Acme, LLC', 'Support');
  const plain = path.join(os.tmpdir(), 'HarnessAgents', 'hive');
  assert.equal(geminiIncludeDirArg(cwd, plain), plain);
  const sibling = path.join(os.tmpdir(), 'Acme, LLC', 'Office', 'hive');
  assert.equal(geminiIncludeDirArg(cwd, sibling), path.join('..', 'Office', 'hive'));
  assert.equal(geminiIncludeDirArg(cwd, path.join(os.tmpdir(), 'Smith, Jones')), undefined);
  assert.equal(geminiIncludeDirArg('', sibling), undefined);
});

test('a Codex member may write its own folder and the triage folder, never the hive that holds the hook program; Michael keeps the hive for the board', async () => {
  // Value: protects=no Codex or Gemini member can rewrite the hook program every Claude agent runs outside its sandbox, or another member's private folder, through a write grant over the whole hive (Codex's sandbox can't wall part of a folder); fails_when=a non-Claude member's --add-dir list includes the hive root or its bin folder, or drops its own folder or the triage folder it files into, or Michael loses the hive he writes the board in; why_new=owner 2026-11-09 after PR 699's security review; seam=real ensureAgent args; no_claim=a live Codex sandbox run
  const home = tmpHome();
  const cwd = path.join(home, 'Support');
  fs.mkdirSync(cwd, { recursive: true });
  const hive = new HiveManager(() => home);
  const dirs = (inj) => inj.args.flatMap((a, i) => (a === '--add-dir' ? [inj.args[i + 1]] : []));
  const hiveRoot = path.join(home, 'hive');
  const member = dirs(await hive.ensureAgent({ id: 'kelly-1', name: 'Kelly', provider: 'codex', cwd }));
  assert.deepEqual(member, [path.join(hiveRoot, 'agents', 'kelly-1'), path.join(hiveRoot, 'triage')]);
  assert.ok(!member.includes(hiveRoot) && !member.some((d) => d.startsWith(path.join(hiveRoot, 'bin'))), 'never the hive or its hook program');
  assert.ok(fs.statSync(path.join(hiveRoot, 'triage')).isDirectory(), 'the triage folder exists to be granted');
  const god = dirs(await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'codex', cwd, isGod: true }));
  assert.ok(god.includes(hiveRoot), 'Michael writes the board and tasks.json at the top of the hive');
});
