'use strict';
/**
 * Agent-provider registry tests. Self-contained, no test framework — run with
 * `node test/agent-provider.test.cjs` (mirrors test/kg-core.test.cjs). The
 * registry lives in TypeScript (src/shared/agentProvider.ts), so we transpile it
 * and its two dependency-free command-group siblings with the bundled `typescript`
 * compiler into a temp dir and require the result. Exercises command inference
 * for the kept engines (Claude Code, Codex, Gemini CLI).
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const SHARED = path.join(__dirname, '..', 'src', 'shared');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprov-'));
for (const name of ['claudeCommands', 'codexCommands', 'commandLine', 'agentProvider']) {
  const src = fs.readFileSync(path.join(SHARED, `${name}.ts`), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  fs.writeFileSync(path.join(out, `${name}.js`), js, 'utf8');
}
const ap = require(path.join(out, 'agentProvider.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.log(`  ✗ ${name}\n     ${err && err.message}`); }
}

console.log('agent-provider registry tests');

test('quoted executable paths infer their provider without splitting directory names', () => {
  const cases = [
    ['"C:\\Program Files\\Codex\\codex.exe" --model example', 'codex'],
    ['"C:\\Tools\\claude.exe"', 'claude'],
    ['"C:\\Agent Tools\\gemini.cmd"', 'gemini'],
    ["'/opt/Agent Tools/gemini' --model example", 'gemini'],
    ['"/opt/Agent Tools/gemini"', 'gemini'],
    // Any other program reads as Claude Code; a member saved on one is moved
    // to Claude Code on load (onRetiredEngine), so this is never spawned as is.
    ['"C:\\Agent Tools\\custom.exe"', 'claude']
  ];
  for (const [command, provider] of cases) {
    assert.strictEqual(ap.inferAgentProvider(command), provider, command);
  }
});

test('command inference preserves bare commands, extensions, and explicit overrides', () => {
  assert.strictEqual(ap.inferAgentProvider('codex --model example'), 'codex');
  assert.strictEqual(ap.inferAgentProvider('C:\\Tools\\CODEX.EXE'), 'codex');
  assert.strictEqual(ap.inferAgentProvider('gemini.cmd'), 'gemini');
  assert.strictEqual(ap.inferAgentProvider('claude.ps1'), 'claude');
  assert.strictEqual(ap.inferAgentProvider(undefined), 'claude');
  assert.strictEqual(ap.inferAgentProvider('   '), 'claude');
  assert.strictEqual(ap.inferAgentProvider('"C:\\Agent Tools\\codex.exe"', 'gemini'), 'gemini');
});

test('codex preset still resolves (no regression)', () => {
  assert.strictEqual(ap.inferAgentProvider('codex'), 'codex');
  assert.strictEqual(ap.providerPreset('codex').defaultCommand, 'codex');
});

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll agent-provider tests passed');
