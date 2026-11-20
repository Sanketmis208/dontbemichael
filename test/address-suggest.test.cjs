'use strict';

/**
 * Address suggestions in the company profile (src/shared/photon.ts,
 * src/renderer/src/components/StreetField.tsx; owner, 2026-11-19: Photon,
 * the free OpenStreetMap search, since it needs no key in an open source app).
 *
 * Protects: a pick fills street, city, region, postal code and country the way
 * people write them; places with no street are left out; nothing is asked
 * until enough is typed; the request names only the app; a failure is plain
 * typing; OpenStreetMap is credited wherever suggestions show.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const photon = loadTs('src/shared/photon.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const feature = (properties) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties });

test('nothing is asked until enough is typed; the request carries only the text and a language Photon knows', () => {
  assert.equal(photon.photonQueryUrl('12 '), null);
  assert.equal(photon.photonQueryUrl('x'.repeat(201)), null);
  const u = new URL(photon.photonQueryUrl('  1600   Pennsylvania  ', 'en-US'));
  assert.equal(u.origin + u.pathname, 'https://photon.komoot.io/api/');
  assert.equal(u.searchParams.get('q'), '1600 Pennsylvania');
  assert.equal(u.searchParams.get('lang'), 'en');
  assert.equal(u.searchParams.get('limit'), '6');
  assert.equal(new URL(photon.photonQueryUrl('Hauptstrasse 5', 'ja')).searchParams.get('lang'), null, 'a language it does not know: its default');
});

test('a pick fills the whole address, house number where the country writes it', () => {
  const s = photon.readPhoton({ features: [
    feature({ osm_key: 'building', housenumber: '1600', street: 'Pennsylvania Avenue Northwest', city: 'Washington', state: 'District of Columbia', postcode: '20500', country: 'United States', countrycode: 'US' }),
    feature({ osm_key: 'place', housenumber: '5', street: 'Hauptstraße', city: 'Berlin', state: 'Berlin', postcode: '10115', country: 'Deutschland', countrycode: 'DE' })
  ] });
  assert.deepEqual(s[0].address, { street: '1600 Pennsylvania Avenue Northwest', city: 'Washington', region: 'District of Columbia', postalCode: '20500', country: 'United States' });
  assert.equal(s[0].label, '1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500, United States');
  assert.equal(s[1].address.street, 'Hauptstraße 5', 'the street first in Germany');
});

test('a street with no number, a town for a city, and no gaps for what is not known', () => {
  const s = photon.readPhoton({ features: [
    feature({ osm_key: 'highway', name: 'High Street', town: 'Bath', country: 'United Kingdom', countrycode: 'GB' })
  ] });
  assert.deepEqual(s[0].address, { street: 'High Street', city: 'Bath', country: 'United Kingdom' });
  assert.equal(s[0].label, 'High Street, Bath, United Kingdom');
});

test('places with no street are left out, repeats once, five at most, and a strange answer is no suggestions', () => {
  const city = feature({ osm_key: 'place', name: 'Austin', state: 'Texas', countrycode: 'US' });
  const same = feature({ housenumber: '1', street: 'Main Street', city: 'Austin', countrycode: 'US' });
  const many = Array.from({ length: 8 }, (_, i) => feature({ housenumber: String(i + 1), street: 'Main Street', city: 'Austin', countrycode: 'US' }));
  const s = photon.readPhoton({ features: [city, same, same, ...many] });
  assert.equal(s.length, 5);
  assert.equal(s.filter((x) => x.label.startsWith('1 Main Street')).length, 1);
  assert.ok(!s.some((x) => x.label === 'Texas'));
  for (const bad of [null, {}, { features: 'x' }, { features: [null, 5, 'x'] }]) assert.deepEqual(photon.readPhoton(bad), []);
});

test('main asks with a short wait, at most every 300 ms, names only the app, and a failure is plain typing', () => {
  const main = read('src/main/index.ts');
  const h = main.slice(main.indexOf("ipcMain.handle('address:suggest'"), main.indexOf("/** The business menu and Settings' Your businesses"));
  assert.match(h, /if \(now - addressLastAt < 300\) return \{ ok: false \};/);
  assert.match(h, /signal: AbortSignal\.timeout\(4000\)/);
  assert.match(h, /'User-Agent': `DontBeMichael\/\$\{app\.getVersion\(\)\} \(open source desktop app\)`/, 'the app, never the owner');
  assert.match(h, /\} catch \{\n\s*return \{ ok: false \};/);
});

test('the street field: a combobox in setup and Settings that credits OpenStreetMap', () => {
  const field = read('src/renderer/src/components/StreetField.tsx');
  assert.match(field, /role="combobox"/);
  assert.match(field, /aria-autocomplete="list"/);
  assert.match(field, /role="listbox"/);
  assert.match(field, /role="option"\n\s*aria-selected=\{i === active\}/);
  assert.match(field, /\{t\('companyProfile\.fromOsm'\)\}/, 'the ODbL credit under the list');
  assert.match(field, /if \(latest\.current\.trim\(\) !== q \|\| !focused\.current\) return;/, 'an answer for older text is dropped');
  assert.match(read('src/renderer/src/components/CompanyProfileFields.tsx'), /<StreetField value=\{text\(value\.address\?\.street\)\}/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).companyProfile;
  assert.equal(en.fromOsm, 'Suggestions from OpenStreetMap');
  for (const k of ['suggestions', 'fromOsm']) assert.doesNotMatch(en[k], /[–—]| - /, k);
});
