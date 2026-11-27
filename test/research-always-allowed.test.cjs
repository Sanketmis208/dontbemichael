'use strict';

/**
 * Always allowed (owner, 2026-11-20: "Pete should evaluate blocked categories
 * and maintain an exception list which only owner can provide"; a question
 * with the owner's public releases page lost the link, because the address
 * holds the owner's name; src/shared/publicTerms.ts, src/main/trustLayer.ts,
 * PublicTermsList).
 *
 * Protects: the owner's entries reach the check as theirs and public, kept as
 * written even inside a link or handle; the shape checks skip them (the
 * business's public email is not a contact detail), but never let a password
 * or key through; the list is cleaned and capped; Company profile's public
 * details are allowed too, beside the list and outside its cap (owner,
 * 2026-11-26); it is a business setting only Settings writes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const P = loadTs('src/shared/publicTerms.ts');
const T = loadTs('src/main/trustLayer.ts');
const { dataClassSettings } = loadTs('src/shared/dataClasses.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function layer(answer, terms) {
  const prompts = [];
  const l = T.makeTrustLayer({
    run: async (p) => { prompts.push(p); return typeof answer === 'function' ? answer(p) : answer; },
    settings: () => dataClassSettings(undefined),
    publicTerms: () => terms,
    retryAfterMs: 1
  });
  return { l, prompts };
}

test('the list: one line each, no repeats, capped', () => {
  assert.deepEqual(P.cleanPublicTerms(['Dana Reyes', ' dana  reyes ', 'https://github.com/danareyes', '', 7, 'a\nb', 'x'.repeat(200)]),
    ['Dana Reyes', 'https://github.com/danareyes']);
  assert.equal(P.cleanPublicTerms(Array.from({ length: 50 }, (_, i) => `term ${i}`)).length, P.MAX_PUBLIC_TERMS);
  assert.deepEqual(P.cleanPublicTerms('Dana'), [], 'only a list');
});

// Value: protects=Company profile's public details reach the check as allowed beside the owner's list, even when the list is full, and nothing else from the profile does; fails_when=allowedPublicTerms or the check's read drops the profile or caps it with the list; why_new=the profile was only a suggestion before (owner, 2026-11-26); seam=none; no_claim=the model's own judgment
test('Company profile\'s public details are allowed beside the list, outside its cap', async () => {
  const profile = { businessName: 'Harbor & Pine', ceo: 'Sam Rivera', website: 'https://www.harborpine.example/', social: ['https://x.com/harborpine'], email: 'hello@harborpine.example', phone: '555 0100', hours: 'Mon to Fri' };
  assert.deepEqual(P.publicSuggestions(profile, ['sam rivera']), ['Harbor & Pine', 'https://www.harborpine.example/', 'hello@harborpine.example', 'https://x.com/harborpine'], 'what is on the list is not repeated; phone and hours are not public details');
  const full = Array.from({ length: P.MAX_PUBLIC_TERMS }, (_, i) => `term ${i}`);
  const all = P.allowedPublicTerms(full, profile);
  assert.equal(all.length, P.MAX_PUBLIC_TERMS + 5, 'the profile is not cut by the list cap');
  const { l, prompts } = layer(JSON.stringify({ decision: 'PASS' }), all);
  const q = 'Is the blog on https://blog.harborpine.example/news live yet?';
  assert.deepEqual(await l.inbound({ subject: 'Blog', body: q }), { decision: 'pass', subject: 'Blog', body: q });
  assert.match(prompts[0], /- "https:\/\/www\.harborpine\.example\/"/, 'the website reaches the check as allowed');
  assert.match(read('src/main/index.ts'), /return allowedPublicTerms\(cfg\.researchPublic, publicProfile\(cfg\.companyProfile, cfg\.businessName\)\);/);
});

// Value: protects=the check, the card and Settings read Company profile the same way, so a detail shown as allowed is one the check gets; fails_when=a screen reads the profile as saved while the check cleans it (a sixth social link); why_new=/ship review 2026-11-26; seam=none
test('the app, the card and Settings read Company profile through one cleaned view', () => {
  const { MAX_SOCIAL } = loadTs('src/shared/companyProfile.ts');
  const links = Array.from({ length: MAX_SOCIAL + 1 }, (_, i) => `https://social${i}.example/harborpine`);
  const p = P.publicProfile({ social: links, website: '  https://harborpine.example  ' }, 'Harbor & Pine');
  assert.equal(p.social.length, MAX_SOCIAL, 'the extra link is left out, as the check leaves it out');
  assert.equal(p.website, 'https://harborpine.example');
  assert.equal(p.businessName, 'Harbor & Pine');
  assert.equal(P.allowedPublicTerms([], p).includes(links[MAX_SOCIAL]), false);
  assert.match(read('src/renderer/src/components/ResearchKeptCards.tsx'), /const profile = publicProfile\(config\?\.companyProfile, config\?\.businessName\);/);
  assert.match(read('src/renderer/src/components/ResearchPrivacySettings.tsx'), /fromProfile=\{publicSuggestions\(publicProfile\(config\.companyProfile, config\.businessName\), cleanPublicTerms\(publicTerms\)\)\}/);
});

test('the check is told the owner\'s entries are public, kept as written inside a link or handle', async () => {
  const q = 'Read https://github.com/danareyes/harborpine/releases/ and list the last five releases';
  const { l, prompts } = layer(JSON.stringify({ decision: 'PASS' }), ['Dana Reyes']);
  assert.deepEqual(await l.inbound({ subject: 'Releases', body: q }), { decision: 'pass', subject: 'Releases', body: q });
  assert.match(prompts[0], /The business owner says these are the business's own and public\. They are not private: keep them as written, also inside a web address, an email address or a handle/);
  assert.match(prompts[0], /- "Dana Reyes"/);
  const none = layer(JSON.stringify({ decision: 'PASS' }), []);
  await none.l.inbound({ subject: 'Releases', body: q });
  assert.doesNotMatch(none.prompts[0], /The business owner says these are/, 'no list, no line');
});

test('the business\'s own public email passes the shape checks; anyone else\'s does not, and a key never does', async () => {
  const pass = JSON.stringify({ decision: 'PASS' });
  const own = layer(pass, ['hello@harborpine.example']);
  assert.equal((await own.l.inbound({ subject: 'Reviews', body: 'Find reviews that mention hello@harborpine.example' })).decision, 'pass');
  const other = layer(pass, ['hello@harborpine.example']);
  assert.equal((await other.l.inbound({ subject: 'Reviews', body: 'Find reviews that mention jane@northwind.example' })).decision, 'deny');
  // A dummy key, joined at run time so the secret scanner never reads it as one.
  const dummy = 'sk-ant-' + 'api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef';
  const key = layer(pass, [dummy]);
  const v = await key.l.inbound({ subject: 'x', body: `Use ${dummy} to search` });
  assert.equal(v.decision, 'deny');
  assert.equal(key.prompts.length, 0, 'a key never reaches the check, list or not');
});

test('only Settings writes it: a business setting, staged in Research & privacy', () => {
  assert.match(read('src/main/officeKeys.ts'), /'research', 'dataClasses', 'researchPublic',/);
  assert.match(read('src/main/index.ts'), /publicTerms: \(\) => publicTermsNow\(\),/);
  assert.match(read('src/renderer/src/components/SettingsModal.tsx'), /onPublicTermsChange=\{\(next\) => stage\(\{ researchPublic: next \} as Partial<HarnessConfig>\)\}/);
  assert.match(read('src/renderer/src/components/ResearchPrivacySettings.tsx'), /fromProfile=\{publicSuggestions\(/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).research;
  for (const k of ['publicTitle', 'publicTip', 'publicPlaceholder', 'publicAdd', 'publicMax', 'publicFromProfile', 'publicFromProfileTip']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, k);
  }
});

// Value: protects=an allowed entry is taken out of the shape checks only where it stands whole, so an allowed domain never hides another address at it; fails_when=withoutPublicTerms removes the entry as a bare substring; why_new=pre-landing review (targeted gate reader); seam=none; no_claim=the model's own judgment
test('an allowed address never hides a longer one', () => {
  const D = loadTs('src/shared/dataClasses.ts');
  const hit = (text, terms) => D.privatePatternHit(P.withoutPublicTerms(text, terms), { contact: 'private' });
  assert.equal(hit('ask jane.doe@harborpine.example about it', ['harborpine.example']), null, 'an address at an allowed domain passes (owner, 2026-11-26, D2)');
  assert.ok(hit('ask jane.doe@harborpine.example.evil.example about it', ['harborpine.example']), 'an address at a longer domain is still a contact');
  assert.ok(hit('mail sam@harborpine.example.evil.example', ['sam@harborpine.example']), 'a longer address is not the allowed one');
  assert.equal(hit('write to hello@harborpine.example today', ['hello@harborpine.example']), null, 'the allowed address itself passes');
  assert.equal(P.withoutPublicTerms('Read https://github.com/danareyes/harborpine/releases/', ['https://github.com/danareyes']).includes('danareyes'), false, 'an allowed link inside a longer one is taken out');
});

// Value: protects=an allowed domain covers the whole site (pages, subdomains, addresses) and never a lookalike, and the card groups a site's variants under the domain while a page on someone else's site stays its own row; fails_when=the domain pattern's boundaries move or groupKept keys on the host of a shared site; why_new=only a page under an allowed address was tested; seam=none; no_claim=what the model takes out
test('a domain is allowed entirely or not, never a lookalike', () => {
  const d = 'harborpine.example';
  for (const s of ['harborpine.example', 'https://harborpine.example/download', 'https://www.harborpine.example', 'blog.harborpine.example/post', 'jane@harborpine.example', 'jane.doe@blog.harborpine.example']) assert.equal(P.coversPart(d, s), true, s);
  for (const s of ['harborpine.example.evil.example', 'notharborpine.example', 'harborpine-example.io', 'evil-harborpine.example', 'https://evil.example/?u=xharborpine.example']) assert.equal(P.coversPart(d, s), false, s);
  assert.equal(P.coversPart('https://www.harborpine.example/', 'https://blog.harborpine.example/x'), true, 'a site address with no page stands for the domain');
  assert.equal(P.coversPart('https://github.com/danareyes', 'https://github.com/someoneelse'), false, 'a page on a shared site is not the site');
  assert.deepEqual(P.groupKept(['harborpine.example', 'Dana Reyes', 'https://harborpine.example', 'https://www.harborpine.example/download']), [
    { key: 'harborpine.example', parts: ['harborpine.example', 'https://harborpine.example', 'https://www.harborpine.example/download'] },
    { key: 'Dana Reyes', parts: ['Dana Reyes'] }
  ]);
  assert.deepEqual(P.groupKept(['https://github.com/danareyes/harborpine/releases/']).map((g) => g.key), ['https://github.com/danareyes/harborpine/releases/'], 'never github.com');
  assert.match(T.inboundPrompt('s', 'b', {}, 'n', [], [], [d]), /A domain on this list covers the whole site: every page on it, every subdomain \(www\., blog\.\) and every email address at it/);
});

// Value: protects=an allowance covers a kept back piece only when it is the whole piece, so the business name never marks "its payroll figures" allowed or locks Keep private, and Keep private on a longer piece never takes the domain off the list; fails_when=coversPart matches the entry anywhere inside the piece; why_new=/ship review 2026-11-26 finding 1 (probed: three of these were true); seam=none
test('an allowance covers a kept back piece only as the whole piece', () => {
  for (const [term, part] of [
    ['Harbor & Pine', 'Harbor & Pine payroll figures for October'],
    ['harborpine.example', 'https://evil.example/harborpine.example'],
    ['harborpine.example', 'Jane Doe (jane@gmail.example) at harborpine.example'],
    ['Dana Reyes', 'Dana Reyes salary'],
    ['https://github.com/danareyes', 'https://github.com/danareyesx']
  ]) assert.equal(P.coversPart(term, part), false, `${term} | ${part}`);
  for (const [term, part] of [
    ['Harbor & Pine', 'harbor & pine'],
    ['Harbor & Pine', '"Harbor & Pine".'],
    ['harborpine.example', 'https://www.harborpine.example/download?x=1'],
    ['harborpine.example', 'mailto:hello@harborpine.example'],
    ['https://github.com/danareyes', 'https://github.com/danareyes/harborpine/releases/'],
    ['hello@harborpine.example', 'mailto:hello@harborpine.example']
  ]) assert.equal(P.coversPart(term, part), true, `${term} | ${part}`);
  assert.equal(P.coversPart('hello@harborpine.example', 'mailto:jane@harborpine.example'), false, 'only that address');
  assert.equal(P.coversPart('Dana Reyes', 'mailto:Dana Reyes'), false, 'mailto: only before an address');
  // A rewrite is a whole message: an entry anywhere in it is kept.
  assert.deepEqual(P.droppedPublic(['harborpine.example'], 'Read harborpine.example/blog', 'Read the page at harborpine.example/blog for me'), []);
  // The check reads the full list and every profile detail.
  assert.equal(P.MAX_ALLOWED_TERMS, P.MAX_PUBLIC_TERMS + 5 + loadTs('src/shared/companyProfile.ts').MAX_SOCIAL);
  assert.match(read('src/main/trustLayer.ts'), /cleanPublicTerms\(deps\.publicTerms\?\.\(\) \?\? \[\], MAX_ALLOWED_TERMS\)/);
});

// Value: protects=a rewrite never silently drops what the owner allows: the check is asked again, and a second drop names it on the card; a request to quote a public page is not quoted text; fails_when=inbound returns the first rewrite as is, or the quote rule or keep line leaves the prompt; why_new=the owner's dontbemichael.com/blog became "the blog section" with nothing on the card (2026-11-26); seam=none; no_claim=how often the model drops it (probed live)
test('a rewrite that drops an allowed detail is asked again, and named on the card if it still does', async () => {
  const subject = 'Does a public blog page show its new layout yet?';
  const body = 'On dontbemichael.com/blog, describe the post card. Quote the summary under the post title exactly.';
  const dropped = JSON.stringify({ decision: 'CLEAN', subject, body: 'On the blog section, describe the post card.', removed: ['quoted'], parts: ['Quote the summary under the post title exactly.'] });
  const kept = JSON.stringify({ decision: 'CLEAN', subject, body: 'On dontbemichael.com/blog, describe the post card.', removed: ['quoted'], parts: ['Quote the summary under the post title exactly.'] });

  const fixed = layer((() => { let n = 0; return () => (++n === 1 ? dropped : kept); })(), ['dontbemichael.com']);
  const v = await fixed.l.inbound({ subject, body });
  assert.equal(fixed.prompts.length, 2, 'asked once more');
  assert.equal(v.body, 'On dontbemichael.com/blog, describe the post card.', 'the second rewrite keeps the site');
  assert.deepEqual(v.parts, ['Quote the summary under the post title exactly.']);

  const twice = layer(dropped, ['dontbemichael.com']);
  const w = await twice.l.inbound({ subject, body });
  assert.equal(twice.prompts.length, 2, 'asked once more, not again and again');
  assert.equal(w.decision, 'clean');
  assert.deepEqual(w.parts, ['Quote the summary under the post title exactly.', 'dontbemichael.com'], 'the card names the site it lost');

  const none = layer(kept, ['dontbemichael.com']);
  await none.l.inbound({ subject, body });
  assert.equal(none.prompts.length, 1, 'a rewrite that keeps it is not asked again');
  assert.deepEqual(P.droppedPublic(['dontbemichael.com'], 'see https://dontbemichael.com/blog', 'see dontbemichael.com'), [], 'the domain kept in another form is kept');

  const p = twice.prompts[0];
  assert.match(p, /A request for the researcher to quote, copy or describe something on a public web page is the research itself, not quoted text: keep it\./);
  assert.match(p, /If you rewrite the message, keep these exactly as they were written in it\./);
});
