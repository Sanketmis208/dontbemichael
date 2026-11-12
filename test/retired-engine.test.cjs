'use strict';

/**
 * Pi is gone (owner, 2026-11-11), and so is every engine but Claude Code, Codex
 * (ChatGPT) and Gemini CLI, the same day: Grok, Kimi, Antigravity, Qwen,
 * OpenCode, Crush, Copilot, Cursor and a custom command. A team member, or
 * Michael, saved on one of them by an older build moves to Claude Code when the
 * office loads: the old command and model go, everything else about the member
 * stays. Claude, Codex and Gemini members are left alone.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const P = loadTs('src/shared/agentProvider.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const REMOVED = ['pi', 'grok', 'kimi', 'antigravity', 'qwen', 'opencode', 'crush', 'copilot', 'cursor', 'custom'];
/** The program each removed engine ran, as an older build saved it. */
const REMOVED_COMMANDS = [
  'pi --approve',
  'grok --model grok-4.6',
  'kimi --auto',
  'agy -i --model "Gemini 3.1 Pro (High)"',
  'antigravity',
  'qwen --yolo',
  'opencode --model anthropic/claude-sonnet-4-5',
  'crush --yolo',
  'copilot -s --allow-all-tools --no-ask-user',
  'cursor-agent --force --trust',
  'agent --model gpt-5.6-luna-high',
  '/Users/me/.local/bin/cursor-agent',
  'C:\\Tools\\qwen.cmd',
  'my-own-wrapper --flag'
];

test('only Claude Code, Codex and Gemini are engines; the rest are gone', () => {
  // Value: protects=the removed engines are removed and only those; fails_when=one comes back as a preset or a kept engine is dropped with them; why_new=owner 2026-11-11, only Gemini, Claude and ChatGPT; seam=pure; no_claim=what each kept engine does
  assert.deepEqual(P.AGENT_PROVIDER_PRESETS.map((p) => p.id), ['claude', 'codex', 'gemini']);
  for (const id of ['claude', 'codex', 'gemini']) assert.equal(P.isAgentProvider(id), true, id);
  for (const id of REMOVED) {
    assert.equal(P.isAgentProvider(id), false, `${id} is no engine`);
    assert.ok(!P.AGENT_PROVIDER_PRESETS.some((p) => p.id === id), `${id} has no preset`);
  }
  assert.equal('BYOK_ENGINES' in P, false, 'the API keys for other engines went with them');
  // Setup still offers Claude Code only.
  assert.deepEqual([...P.BUILD_ENGINES], ['claude']);
});

test('a member saved on Pi moves to Claude Code and keeps the rest', () => {
  // Value: protects=a Pi member restarts on Claude Code with its own name and folders, not as a broken custom command; fails_when=the Pi command or model survives, the member is changed otherwise, or a member on a kept engine is touched; why_new=owner 2026-11-11; seam=pure; no_claim=the spawn itself (restore rebuilds the command from config)
  const pi = { id: 'kelly', name: 'Kelly', cwd: '/x', provider: 'pi', command: 'pi --approve --model anthropic/claude-sonnet-4-5', model: 'anthropic/claude-sonnet-4-5' };
  assert.deepEqual(P.moveOffRetiredEngine(pi), { id: 'kelly', name: 'Kelly', cwd: '/x', provider: 'claude', command: '', model: undefined });
  // An older entry with no saved engine is read from its command, as before.
  assert.equal(P.moveOffRetiredEngine({ command: 'pi --approve' }).provider, 'claude');
  assert.equal(P.onRetiredEngine('claude', undefined), false);
  assert.equal(P.onRetiredEngine(undefined, undefined), false);
});

test('a member saved on any removed engine moves to Claude Code and keeps the rest', () => {
  // Value: protects=every member on a removed engine restarts on Claude Code with its own name, job and folders; fails_when=a removed id or program is left on its old command or model, or anything else about the member changes; why_new=owner 2026-11-11; seam=pure; no_claim=the spawn itself (restore rebuilds the command from config)
  for (const id of REMOVED) {
    const saved = { id: 'pam', name: 'Pam', cwd: '/x', goal: 'Answer the phone.', provider: id, command: `${id} --model m`, model: 'm' };
    assert.deepEqual(P.moveOffRetiredEngine(saved),
      { id: 'pam', name: 'Pam', cwd: '/x', goal: 'Answer the phone.', provider: 'claude', command: '', model: undefined }, id);
    assert.equal(P.onRetiredEngine(undefined, id), true, `Michael on ${id}`);
  }
  // No saved engine: the program decides, a path or Windows extension included,
  // and a command the owner once typed (the old custom engine) moves too.
  for (const command of REMOVED_COMMANDS) {
    assert.equal(P.onRetiredEngine(command, undefined), true, command);
    const moved = P.moveOffRetiredEngine({ name: 'Pam', command, model: 'm' });
    assert.deepEqual(moved, { name: 'Pam', provider: 'claude', command: '', model: undefined }, command);
  }
});

