'use strict';

/**
 * The last pieces of E3 (docs/designs/separate-businesses.md): the renderer's
 * saved state stays with the business it was saved in, and a business that
 * kept only its name and team when settings moved per office gets a one time
 * card saying so.
 *
 * Protects: one business's cards, queues and selection never show in
 * another's window, whatever way the app switched; the card comes once and
 * goes when read.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** A stand in for the browser's localStorage. */
function storage(entries) {
  const m = new Map(Object.entries(entries));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m)
  };
}

/** Run the real preload with this office open and this saved state. */
function preloadWith(officeId, entries) {
  const ls = storage(entries);
  const electron = require.resolve('electron');
  const saved = require.cache[electron];
  require.cache[electron] = {
    id: electron, filename: electron, loaded: true,
    exports: {
      contextBridge: { exposeInMainWorld: () => {} },
      ipcRenderer: { sendSync: (ch) => (ch === 'office:currentIdSync' ? officeId : undefined), invoke: async () => undefined, on: () => {}, removeListener: () => {}, send: () => {} },
      webUtils: { getPathForFile: () => '' }
    }
  };
  const hadWindow = 'window' in global;
  global.window = { localStorage: ls };
  global.__APP_VERSION__ = '0.0.0-test'; // a build time constant the preload reads
  try {
    // A fresh copy each time: the check runs when the preload loads.
    const loader = path.join(__dirname, 'load-ts.cjs');
    delete require.cache[loader];
    require(loader)('src/preload/index.ts');
  } finally {
    if (saved) require.cache[electron] = saved; else delete require.cache[electron];
    if (!hadWindow) delete global.window;
  }
  return ls.dump();
}

test('saved state from the same business stays', () => {
  const after = preloadWith('office-aaaa1111', { 'cth.officeId': 'office-aaaa1111', 'cth.roster': 'bakery cards' });
  assert.equal(after['cth.roster'], 'bakery cards');
});

test('saved state from another business is cleared before the page reads it', () => {
  const after = preloadWith('office-bbbb2222', { 'cth.officeId': 'office-aaaa1111', 'cth.roster': 'bakery cards', 'cth.selected': 'pam', 'other.key': 'kept' });
  assert.equal(after['cth.roster'], undefined);
  assert.equal(after['cth.selected'], undefined);
  assert.equal(after['cth.officeId'], 'office-bbbb2222', 'and it now belongs to the open business');
  assert.equal(after['other.key'], 'kept', 'only the app\'s own saved state');
});

test('state saved before settings were per office is the open office\'s: stamped, not cleared', () => {
  const after = preloadWith('office-aaaa1111', { 'cth.roster': 'bakery cards' });
  assert.equal(after['cth.roster'], 'bakery cards');
  assert.equal(after['cth.officeId'], 'office-aaaa1111');
});

test('before the move (no office id) nothing is checked or changed', () => {
  const after = preloadWith(null, { 'cth.officeId': 'office-aaaa1111', 'cth.roster': 'cards' });
  assert.deepEqual(after, { 'cth.officeId': 'office-aaaa1111', 'cth.roster': 'cards' });
});

test('the finish setting up card: due while the flag is set, gone once read', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'office-notice-'));
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
  try {
    const config = loadTs('src/main/config.ts');
    const file = loadTs('src/main/officeFile.ts');
    const home = path.join(userData, 'realty');
    fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
    fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
    const id = file.ensureOfficeId(home);
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
      harnessHome: home, officesMigrated: 1,
      offices: { [id]: { home, settings: { businessName: 'Northgate Realty', onboardingComplete: true, setupNoticePending: true } } }
    }));
    assert.equal(config.readConfig().setupNoticePending, true);
    config.writeConfig({ setupNoticePending: undefined }); // what office:setupNoticeSeen saves
    assert.equal(config.readConfig().setupNoticePending, undefined);
    const stored = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
    assert.equal('setupNoticePending' in stored.offices[id].settings, false);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('the card is wired: main answers, Ask me counts it as a report and shows it', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /ipcMain\.handle\('office:setupNotice', \(\) => \(\{ notice: readConfig\(\)\.setupNoticePending === true \}\)\);/);
  assert.match(main, /ipcMain\.handle\('office:setupNoticeSeen', \(\) => \{ writeConfig\(\{ setupNoticePending: undefined \}\); return \{ ok: true \}; \}\);/);
  assert.match(main, /ipcMain\.on\('office:currentIdSync'/);
  const feed = read('src/renderer/src/shell/useNeedsYou.ts');
  assert.match(feed, /\(merged\.setupNotice \? 1 : 0\)/, 'counted with the reports');
  assert.match(feed, /window\.cth\.officeSetupNotice\?\.\(\)/);
  const askMe = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(askMe, /\{setupNotice && <SetupNoticeCard \/>\}/);
  assert.match(askMe, /!knowledgeNotice && !setupNotice && degraded\.length === 0/, 'never "all clear" while it is up');
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  for (const k of ['title', 'body', 'open']) {
    assert.ok(en.setupNotice[k], k);
    assert.doesNotMatch(en.setupNotice[k], /[–—]| - /, 'no dashes in owner copy');
  }
});
