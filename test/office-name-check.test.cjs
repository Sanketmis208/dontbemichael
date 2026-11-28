'use strict';

/**
 * At launch the open office's settings and its office.json should name the
 * same business. When they differ, one business's settings may have reached
 * the other's office (docs/designs/separate-businesses.md, Section 8), so the
 * app notes it in the office log. It never stops the office from opening.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const rec = loadTs('src/shared/officeRecord.ts');
const file = loadTs('src/main/officeFile.ts');

const settings = { onboardingComplete: true, harnessHome: '/Users/owner/HarnessAgents', businessName: 'Sunrise Bakery' };
const record = (businessName) => ({ version: 1, id: 'office-0001', businessName, team: [] });

test('the same business in settings and office.json is a match', () => {
  assert.equal(rec.businessNameMismatch(settings, record('Sunrise Bakery')), false);
});

test('another business in office.json is a mismatch', () => {
  assert.equal(rec.businessNameMismatch(settings, record('Harbor Realty')), true);
  assert.equal(rec.businessNameMismatch({ ...settings, businessName: 'Harbor Realty' }, record('Sunrise Bakery')), true);
});

test('names compare trimmed and as written, as the record keeps them', () => {
  assert.equal(rec.businessNameMismatch({ ...settings, businessName: '  Sunrise Bakery ' }, record('Sunrise Bakery')), false);
  assert.equal(rec.businessNameMismatch(settings, rec.parseOfficeRecord({ version: 1, businessName: ' Sunrise Bakery  ', team: [] })), false);
  assert.equal(rec.businessNameMismatch(settings, record('sunrise bakery')), true);
});

test('nothing to compare is not a mismatch', () => {
  assert.equal(rec.businessNameMismatch(settings, null), false, 'no office.json');
  assert.equal(rec.businessNameMismatch(settings, undefined), false);
  assert.equal(rec.businessNameMismatch(settings, record(undefined)), false, 'office.json with no name');
  assert.equal(rec.businessNameMismatch(settings, record('   ')), false);
  assert.equal(rec.businessNameMismatch({ ...settings, businessName: undefined }, record('Sunrise Bakery')), false, 'settings with no name');
  assert.equal(rec.businessNameMismatch({ ...settings, businessName: '  ' }, record('Sunrise Bakery')), false);
  // Before setup finishes the settings hold only what was typed so far.
  assert.equal(rec.businessNameMismatch({ ...settings, onboardingComplete: false }, record('Harbor Realty')), false);
});

test('office.json read from disk: a mismatch, a match, and a missing or broken file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office name check '));
  try {
    assert.equal(rec.businessNameMismatch({ ...settings, harnessHome: home }, file.readOfficeRecord(home)), false, 'no office.json');
    file.writeOfficeRecord(home, record('Harbor Realty'));
    assert.equal(rec.businessNameMismatch({ ...settings, harnessHome: home }, file.readOfficeRecord(home)), true);
    file.writeOfficeRecord(home, record('Sunrise Bakery'));
    assert.equal(rec.businessNameMismatch({ ...settings, harnessHome: home }, file.readOfficeRecord(home)), false);
    fs.writeFileSync(file.officeRecordPath(home), '{ not json');
    assert.equal(rec.businessNameMismatch({ ...settings, harnessHome: home }, file.readOfficeRecord(home)), false, 'unreadable office.json');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('launch checks the name after the backfill, logs the office id only, and never blocks', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const backfill = main.indexOf('backfillOfficeRecord(readConfig());');
  const check = main.indexOf('businessNameMismatch(cfg, rec)');
  assert.ok(backfill > 0 && check > backfill, 'after office.json is backfilled');
  const block = main.slice(main.lastIndexOf('try {', check), main.indexOf('}', main.indexOf('catch', check)) + 1);
  // The exact line, so an inverted condition or a log outside the if fails here.
  assert.match(block, /if \(businessNameMismatch\(cfg, rec\)\) hive\.appendLog\(\{ kind: 'office-name-mismatch', officeId: rec\?\.id \?\? null \}\);/);
  assert.ok(!/businessName/.test(block.replace('businessNameMismatch', '')), 'no business name in the log line');
  assert.match(block, /catch \(e\) \{ console\.error\(/, 'a failed check never stops the launch');
  // The line stays in the office log: it is never turned into a failure report.
  const failure = loadTs('src/shared/failureReport.ts');
  assert.equal(failure.LOG_KIND_CLASS['office-name-mismatch'], 'none');
  assert.equal(failure.classifyLogEvent({ kind: 'office-name-mismatch', officeId: 'office-0001' }), null);
});
