'use strict';

/**
 * A business added later gets a folder named after it (owner, 2026-11-19:
 * "HarnessAgents 2" says nothing once there are several businesses;
 * src/shared/officeHome.ts, OnboardingWizard's Add a business).
 *
 * Protects: the name reads as the app's folder and says whose it is; a name
 * that can't be a folder as typed is cleaned, never a path; a taken name gets
 * a number; a folder the owner picked is never renamed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const h = loadTs('src/shared/officeHome.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('named after the business, beside the first office, numbered when taken', () => {
  assert.deepEqual(h.businessHomeCandidates('Northgate Realty', 3),
    ['~/HarnessAgents Northgate Realty', '~/HarnessAgents Northgate Realty 2', '~/HarnessAgents Northgate Realty 3']);
  assert.equal(h.businessHomeCandidates("Don't Be Michael", 1)[0], "~/HarnessAgents Don't Be Michael");
  assert.equal(h.businessHomeCandidates('A/B Consulting', 1)[0], '~/HarnessAgents A-B Consulting', 'never a folder in a folder');
  assert.equal(h.businessHomeCandidates('../../etc', 1)[0], '~/HarnessAgents etc');
  assert.deepEqual(h.businessHomeCandidates('   ', 3), [], 'no name: the numbered folder instead');
  assert.equal(h.DEFAULT_HOME, '~/HarnessAgents');
});

test('the wizard names an added business\'s folder once it has a name, and only its own suggestion', () => {
  const wiz = read('src/renderer/src/components/OnboardingWizard.tsx');
  assert.match(wiz, /return \(await firstFreeOf\(businessHomeCandidates\(businessName, NEW_OFFICE_SUGGESTIONS\)\)\) \|\| firstFreeHome\(\);/);
  assert.match(wiz, /if \(!add \|\| !name \|\| step === 'business'\) return;\s*if \(home && home !== autoHome\.current\) return;/, 'a picked folder stays');
  assert.match(wiz, /if \(h && h !== autoHome\.current\) return h;\s*autoHome\.current = named;/);
  assert.match(wiz, /const where = home\.trim\(\) \|\| await freeHomeFor\(businessName\.trim\(\)\);/, 'Back to office too');
});
