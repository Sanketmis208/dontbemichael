'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  AGENT_PROVIDER_PRESETS,
  BUILD_ENGINES,
  inferAgentProvider,
  isAgentProvider,
  providerPreset
} = loadTs('src/shared/agentProvider.ts');
const {
  buildSpawnCommand,
  decodeProviderModel,
  encodeProviderModel,
  modelProvidersForAgent,
  modelsForProvider,
  onboardingEngineChoices
} = loadTs('src/renderer/src/store/config.ts');

const autoConfig = { defaultCommand: 'claude', autoMode: true };

test('Gemini CLI has hooks, interactive seeding, resume, and current yolo mode', () => {
  assert.equal(isAgentProvider('gemini'), true);
  assert.equal(inferAgentProvider('/usr/local/bin/gemini --model pro'), 'gemini');
  const preset = providerPreset('gemini');
  assert.equal(preset.defaultCommand, 'gemini');
  assert.equal(preset.autoFlag, '--approval-mode=yolo');
  assert.equal(preset.supportsModel, true);
  assert.equal(preset.canReceiveInbox, true);
  assert.deepEqual(preset.bridge, { kind: 'hooks', shim: 'gemini' });
  assert.equal(preset.initialPromptFlag, '-i');
  assert.equal(preset.resumeFlag, '--resume');
  assert.equal(preset.installCommand, 'npm install -g @google/gemini-cli');
});

test('provider commands use matching models and equivalent bypass modes', () => {
  assert.equal(
    buildSpawnCommand(autoConfig, 'claude-sonnet-5', 'claude'),
    'claude --model claude-sonnet-5 --permission-mode bypassPermissions'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'gpt-5.6-sol', 'codex'),
    'codex --model gpt-5.6-sol -a never -s workspace-write'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'pro', 'gemini'),
    'gemini --model pro --approval-mode=yolo'
  );
});

test('model picker options stay provider-specific', () => {
  assert.equal(
    modelsForProvider('claude').find((model) => model.id === 'claude-opus-5')?.label,
    'Opus 5 · 1M'
  );
  assert.deepEqual(
    modelsForProvider('codex').map((model) => model.id),
    [undefined, 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
  );
  assert.deepEqual(
    modelsForProvider('gemini').map((model) => model.id),
    [undefined, 'auto', 'pro', 'flash', 'flash-lite']
  );
});

test('Command Center model choices round-trip provider and model', () => {
  const encoded = encodeProviderModel('codex', 'gpt-5.6-sol');
  assert.deepEqual(
    decodeProviderModel(encoded),
    { provider: 'codex', model: 'gpt-5.6-sol' }
  );
  assert.deepEqual(
    decodeProviderModel(encodeProviderModel('gemini')),
    { provider: 'gemini', model: undefined }
  );
  assert.equal(decodeProviderModel('unknown:model'), null);
  // A removed engine is no choice any more (owner, 2026-11-11).
  assert.equal(decodeProviderModel(encodeProviderModel('antigravity', 'Gemini 3.1 Pro (High)')), null);
});

test('onboarding lists every engine — orchestrator-capable first, workers-only after', () => {
  // Issue #355: the step SHOWS inbox-less engines as disabled workers-only rows
  // instead of omitting them, so the split must be exact: selectable = the
  // god-eligible set, workersOnly = everything a worker can run but Michael
  // cannot. Checked with every engine offered: that is the layout when
  // BUILD_ENGINES brings the others back. Claude, Codex and Gemini all drain
  // the inbox, so none is workers only (the inbox-less Kimi and Copilot were
  // removed, owner 2026-11-11).
  const { eligible, workersOnly } = onboardingEngineChoices(AGENT_PROVIDER_PRESETS.map((p) => p.id));
  assert.deepEqual(
    eligible.map((preset) => preset.id),
    modelProvidersForAgent(true).map((preset) => preset.id),
    'selectable rows are exactly the god-eligible engines, same order'
  );
  assert.deepEqual(eligible.map((preset) => preset.id), ['claude', 'codex', 'gemini']);
  assert.deepEqual(workersOnly.map((preset) => preset.id), []);
});

test('God only sees providers that can drain hive inbox messages', () => {
  // God-eligible = supportsModel && canReceiveInbox: all three kept engines.
  assert.deepEqual(
    modelProvidersForAgent(true).map((preset) => preset.id),
    ['claude', 'codex', 'gemini']
  );
  assert.deepEqual(
    modelProvidersForAgent(false).map((preset) => preset.id),
    ['claude', 'codex', 'gemini']
  );
});

test('this build offers only Claude Code at setup, and keeps Codex and Gemini in the code', () => {
  // The owner's call (2026-09-23): the current build supports Claude Code only.
  // Codex and Gemini stay wired so each can come back by adding its id to
  // BUILD_ENGINES, with no other change (the rest went 2026-11-11).
  assert.deepEqual([...BUILD_ENGINES], ['claude']);
  const { eligible, workersOnly } = onboardingEngineChoices();
  assert.deepEqual(eligible.map((preset) => preset.id), ['claude']);
  assert.deepEqual(workersOnly, [], 'engines this build does not offer are not shown, not even disabled');
  for (const id of ['codex', 'gemini']) {
    assert.ok(AGENT_PROVIDER_PRESETS.some((p) => p.id === id), `${id} preset must stay in the code`);
  }
  assert.ok(modelsForProvider('claude').length > 1, 'the owner still picks between Claude models');
  assert.ok(modelsForProvider('claude').some((m) => m.id === providerPreset('claude').recommendedOrchestratorModel),
    'the recommended manager model is one of the choices');
});
