'use strict';

/**
 * The app started from inside a Claude Code session (a dev run) drops that
 * session's own settings before anything starts (2026-11-19: the inherited
 * CLAUDE_CODE_CHILD_SESSION turned off transcripts, so the privacy check on
 * every question to Research failed; src/main/inheritedEnv.ts).
 *
 * Protects: an app opened normally keeps every setting it has, the owner's
 * own API key or gateway included; a dev run drops the host's Claude Code,
 * Anthropic and MCP settings but keeps CLAUDE_CONFIG_DIR; it runs before
 * anything else in main reads the environment.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const e = loadTs('src/main/inheritedEnv.ts');

test('an app opened normally keeps everything', () => {
  const env = { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-owner', ANTHROPIC_BASE_URL: 'https://gateway.example', CLAUDE_CONFIG_DIR: '/x', CLAUDE_CODE_USE_BEDROCK: '1' };
  assert.equal(e.startedInsideClaudeCode(env), false);
  assert.equal(e.dropInheritedClaudeVars(env), 0);
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-owner');
  assert.equal(env.CLAUDE_CODE_USE_BEDROCK, '1');
});

test('a dev run drops the host session\'s settings, never the app\'s own', () => {
  const env = {
    PATH: '/usr/bin', HOME: '/Users/x', CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_ENTRYPOINT: 'sdk',
    CLAUDE_PID: '9', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9/host', MCP_CONNECTION_NONBLOCKING: '1', CLAUDE_CONFIG_DIR: '/biz', ELECTRON_RENDERER_URL: 'http://127.0.0.1:5174'
  };
  assert.equal(e.dropInheritedClaudeVars(env), 6);
  assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_CONFIG_DIR', 'ELECTRON_RENDERER_URL', 'HOME', 'PATH']);
  assert.equal(e.startedInsideClaudeCode({ CLAUDE_CODE_CHILD_SESSION: '1' }), true);
});

test('dropped first thing in main', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  const at = main.indexOf('dropInheritedClaudeVars(process.env)');
  assert.ok(at > 0);
  assert.ok(at > main.indexOf('app.setName(APP_NAME);'), 'after the data folder pin, which stays first');
  assert.ok(at < main.indexOf('migrateToOfficeSettings()'), 'before any setting is read or anything starts');
});