test('Claude Code, Codex and Gemini members are left exactly as they are', () => {
  // Value: protects=a member on a kept engine keeps its command, model and engine; fails_when=the move touches a kept engine by id or by program; why_new=owner 2026-11-11; seam=pure; no_claim=the spawn itself
  const kept = [
    { provider: 'claude', command: 'claude --model claude-opus-5-5 --permission-mode bypassPermissions', model: 'claude-opus-5-5' },
    { provider: 'codex', command: 'codex --model gpt-5.6-sol -a never -s workspace-write', model: 'gpt-5.6-sol' },
    { provider: 'gemini', command: 'gemini --model pro --approval-mode=yolo', model: 'pro' },
    // Saved with no engine: read from the program.
    { command: 'claude' },
    { command: '/opt/homebrew/bin/claude --model claude-sonnet-5' },
    // Quoted, as a path with a space has to be to run at all.
    { command: '"C:\\Users\\Jane Smith\\.local\\bin\\claude.exe" --model claude-sonnet-5' },
    { command: 'codex' },
    { command: 'gemini.cmd --model flash' },
    { command: '' },
    {}
  ];
  for (const a of kept) {
    assert.equal(P.moveOffRetiredEngine(a), a, JSON.stringify(a));
    assert.equal(P.onRetiredEngine(a.command, a.provider), false, JSON.stringify(a));
  }
  // A saved kept engine decides even when the program reads otherwise.
  const explicit = { provider: 'claude', command: 'npx @anthropic-ai/claude-code' };
  assert.equal(P.moveOffRetiredEngine(explicit), explicit);
  for (const id of ['claude', 'codex', 'gemini']) assert.equal(P.onRetiredEngine(undefined, id), false, `Michael on ${id}`);
});

test('a hire link may name Claude Code or Codex, never a removed engine', () => {
  // Value: protects=a shared hire link cannot set a member up on a removed engine; fails_when=a removed id or the agy alias is accepted again, or claude and codex stop being accepted; why_new=owner 2026-11-11; seam=pure; no_claim=the import preview
  const { validateHireManifest, HIRE_SPEC_V1 } = loadTs('src/shared/hire.ts');
  const hire = (provider) => validateHireManifest({ spec: HIRE_SPEC_V1, name: 'Helper', provider });
  for (const provider of ['claude', 'codex']) assert.equal(hire(provider).manifest?.provider, provider, provider);
  for (const provider of ['antigravity', 'agy', 'cursor', 'custom']) {
    const r = hire(provider);
    assert.equal(r.ok, false, provider);
    assert.ok(r.errors.some((e) => e === '"provider" must be one of claude, codex'), provider);
  }
});

test('every saved roster slice and Michael\'s settings go through the move', () => {
  // Value: protects=the move happens wherever a saved member or Michael is loaded; fails_when=a slice (live, stopped, archived) or the config read skips it; why_new=owner 2026-11-11; seam=source pins; no_claim=a rendered office
  const store = read('src/renderer/src/store/store.ts');
  assert.equal((store.match(/\.\.\.moveOffRetiredEngine\(a\),/g) ?? []).length, 3, 'agents, archived and restorable');
  const cfg = read('src/main/config.ts');
  assert.match(cfg, /return offRetiredEngines\(normalizeStoredHomes\(/);
  assert.match(cfg, /onRetiredEngine\(undefined, cfg\.godProvider\)\) \{\s*cfg\.godProvider = 'claude';\s*cfg\.godModel = undefined;/);
  assert.match(cfg, /onRetiredEngine\(cfg\.defaultCommand, undefined\)\) \{\s*cfg\.defaultCommand = DEFAULTS\.defaultCommand;\s*cfg\.defaultModel = undefined;/);
});

test('no bridge, key or seed for a removed engine is left behind', () => {
  // Value: protects=removed engines leave no installer, sidecar, key path or typed seed running for nobody; fails_when=one of their bridges or plumbing comes back; why_new=owner 2026-11-11; seam=source pins; no_claim=a live spawn
  for (const f of ['src/main/hive.ts', 'src/main/index.ts', 'src/main/hooks.ts']) {
    const src = read(f);
    for (const gone of [
      /installPiHooks|PI_EXTENSION|PI_CODING_AGENT_DIR|HIVE_AUTO_APPROVE/,
      /installAgyHooks|AGY_HOOK_SHIM/,
      /installGrokHooks|GROK_HOOK_SHIM/,
      /installOpenCodePlugin|OPENCODE_PLUGIN|OPENCODE_CONFIG/,
      /installCrushConfig|CRUSH_GLOBAL/,
      /PROXY_BRIDGE_SHIM|startProxyBridge|stopAllProxyBridges|CostSample/,
      /BACKEND_KEY_ENV|providerKey:(set|has|clear)/,
      /seedPrompt|type-into-tui/
    ]) assert.doesNotMatch(src, gone, `${f}: ${gone}`);
  }
  assert.equal(fs.existsSync(path.resolve(__dirname, '../src/shared/grokCommands.ts')), false);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../src/renderer/src/components/AiEnginesSettings.tsx')), false);
  // The Codex and Gemini bridges stay.
  const hive = read('src/main/hive.ts');
  assert.match(hive, /private installCodexHooks\(/);
  assert.match(hive, /private installGeminiHooks\(/);
});
