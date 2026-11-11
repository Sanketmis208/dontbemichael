'use strict';

/**
 * Pi is gone (owner, 2026-11-11). A team member, or Michael, saved on Pi by an
 * older build moves to Claude Code when the office loads: the Pi command and
 * model go, everything else about the member stays. The other engines are kept.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const P = loadTs('src/shared/agentProvider.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('Pi is no engine any more; the others stay', () => {
  // Value: protects=Pi is removed and only Pi; fails_when=Pi comes back as a preset or another engine is dropped with it; why_new=owner 2026-11-11; seam=pure; no_claim=what each kept engine does
  assert.equal(P.isAgentProvider('pi'), false);
  assert.ok(!P.AGENT_PROVIDER_PRESETS.some((p) => p.id === 'pi'));
  for (const id of ['claude', 'codex', 'grok', 'kimi', 'gemini', 'antigravity', 'qwen', 'opencode', 'crush', 'copilot', 'cursor', 'custom']) {
    assert.ok(P.AGENT_PROVIDER_PRESETS.some((p) => p.id === id), `${id} is kept`);
  }
  assert.ok(!P.BYOK_ENGINES.includes('pi'));
});

test('a member saved on Pi moves to Claude Code and keeps the rest', () => {
  // Value: protects=a Pi member restarts on Claude Code with its own name and folders, not as a broken custom command; fails_when=the Pi command or model survives, the member is changed otherwise, or a member on a kept engine is touched; why_new=owner 2026-11-11; seam=pure; no_claim=the spawn itself (restore rebuilds the command from config)
  const pi = { id: 'kelly', name: 'Kelly', cwd: '/x', provider: 'pi', command: 'pi --approve --model anthropic/claude-sonnet-4-5', model: 'anthropic/claude-sonnet-4-5' };
  assert.deepEqual(P.moveOffRetiredEngine(pi), { id: 'kelly', name: 'Kelly', cwd: '/x', provider: 'claude', command: '', model: undefined });
  // An older entry with no saved engine is read from its command, as before.
  assert.equal(P.moveOffRetiredEngine({ command: 'pi --approve' }).provider, 'claude');
  // Kept engines and a custom command the owner typed are left alone.
  const codex = { provider: 'codex', command: 'codex', model: 'gpt-5' };
  assert.equal(P.moveOffRetiredEngine(codex), codex);
  const custom = { provider: 'custom', command: 'pi --approve' };
  assert.equal(P.moveOffRetiredEngine(custom), custom);
  assert.equal(P.onRetiredEngine('claude', undefined), false);
  assert.equal(P.onRetiredEngine(undefined, undefined), false);
});

test('every saved roster slice and Michael\'s settings go through the move', () => {
  // Value: protects=the move happens wherever a saved member or Michael is loaded; fails_when=a slice (live, stopped, archived) or the config read skips it; why_new=owner 2026-11-11; seam=source pins; no_claim=a rendered office
  const store = read('src/renderer/src/store/store.ts');
  assert.equal((store.match(/\.\.\.moveOffRetiredEngine\(a\),/g) ?? []).length, 3, 'agents, archived and restorable');
  const cfg = read('src/main/config.ts');
  assert.match(cfg, /return offRetiredEngines\(normalizeStoredHomes\(/);
  assert.match(cfg, /onRetiredEngine\(undefined, cfg\.godProvider\)\) \{\s*cfg\.godProvider = 'claude';\s*cfg\.godModel = undefined;/);
  assert.match(cfg, /onRetiredEngine\(cfg\.defaultCommand, undefined\)\) \{\s*cfg\.defaultCommand = DEFAULTS\.defaultCommand;\s*cfg\.defaultModel = undefined;/);
  for (const f of ['src/main/hive.ts', 'src/main/index.ts']) {
    assert.ok(!/installPiHooks|PI_EXTENSION|PI_CODING_AGENT_DIR|HIVE_AUTO_APPROVE/.test(read(f)), `${f}: no Pi bridge left`);
  }
});
