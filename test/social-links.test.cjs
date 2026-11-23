'use strict';

/**
 * The company's social media links (owner, 2026-11-19: a text box with one link
 * per line was not friendly): one field per link with the site named beside it
 * (src/shared/socialSite.ts, src/renderer/src/components/SocialLinks.tsx).
 *
 * Protects: the right site is named for the usual ways people paste a link;
 * something that is not a link is told so; empty rows are never saved; never
 * more than five.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const s = loadTs('src/shared/socialSite.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the site is named however the link is pasted', () => {
  const cases = {
    'https://www.linkedin.com/company/harbor-bakery': 'LinkedIn',
    'linkedin.com/in/someone': 'LinkedIn',
    'instagram.com/harborbakery': 'Instagram',
    'https://m.facebook.com/harborbakery': 'Facebook',
    'fb.me/harborbakery': 'Facebook',
    'twitter.com/harbor': 'X',
    'https://x.com/harbor': 'X',
    'youtu.be/abc': 'YouTube',
    'www.tiktok.com/@harbor': 'TikTok',
    'https://www.yelp.com/biz/harbor-bakery-austin': 'Yelp',
    'pinterest.co.uk/harbor': 'Pinterest',
    'g.page/harbor-bakery': 'Google',
    'bsky.app/profile/harbor.example': 'Bluesky'
  };
  for (const [link, site] of Object.entries(cases)) assert.equal(s.socialSite(link), site, link);
});

test('a site it does not name, and something that is not a link', () => {
  assert.equal(s.socialSite('harborbakery.example'), null);
  assert.equal(s.socialSite('notlinkedin.com/x'), null, 'a name inside another host is not that site');
  assert.equal(s.looksLikeLink('harborbakery.example/menu'), true);
  for (const bad of ['harbor bakery', 'instagram', '', '   ']) assert.equal(s.looksLikeLink(bad), false, bad);
});

test('one field per link, empty rows never saved, five at most, and the old text box is gone', () => {
  const ui = read('src/renderer/src/components/SocialLinks.tsx');
  assert.match(ui, /const links = next\.map\(\(l\) => l\.trim\(\)\)\.filter\(Boolean\)\.slice\(0, MAX_SOCIAL\);\n\s*onChange\(links\.length \? links : undefined\);/);
  assert.match(ui, /\{rows\.length < MAX_SOCIAL \? \(/);
  assert.match(ui, /aria-label=\{t\('companyProfile\.socialRemove', \{ n: i \+ 1 \}\)\}/, 'each remove button says which link');
  const fields = read('src/renderer/src/components/CompanyProfileFields.tsx');
  assert.match(fields, /<SocialLinks value=\{value\.social\} onChange=\{\(social\) => set\(\{ social \}\)\}/);
  assert.doesNotMatch(fields, /\(value\.social \?\? \[\]\)\.join\('\\n'\)/);
  assert.equal(loadTs('src/shared/companyProfile.ts').MAX_SOCIAL, 5);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).companyProfile;
  for (const k of ['socialLink', 'socialPlaceholder', 'socialPlaceholderMore', 'socialAdd', 'socialMax', 'socialNotLink', 'socialRemove']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[\u2013\u2014]| - /, k);
  }
});
