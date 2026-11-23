'use strict';

/**
 * One mailbox address, one business (docs/designs/separate-businesses.md,
 * Section 4). Mailboxes are kept per business, so adding one also checks the
 * other businesses on this install and names the one that has it.
 *
 * Protects: an address another business has is refused (in any case) with
 * that business named; the open business keeps its own "already connected";
 * a new address is still added; a business with no mailboxes saved does not
 * break the check.
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

const { PROVIDER_PRESETS } = loadTs('src/shared/mailboxes.ts');
const { saveMailbox } = loadTs('src/main/mail.ts');

const server = { host: 'h', port: 993, secure: true };
const box = (id, address) => ({ id, address, provider: 'gmail', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 });

function office(root, name) {
  const home = path.join(root, name);
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ godId: 'god', agents: {} }));
  return home;
}

test('adding a mailbox another business already has is refused, naming that business', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mailbox-other-business-'));
  userDataNow = userData;
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const file = loadTs('src/main/officeFile.ts');
  const config = loadTs('src/main/config.ts');
  const settings = loadTs('src/main/officeSettings.ts');

  const bakery = office(userData, 'bakery');
  const realty = office(userData, 'realty');
  const bakeryId = file.ensureOfficeId(bakery);
  const realtyId = file.ensureOfficeId(realty);
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
    harnessHome: bakery,
    officesMigrated: 1,
    offices: {
      [bakeryId]: { home: bakery, settings: { businessName: 'Harbor & Pine Bakery', onboardingComplete: true, mailboxes: [box('orders-bakery-com', 'orders@bakery.com')] } },
      [realtyId]: { home: realty, settings: { businessName: 'Northgate Realty', onboardingComplete: true, mailboxes: [box('hello-realty-com', 'Hello@Realty.com ')] } },
      // A business with no mailboxes saved, one with no settings at all, and
      // one with no name: none of them breaks the check.
      'office-empty-1234': { home: path.join(userData, 'empty'), settings: {} },
      'office-bare-12345': { home: path.join(userData, 'bare') },
      'office-noname-123': { home: path.join(userData, 'noname'), settings: { mailboxes: [box('info-noname-com', 'info@noname.com')] } }
    }
  }));

  const logins = [];
  const svc = { async test(m) { logins.push(m.address); return { ok: true }; }, close() {} };
  const admin = {
    getConfig: () => config.readConfig(),
    saveConfig: (patch) => { config.writeConfig(patch); },
    setSecret: () => ({ ok: true }),
    deleteSecret: () => true,
    otherBusinesses: () => settings.otherBusinessMailboxes()
  };
  const add = (address) => saveMailbox(svc, admin, PROVIDER_PRESETS, { provider: 'gmail', address, password: 'p' });

  const taken = await add('hello@realty.com');
  assert.equal(taken.ok, false);
  assert.equal(taken.kind, 'invalid');
  assert.match(taken.reason, /hello@realty\.com already belongs to Northgate Realty/);

  const otherCase = await add('  HELLO@REALTY.COM ');
  assert.equal(otherCase.ok, false);
  assert.match(otherCase.reason, /Northgate Realty/, 'compared in any case, trimmed');

  const unnamed = await add('info@noname.com');
  assert.equal(unnamed.ok, false);
  assert.match(unnamed.reason, /belongs to another business on this computer/);

  const own = await add('Orders@Bakery.com');
  assert.equal(own.ok, false);
  assert.match(own.reason, /already connected\.$/, 'the open business keeps its own message');

  assert.deepEqual(logins, [], 'a refused address never logs in');

  const fresh = await add('sales@bakery.com');
  assert.equal(fresh.ok, true);
  assert.deepEqual(config.readConfig().mailboxes.map((m) => m.address), ['orders@bakery.com', 'sales@bakery.com']);
  const stored = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  assert.deepEqual(stored.offices[realtyId].settings.mailboxes.map((m) => m.address), ['Hello@Realty.com '], 'the other business is left as it was');
});

test('before settings are per business there are no other businesses to check', (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mailbox-other-business-'));
  userDataNow = userData;
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const settings = loadTs('src/main/officeSettings.ts');
  const home = office(userData, 'bakery');
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ harnessHome: home, mailboxes: [box('orders-bakery-com', 'orders@bakery.com')] }));
  assert.deepEqual(settings.otherBusinessMailboxes(), []);
});
