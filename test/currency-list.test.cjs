'use strict';

/**
 * The currency list in the company profile (owner, 2026-11-19: bare codes
 * were hard to pick from; src/shared/currencies.ts).
 *
 * Protects: each currency is named with its code, the common ones come
 * first, the rest are sorted by name, every known currency is offered once,
 * and the code (what agents read) is still what is saved.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const c = loadTs('src/shared/currencies.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('named with the code, common first, the rest by name, each once', () => {
  assert.equal(c.currencyLabel('USD', 'en'), 'US Dollar (USD)');
  assert.equal(c.currencyLabel('XYZ', 'en'), 'XYZ', 'unknown: the code alone');
  const codes = Intl.supportedValuesOf('currency');
  const { common, rest } = c.currencyOptions(codes, 'en');
  assert.deepEqual(common.slice(0, 3).map((o) => o.code), ['USD', 'EUR', 'GBP']);
  const all = [...common, ...rest].map((o) => o.code);
  assert.equal(all.length, codes.length);
  assert.equal(new Set(all).size, all.length);
  const labels = rest.map((o) => o.label);
  assert.deepEqual(labels, [...labels].sort(new Intl.Collator('en').compare));
  assert.deepEqual(c.currencyOptions(['USD', 'ABC'], 'en').common.map((o) => o.code), ['USD'], 'only codes the runtime knows');
});

test('the profile shows the names and saves the code', () => {
  const src = read('src/renderer/src/components/CompanyProfileFields.tsx');
  assert.match(src, /currencyList\.common\.map\(\(c\) => <option key=\{c\.code\} value=\{c\.code\}>\{c\.label\}<\/option>\)/);
  assert.match(src, /currencyList\.rest\.map\(\(c\) => <option key=\{c\.code\} value=\{c\.code\}>\{c\.label\}<\/option>\)/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).companyProfile;
  assert.equal(en.currencyCommon, 'Common');
  assert.equal(en.currencyAll, 'All currencies');
});
