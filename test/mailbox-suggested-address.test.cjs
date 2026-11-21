'use strict';

/**
 * Add a mailbox starts on the email given in setup (owner, 2026-11-19:
 * "if email address is filled up in the setup wizard then the email setup
 * should default to it"; src/shared/mailboxes.ts, AddMailboxDialog).
 *
 * Protects: the company's public email fills the address when it is a real
 * address and not a mailbox yet; its service is picked when the domain names
 * one, and a company domain keeps the dialog's own choice; fixing a mailbox
 * keeps its own address.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const m = loadTs('src/shared/mailboxes.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the setup email, unless it is no address or already a mailbox', () => {
  assert.equal(m.suggestedMailboxAddress(' hello@harborpine.example ', []), 'hello@harborpine.example');
  assert.equal(m.suggestedMailboxAddress('hello@harborpine.example', [{ address: 'Hello@HarborPine.example' }]), '', 'already added');
  assert.equal(m.suggestedMailboxAddress('not an address', []), '');
  assert.equal(m.suggestedMailboxAddress(undefined, []), '');
});

test('the service its domain names, none for a company domain', () => {
  assert.equal(m.providerForAddress('owner@gmail.com'), 'gmail');
  assert.equal(m.providerForAddress('owner@googlemail.com'), 'gmail');
  assert.equal(m.providerForAddress('owner@icloud.com'), 'icloud');
  assert.equal(m.providerForAddress('owner@me.com'), 'icloud');
  assert.equal(m.providerForAddress('owner@yahoo.co.uk'), 'yahoo');
  assert.equal(m.providerForAddress('owner@zohomail.in'), 'zoho');
  assert.equal(m.providerForAddress('hello@harborpine.example'), null);
});

test('the dialog starts on it when adding, never when fixing', () => {
  const dlg = read('src/renderer/src/components/AddMailboxDialog.tsx');
  assert.match(dlg, /const start = fix \? '' : \(suggestedAddress \?\? ''\);/);
  assert.match(dlg, /\(fix\?\.provider \?\? providerForAddress\(start\) \?\? 'gmail'\)/);
  assert.match(dlg, /useState\(fix\?\.address \?\? start\)/);
  assert.match(read('src/renderer/src/components/MailboxesSettings.tsx'),
    /suggestedAddress=\{dialog\.fix \? undefined : suggestedMailboxAddress\(config\.companyProfile\?\.email, config\.mailboxes \?\? \[\]\)\}/);
});
