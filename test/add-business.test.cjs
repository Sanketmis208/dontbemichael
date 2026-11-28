'use strict';

/**
 * Add a business (docs/designs/separate-businesses.md, DT3; D19, D4).
 *
 * Protects: the setup wizard runs over the open business, which keeps working
 * until Open the office; its answers go to the new business's own entry and
 * never touch the open one's; Back to office keeps what was typed as Setup not
 * finished, to go on where it stopped; the Ready step chooses the Claude
 * account.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

let userDataNow = os.tmpdir();
const electronPath = require.resolve('electron');
require.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: { app: { getPath: () => userDataNow } } };
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function scene(t) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'add-business-'));
  userDataNow = userData;
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const file = loadTs('src/main/officeFile.ts');
  const settings = loadTs('src/main/officeSettings.ts');
  const bakery = path.join(userData, 'bakery');
  fs.mkdirSync(path.join(bakery, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(bakery, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  const bakeryId = file.ensureOfficeId(bakery);
  const bakerySettings = { businessName: 'Harbor & Pine Bakery', onboardingComplete: true, mailboxes: [{ id: 'mb1', address: 'orders@bakery.example' }] };
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
    harnessHome: bakery, officesMigrated: 1, autoMode: true, offices: { [bakeryId]: { home: bakery, settings: bakerySettings } }
  }));
  const stored = () => JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  return { userData, file, settings, bakery, bakeryId, bakerySettings, stored };
}

test('the new business gets its own entry; the open one keeps running on its own', (t) => {
  const s = scene(t);
  const realty = path.join(s.userData, 'HarnessAgents 2');
  const res = s.settings.addBusiness({
    home: realty,
    settings: { businessName: 'Northgate Realty', businessType: 'services', claudeLogin: 'own', autoMode: false, onboardingComplete: false },
    install: { autoMode: false, harnessHome: realty, businessName: 'never at the top' }
  });
  assert.equal(res.ok, true);
  const cfg = s.stored();
  const mine = cfg.offices[res.id];
  assert.equal(mine.home, realty);
  assert.equal(mine.settings.businessName, 'Northgate Realty');
  assert.equal(mine.settings.onboardingComplete, true, 'its setup is done');
  assert.equal(mine.settings.claudeLogin, 'own', 'the Ready step\'s choice');
  assert.equal('autoMode' in mine.settings, false, 'install settings never go in a business');
  assert.equal(cfg.autoMode, false, 'they are install settings');
  assert.equal(cfg.harnessHome, s.bakery, 'the open office is still open: the switch comes after');
  assert.equal(cfg.businessName, undefined, 'nothing at the top');
  assert.deepEqual(cfg.offices[s.bakeryId].settings, s.bakerySettings, 'the open business untouched');
});

test('never the open office\'s folder, never over a business that finished setup', (t) => {
  const s = scene(t);
  assert.deepEqual(s.settings.addBusiness({ home: s.bakery, settings: { businessName: 'X' } }), { ok: false, error: 'isOpen' });
  const realty = path.join(s.userData, 'realty');
  const first = s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty' } });
  // Its office now exists there (it opened once).
  fs.mkdirSync(path.join(realty, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(realty, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  s.file.ensureOfficeId(realty, first.id);
  assert.deepEqual(s.settings.addBusiness({ home: realty, settings: { businessName: 'Someone Else' } }), { ok: false, error: 'exists' });
  assert.equal(s.stored().offices[first.id].settings.businessName, 'Northgate Realty');
});

test('Back to office keeps it as Setup not finished, and finishing goes on from the same entry', (t) => {
  const s = scene(t);
  const where = path.join(s.userData, 'HarnessAgents 3');
  const id = s.settings.saveBusinessDraft({ home: where, step: 'team', settings: { businessName: 'Corner Florist', businessType: 'retail' } });
  assert.ok(id);
  const row = s.settings.listBusinesses().businesses.find((b) => b.id === id);
  assert.equal(row.state, 'setup');
  assert.equal(row.name, 'Corner Florist');
  assert.deepEqual(s.settings.businessDraft(id), { id, home: where, step: 'team', settings: { businessName: 'Corner Florist', businessType: 'retail', onboardingComplete: false } });

  assert.equal(s.settings.saveBusinessDraft({ id, home: where, step: 'orchestrator', settings: { businessName: 'Corner Florist' } }), id, 'the same entry each time');
  assert.equal(s.settings.businessDraft(id).step, 'orchestrator');

  const done = s.settings.addBusiness({ id, home: where, settings: { businessName: 'Corner Florist' } });
  assert.deepEqual(done, { ok: true, id });
  assert.equal(s.stored().offices[id].draft, undefined, 'no draft once its setup is done');
  assert.equal(s.settings.businessDraft(id), null);
  assert.equal(s.settings.saveBusinessDraft({ home: s.bakery, step: 'business', settings: {} }), null, 'never the open office\'s folder');
});

test('the wizard over the floor: the open office runs until Open the office, then the switch', () => {
  const wiz = read('src/renderer/src/components/OnboardingWizard.tsx');
  const finish = wiz.slice(wiz.indexOf('if (add) {\n        // The new business'), wiz.indexOf('const next = await window.cth.updateConfig(patch);'));
  assert.ok(finish.length > 0, 'add mode has its own finish');
  const saved = finish.indexOf('window.cth.addBusiness(');
  const sw = finish.indexOf("window.cth.changeHome(harnessHome, 'fresh')");
  assert.ok(saved > 0 && sw > saved, 'saved into its own entry, then the switch (closing time first)');
  assert.doesNotMatch(finish, /updateConfig/, 'never saved through the open business');
  assert.match(finish, /settings: \{ \.\.\.patch, claudeLogin \}/);
  // Back to office keeps a draft; adding never takes over the open office's folder.
  assert.match(wiz, /const id = await window\.cth\.saveBusinessDraft\(\{/);
  assert.match(wiz, /\/\/ Adding a business never takes over the open office's folder\.\n\s*if \(add\) return;/);
  // A free folder from the start; named after the business once it has a name.
  assert.match(wiz, /if \(add\) \{\s*void firstFreeHome\(\)\.then/);
  // The Ready step: the account choice, and no sign in wait for a different account.
  assert.match(wiz, /\{step === 'ready' && add && \(\n\s*<ClaudeAccountChoice/);
  assert.match(wiz, /\{step === 'ready' && !\(add && claudeLogin === 'own'\) && <GetMichaelReady/);
  assert.match(wiz, /role="radiogroup"/);

  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /\{addBusiness && \(\n\s*<OnboardingWizard\n\s*onComplete=\{\(\) => setAddBusiness\(null\)\}\n\s*add=\{\{/, 'over the floor, which stays mounted');
  assert.match(app, /window\.addEventListener\('cth:add-business', onAdd\);/);
  assert.match(read('src/renderer/src/shell/BusinessMenu.tsx'), /if \(action === 'resume'\) \{ close\(false\); openAddBusiness\(row\.id\); return; \}/);
  assert.match(read('src/renderer/src/components/YourBusinesses.tsx'), /onClick=\{\(\) => openAddBusiness\(row\.id\)\}/);
  assert.match(read('src/main/index.ts'), /ipcMain\.handle\('office:addBusiness'/);
});

test('the words: present, no dashes, no hardcoded name', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).addBusiness;
  assert.equal(en.backToOffice, 'Back to the office');
  assert.equal(en.claudeOwn, 'A different Claude account');
  for (const [k, v] of Object.entries(en)) assert.doesNotMatch(v, /[–—]| - |Michael/, k);
});

// Owner, 2026-11-19: finishing Add a business switched to the new business,
// and it opened on "we can't find your office": its folder was made, its office
// was not, and launch takes an empty folder for a lost office.
test('a business just added opens on its first launch; a lost office still does not', (t) => {
  const s = scene(t);
  const { homeReadyAtLaunch } = loadTs('src/main/homeFolder.ts');
  const realty = path.join(s.userData, 'HarnessAgents 2');
  fs.mkdirSync(realty);
  const res = s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty', onboardingComplete: true } });
  assert.equal(res.ok, true);
  // The switch: the bakery closes and the new folder is the open one.
  const cfg = s.stored();
  cfg.offices[s.bakeryId].closedAt = 1;
  cfg.harnessHome = realty;
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  assert.equal(s.settings.neverOpenedBusiness(s.stored()), true);
  assert.equal(homeReadyAtLaunch({ onboardingComplete: true, harnessHome: realty }, s.settings.neverOpenedBusiness(s.stored())), true, 'launch makes its office');

  // Made, the office takes the business's own id, so its settings follow.
  fs.mkdirSync(path.join(realty, 'hive'));
  fs.writeFileSync(path.join(realty, 'hive', 'registry.json'), JSON.stringify({ godId: null, agents: {} }));
  assert.equal(s.settings.adoptOpenOffice(), res.id);
  assert.equal(s.file.readOfficeId(realty), res.id);

  // Once it has run (its team started, or it closed), an empty folder is a lost office.
  for (const ran of [{ settings: { onboardingComplete: true, businessTeamStarted: true } }, { closedAt: 5 }]) {
    const c = s.stored();
    c.offices[res.id] = { ...c.offices[res.id], ...ran, settings: { ...c.offices[res.id].settings, ...(ran.settings ?? {}) } };
    fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(c));
    assert.equal(s.settings.neverOpenedBusiness(s.stored()), false, JSON.stringify(ran));
  }
  // Nor a draft, nor the business that was open before.
  const back = s.stored(); back.harnessHome = s.bakery;
  assert.equal(s.settings.neverOpenedBusiness(back), false);
  assert.equal(s.settings.neverOpenedBusiness({ ...back, harnessHome: realty, offices: { x: { home: realty, settings: {}, draft: { step: 'team' } } } }), false);
});

// Value: protects=a draft id names only an unfinished business: the id of one that finished setup never lets Add a business or Back to office write over it, and nothing is added before the move; fails_when=the onboardingComplete check on p.id goes, or the officesMigrated guard goes; why_new=the tests above pass only draft ids or none; seam=none; no_claim=what the renderer sends (main side only)
test('a finished business\'s id is never taken as a draft, and nothing is added before the move', (t) => {
  const s = scene(t);
  const other = path.join(s.userData, 'HarnessAgents 4');
  const added = s.settings.addBusiness({ id: s.bakeryId, home: other, settings: { businessName: 'Corner Florist' } });
  assert.equal(added.ok, true);
  assert.notEqual(added.id, s.bakeryId, 'a new entry of its own');
  const draft = s.settings.saveBusinessDraft({ id: s.bakeryId, home: path.join(s.userData, 'HarnessAgents 5'), step: 'team', settings: { businessName: 'Northgate Realty' } });
  assert.ok(draft && draft !== s.bakeryId);
  assert.equal(s.settings.businessDraft(s.bakeryId), null, 'a finished business has no draft');
  assert.deepEqual(s.stored().offices[s.bakeryId], { home: s.bakery, settings: s.bakerySettings }, 'the finished business untouched');

  const cfg = s.stored();
  delete cfg.officesMigrated;
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  assert.deepEqual(s.settings.addBusiness({ home: other, settings: { businessName: 'X' } }), { ok: false, error: 'notPerOffice' });
  assert.equal(s.settings.saveBusinessDraft({ home: other, step: 'business', settings: {} }), null);
});

// Value: protects=a business added from setup starts under the open business's spend caps unless setup chose its own; fails_when=addBusiness saves only the wizard's fields; why_new=pre-landing review (targeted money reader); seam=none; no_claim=the wizard UI
test('a business added from setup starts under the open business\'s spend caps', (t) => {
  const s = scene(t);
  const cfg = s.stored();
  cfg.offices[s.bakeryId].settings = { ...cfg.offices[s.bakeryId].settings, costCapTokens: 750000, costCapUsd: 25, agentTokenCaps: { pam: 1000 } };
  fs.writeFileSync(path.join(s.userData, 'config.json'), JSON.stringify(cfg));
  const realty = path.join(s.userData, 'realty');
  const res = s.settings.addBusiness({ home: realty, settings: { businessName: 'Northgate Realty' } });
  assert.equal(res.ok, true);
  const added = s.stored().offices[res.id].settings;
  assert.deepEqual([added.costCapTokens, added.costCapUsd], [750000, 25]);
  assert.equal(added.agentTokenCaps, undefined, 'a cap set for another business\'s member stays there');
  const own = s.settings.addBusiness({ home: path.join(s.userData, 'cafe'), settings: { businessName: 'Contoso Cafe', costCapUsd: 5 } });
  assert.equal(s.stored().offices[own.id].settings.costCapUsd, 5, 'its own cap wins');
});

test('a business added over a folder that holds an office describes that office.json, so launch sees no name mismatch', (t) => {
  // Value: protects=the launch name check stays quiet for a business added over an existing office folder; fails_when=addBusiness files the new name in the settings but leaves office.json naming the folder's old business, so every launch logs office-name-mismatch; why_new=PR 738 review 2026-11-27; seam=real config and office.json on disk; no_claim=the launch line itself (office-name-check.test.cjs)
  const s = scene(t);
  const { businessNameMismatch } = loadTs('src/shared/officeRecord.ts');
  const old = path.join(s.userData, 'old office');
  fs.mkdirSync(path.join(old, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(old, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  const oldId = s.file.ensureOfficeId(old);
  s.file.writeOfficeRecord(old, { ...s.file.readOfficeRecord(old), businessName: 'Contoso Cafe', team: [] });
  const res = s.settings.addBusiness({ home: old, settings: { businessName: 'Northgate Realty', businessType: 'services' } });
  assert.equal(res.ok, true);
  assert.equal(res.id, oldId, 'the folder keeps its office id');
  const rec = s.file.readOfficeRecord(old);
  assert.equal(rec.id, oldId, 'office.json keeps the id');
  assert.equal(rec.businessName, 'Northgate Realty', 'office.json names the business that now owns the folder');
  const opened = { ...s.stored().offices[res.id].settings, harnessHome: old };
  assert.equal(businessNameMismatch(opened, rec), false, 'the next launch finds no mismatch');
  assert.equal(fs.existsSync(path.join(s.userData, 'fresh', 'office.json')), false);
  s.settings.addBusiness({ home: path.join(s.userData, 'fresh'), settings: { businessName: 'Contoso Cafe' } });
  assert.equal(fs.existsSync(path.join(s.userData, 'fresh', 'office.json')), false, 'a folder with no office yet gets no office.json from here');
});
