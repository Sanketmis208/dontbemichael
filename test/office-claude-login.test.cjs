'use strict';

/**
 * A business's own Claude login (docs/designs/separate-businesses.md, E6,
 * BIZ-3 and probe T4): Claude Code keeps a separate sign in for each config
 * folder, so a business that chose its own login runs with CLAUDE_CONFIG_DIR
 * set to its folder in the app's data folder, and every file the app reads or
 * writes for Claude follows that folder.
 *
 * Protects: the office's folder drives the agents' environment, the checks'
 * sign in, plan detection, the trust and key approvals and the plugin
 * settings; with no folder set, nothing changes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const home = require('node:path');
// One stand in for electron for the whole file: modules load once and keep it,
// so each test points it at its own data folder.
let userDataNow = os.tmpdir();
const electronPath = require.resolve('electron');
require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: { app: { getPath: () => userDataNow } } };
const claudeHome = loadTs('src/main/claudeHome.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('with no folder set: Claude\'s usual places', () => {
  assert.equal(claudeHome.claudeConfigDir({}), null);
  assert.equal(claudeHome.claudeSettingsDir('/Users/o', {}), home.join('/Users/o', '.claude'));
  assert.equal(claudeHome.claudeJsonFile('/Users/o', {}), home.join('/Users/o', '.claude.json'));
  assert.equal(claudeHome.claudeConfigDir({ CLAUDE_CONFIG_DIR: '   ' }), null, 'blank is not a folder');
});

test('with a folder set: settings and the account record are inside it', () => {
  const env = { CLAUDE_CONFIG_DIR: '/data/offices/abc/claude' };
  assert.equal(claudeHome.claudeSettingsDir('/Users/o', env), '/data/offices/abc/claude');
  assert.equal(claudeHome.claudeJsonFile('/Users/o', env), home.join('/data/offices/abc/claude', '.claude.json'),
    'the record moves inside the folder, as Claude Code reads it');
});

test('the approvals land in the .claude.json Claude reads, never ~/.claude.json, when a folder is set', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-login-'));
  userDataNow = userData;
  const saved = process.env.CLAUDE_CONFIG_DIR;
  t.after(() => {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
    fs.rmSync(userData, { recursive: true, force: true });
  });
  const config = loadTs('src/main/config.ts');
  const fakeHome = path.join(userData, 'home');
  const own = path.join(userData, 'offices', 'abc', 'claude');
  fs.mkdirSync(fakeHome, { recursive: true });
  fs.mkdirSync(own, { recursive: true });

  process.env.CLAUDE_CONFIG_DIR = own;
  assert.equal(config.approveClaudeApiKey('sk-ant-test-0123456789abcdefghijklmnop', fakeHome), true);
  assert.ok(fs.existsSync(path.join(own, '.claude.json')), 'written in the business\'s folder');
  assert.ok(!fs.existsSync(path.join(fakeHome, '.claude.json')), 'not in the home folder');

  delete process.env.CLAUDE_CONFIG_DIR;
  assert.equal(config.approveClaudeApiKey('sk-ant-test-0123456789abcdefghijklmnop', fakeHome), true);
  assert.ok(fs.existsSync(path.join(fakeHome, '.claude.json')), 'without a folder, the home folder as before');
});

test('the business\'s own folder: only once settings are per office, and only when it chose its own login', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-login-office-'));
  userDataNow = userData;
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const file = loadTs('src/main/officeFile.ts');
  const settings = loadTs('src/main/officeSettings.ts');
  const officeHome = path.join(userData, 'realty');
  fs.mkdirSync(path.join(officeHome, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(officeHome, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  const id = file.ensureOfficeId(officeHome);
  const write = (cfg) => fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(cfg));

  write({ harnessHome: officeHome, claudeLogin: 'own' });
  assert.equal(settings.officeClaudeDir(), null, 'before the move: Claude\'s usual folder');

  write({ harnessHome: officeHome, officesMigrated: 1, offices: { [id]: { home: officeHome, settings: { claudeLogin: 'shared' } } } });
  assert.equal(settings.officeClaudeDir(), null, 'shared: the login the app already uses');

  write({ harnessHome: officeHome, officesMigrated: 1, offices: { [id]: { home: officeHome, settings: { claudeLogin: 'own' } } } });
  assert.equal(settings.officeClaudeDir(), path.join(userData, 'offices', id, 'claude'), 'its own, kept by office id');
  assert.ok(settings.BUSINESS_KEYS.includes('claudeLogin'), 'a business setting, never shared across businesses');
});

test('agents keep the folder in their environment, and plan detection reads its account record', () => {
  const { buildPtyEnv } = loadTs('src/main/ptyEnv.ts');
  const env = buildPtyEnv({ CLAUDE_CONFIG_DIR: '/data/offices/abc/claude', CLAUDE_CODE_SESSION_ID: 'parent' }, '/usr/bin');
  assert.equal(env.CLAUDE_CONFIG_DIR, '/data/offices/abc/claude', 'every agent runs on the business\'s login');
  assert.equal(env.CLAUDE_CODE_SESSION_ID, undefined, 'the parent session\'s identity is still stripped');

  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = '/data/offices/abc/claude';
  try {
    assert.equal(loadTs('src/main/claudeAccount.ts').claudeAccountFile(), path.join('/data/offices/abc/claude', '.claude.json'));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
  }
});

test('main sets the folder once, at start, before anything reads it; checks and plugins follow it', () => {
  const main = read('src/main/index.ts');
  const set = main.indexOf('process.env.CLAUDE_CONFIG_DIR = ownClaude;');
  assert.ok(set > 0);
  assert.ok(set > main.indexOf('adoptOpenOffice();'), 'after the open office is known');
  for (const first of ['new MailService(', 'app.whenReady().then(']) assert.ok(set < main.indexOf(first), `before ${first}`);
  // The checks' sign in points at the same folder (empty is Claude's default: T4).
  assert.match(read('src/main/hiddenClaude.ts'), /CLAUDE_SECURESTORAGE_CONFIG_DIR: process\.env\.CLAUDE_CONFIG_DIR \?\? '',/);
  // No reader of Claude's own files is left on a fixed ~/.claude.
  assert.doesNotMatch(read('src/main/hive.ts'), /join\(homedir\(\), '\.claude', 'settings/);
  assert.doesNotMatch(read('src/main/config.ts'), /join\(home, '\.claude\.json'\)|join\(home, '\.claude'\)/);
  assert.doesNotMatch(read('src/main/claudeAccount.ts'), /homedir\(\), '\.claude\.json'/);
});
