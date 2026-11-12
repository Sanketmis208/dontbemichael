'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  CONTEXT_COMMAND_VERBS,
  isCompactionCommand,
  terminalReadySettleMs,
  terminalReadyToReceive
} = loadTs('src/shared/providerAutomation.ts');

// — the queue's one-pending-compact invariant depends entirely on this predicate —

test('isCompactionCommand matches every provider compact verb', () => {
  // /compact (claude, codex) and /compress (gemini).
  for (const cmd of ['/compact', '/compress']) assert.equal(isCompactionCommand(cmd), true, cmd);
});

test('a focus suffix still reads as a compaction command', () => {
  // A /compact may carry a focus after the verb, so matching the whole string
  // instead of the verb would never dedupe.
  assert.equal(isCompactionCommand('/compact keep the auth decisions'), true);
  assert.equal(isCompactionCommand('  /compact   keep everything  '), true);
});

test('prose that merely mentions compaction is NOT a command', () => {
  // The queue carries human instructions too; dropping one as a duplicate
  // compact would silently lose real work.
  assert.equal(isCompactionCommand('please /compact when you are done'), false);
  assert.equal(isCompactionCommand('compact the context'), false);
  assert.equal(isCompactionCommand('summarise and compact'), false);
  assert.equal(isCompactionCommand(''), false);
});

test('a clear command is not a compaction command', () => {
  assert.equal(isCompactionCommand('/clear'), false);
  assert.equal(isCompactionCommand('/new'), false);
});
test('provider readiness policies allow each TUI to settle', () => {
  assert.equal(terminalReadySettleMs('claude'), 400);
  assert.equal(terminalReadySettleMs('codex'), 500);
  assert.equal(terminalReadySettleMs('gemini'), 500);
});

test('continuous TUI repainting cannot block terminal readiness', () => {
  assert.equal(terminalReadyToReceive(false, 10_000, 'codex'), false);
  assert.equal(terminalReadyToReceive(true, 499, 'codex'), false);
  assert.equal(terminalReadyToReceive(true, 500, 'codex'), true);
  assert.equal(terminalReadyToReceive(undefined, 500, 'codex'), true);
});

// — the owner may type any verb the app itself types (michael-replies.md R7) —

const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const { ownerComposeTarget } = loadTs('src/shared/ownerRequests.ts');
const { COMMAND_GROUPS } = loadTs('src/shared/claudeCommands.ts');
const { CODEX_COMMAND_GROUPS } = loadTs('src/shared/codexCommands.ts');

/** The slash verbs the command references carry, as ownerSend.ts reads them. */
function catalogVerbs() {
  return [...COMMAND_GROUPS, ...CODEX_COMMAND_GROUPS]
    .flatMap((g) => g.items)
    .filter((c) => c.kind === 'slash')
    .map((c) => c.cmd.split(/\s+/)[0].toLowerCase());
}

test('every context verb an engine takes is one the owner may type', () => {
  // The two command references cover claude and codex. gemini compacts with
  // /compress, which neither carries, so on that engine the
  // owner's own /compress was filed as a question and handed back as a work
  // order instead of reaching Michael's terminal.
  const ownerSet = new Set([...catalogVerbs(), ...CONTEXT_COMMAND_VERBS]);
  // '/new' left with Grok and OpenCode (owner, 2026-11-11).
  assert.deepEqual([...CONTEXT_COMMAND_VERBS].sort(), ['/clear', '/compact', '/compress']);
  for (const verb of CONTEXT_COMMAND_VERBS) assert.equal(ownerComposeTarget(verb, ownerSet), 'terminal', verb);
  assert.equal(CONTEXT_COMMAND_VERBS.has('/compress'), true, 'gemini compact verb');
});

test('the owner composer derives its commands from the provider table', () => {
  // Wiring, not just the helper: hand-listing the catalogs is what left
  // /compress out, so a provider added to CONTEXT_COMMANDS must be covered
  // without a second edit here.
  assert.match(read('src/renderer/src/shell/ownerSend.ts'), /CONTEXT_COMMAND_VERBS/);
});
