'use strict';

/**
 * A card about something outside the office links it, and a card saying
 * nothing was found says where the team looked (owner, 2026-11-08; the Masa
 * Global card: "May Ryan take the Mark McCulloh testimonial off our HubSpot
 * consulting page?" had no link to the page, the post or the case study, and
 * "Nobody in the office has any record of Masa Global" never said where the
 * team looked). docs/designs/ask-me-source-links.md.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const R = loadTs('src/shared/ownerRequests.ts');

const EMAIL_SINCE = Date.parse('2026-11-05T19:00:00Z');
const at = '2026-11-08T15:00:00Z';
const misses = (e) => R.askMissesSource({ askedAt: at, ...e }, EMAIL_SINCE);

const masa = {
  q: '**May Ryan take the Mark McCulloh testimonial off our HubSpot consulting page?** Nobody in the office has any record of Masa Global or Mark McCulloh, so we can\'t stand behind a quote shown under a client\'s name.',
  askedAt: at, raisedBy: 'ryan',
  parts: [
    { q: 'Take the testimonial down?', options: [{ label: 'Yes, take it down', recommended: true }, { label: 'No, leave it' }] },
    { q: 'The Masa Global post and case study?', options: [{ label: 'Drop them', recommended: true }, { label: 'Check with someone' }] }
  ]
};

test('the Masa Global card is flagged until it links what it names and says where the team looked', () => {
  // Value: protects=the owner opens what a card rests on without searching (owner, 2026-11-08); fails_when=a card naming a page, post or case study passes with no source; why_new=the Masa Global card; seam=none; no_claim=whether Michael then fixes it (agent behavior)
  assert.equal(R.askMissesSource(masa, EMAIL_SINCE), true);
  assert.equal(R.askClaimsUnsearched(masa), true);
  const fixed = { ...masa, sources: [
    { label: 'Our HubSpot consulting page', url: 'https://example.com/hubspot-consulting' },
    { label: 'The Masa Global case study', url: 'https://example.com/case-studies/masa-global' },
    { label: 'HubSpot companies and contacts', searched: true },
    { label: 'The sales mailbox', searched: true }
  ] };
  assert.equal(R.askMissesSource(fixed, EMAIL_SINCE), false);
  assert.equal(R.askClaimsUnsearched(fixed), false);
});

test('what counts as a usable source', () => {
  // Value: protects=a card with a real way to the thing passes, and one without is still flagged; fails_when=a label alone or a refused link silences the check, or a real link is missed; why_new=new check; seam=none; no_claim=none beyond protects
  const q = '**Take the testimonial off our consulting page?**';
  assert.equal(misses({ q, sources: [{ label: 'Masa Global', id: 'HubSpot company 1234' }] }), false, 'a record named with its id');
  assert.equal(misses({ q: `${q} [the page](https://example.com/p)` }), false, 'a markdown link in the text');
  assert.equal(misses({ q: `${q} https://example.com/p` }), false, 'a bare address in the text');
  assert.equal(misses({ q: `${q} The copy is in \`/Users/owner/Office/site/consulting.md\`.` }), false, 'a file path chip');
  assert.equal(misses({ q, sources: [{ label: 'Masa Global' }] }), true, 'a label alone names nothing to open');
  assert.equal(misses({ q, sources: [{ label: 'The page', url: 'javascript:alert(1)' }] }), true, 'a refused link counts for nothing');
  assert.equal(misses({ q, noSource: true }), false, 'nothing outside the office to link');
  assert.equal(misses({ q, noEmail: true }), true, 'no email behind it is not nothing outside the office');
});

test('words for existing outside things are flagged; asks to make or send something new are not', () => {
  // Value: protects=the check nags only about things that already exist; fails_when=an ask to draft or send something new is listed every turn, or a named page or record is missed; why_new=new trigger words; seam=none; no_claim=other languages (English words only)
  for (const q of [
    '**Update the price on our pricing page?**',
    '**Reply to the review on Google?**',
    '**Remove their post from our feed?**',
    '**The deal in HubSpot shows a new owner: approve?**',
    '**Pay the invoice?** It is overdue.',
    '**Correct the listing for our shop?**',
    '**Approve the case study for Northwind?**'
  ]) assert.equal(misses({ q }), true, q);
  for (const q of [
    '**Draft a new post for LinkedIn?**',
    '**Send the quote email to Northwind?**',
    '**Approve the price change?** Oscar wrote the report.',
    '**Turn on Email on Pam\'s Access tab?**',
    '**Write this down for the record?**',
    '**Start the new campaign on Monday?**'
  ]) assert.equal(misses({ q }), false, q);
  assert.equal(misses({ kind: 'foundation', q: 'Which website do we sell from?' }), false, 'a foundation question');
});

test('an open card is checked at any age, and the old no email flag quiets only email words', () => {
  // Value: protects=the Masa Global card itself (asked 2026-11-06, still open, carrying "noEmail": true) is listed until it links what it names (owner, 2026-11-08: "still not seeing the context and link"); fails_when=an older open ask is skipped by date, or "noEmail" silences the page and record words; why_new=the first build skipped both; seam=none; no_claim=whether Michael then fixes it
  const old = { ...masa, askedAt: '2026-11-06T15:16:00Z', noEmail: true };
  assert.equal(R.askMissesSource(old, EMAIL_SINCE), true, 'old and flagged noEmail, still names a page and a case study');
  assert.equal(R.askClaimsUnsearched(old), true);
  assert.equal(R.askMissesSource({ q: '**Approve the reply to Will Cox?**', askedAt: '2026-11-01T10:00:00Z' }, EMAIL_SINCE), false, 'email words keep their own start');
  assert.equal(R.askMissesSource({ q: '**Approve the reply to Will Cox?**', askedAt: at, noEmail: true }, EMAIL_SINCE), false, 'noEmail still quiets email words');
  const blocked = { id: 'ryan-masa-ask', title: 'Masa Global testimonial and drafts', status: 'blocked', assignee: 'ryan', humanQA: [old] };
  assert.deepEqual(R.asksToTidy([blocked]).map((c) => c.issue).sort(), ['no-search', 'no-source'], 'no start date needed');
});

test('a claim that nothing was found needs where the team looked; harmless phrases do not', () => {
  // Value: protects=absence claims show where the team looked; fails_when=a no-record claim passes with no searched place, or "page not found" is flagged; why_new=SRC-4; seam=none; no_claim=whether the places named were really searched
  const un = (q, extra = {}) => R.askClaimsUnsearched({ q, askedAt: at, ...extra });
  for (const q of ['No one in the office knows who Mark is.', 'There is no record of this customer.', "We couldn't find the contract.", 'We could not find the invoice.', 'No trace of the payment.', 'We found nothing on them.'])
    assert.equal(un(q), true, q);
  for (const q of ['The page shows "page not found".', 'There is nothing on the calendar that day.', 'Approve the refund?'])
    assert.equal(un(q), false, q);
  assert.equal(un('No record of the payment.', { noSearch: true }), false, 'the way out');
  assert.equal(un('No record of the payment.', { kind: 'foundation' }), false, 'a foundation question');
});

test('open reports are checked on any card, and both kinds reach Michael with what to do', () => {
  // Value: protects=a notice or scheduled report on a Done card links its sources too (SRC-2), and Michael is told each turn; fails_when=asksToTidy skips cards with no open ask, or a head is missing; why_new=reports were never checked; seam=none; no_claim=whether Michael acts on it
  const report = { kind: 'report', q: '**Ryan found the Masa Global testimonial on our consulting page.** Nobody in the office has any record of them.', askedAt: at, raisedBy: 'ryan' };
  const done = { id: 'ryan-masa', title: 'Masa Global testimonial', status: 'done', assignee: 'ryan', humanQA: [report] };
  const stuck = R.asksToTidy([done], Infinity, EMAIL_SINCE);
  assert.deepEqual(stuck.map((c) => c.issue).sort(), ['no-search', 'no-source']);
  const said = R.stuckCardsContext(stuck);
  assert.match(said, /ASKS AND REPORTS ABOUT SOMETHING OUTSIDE THE OFFICE WITH NO LINK TO IT\.[^\n]*"sources"[^\n]*"noSource": true/);
  assert.match(said, /ASKS AND REPORTS THAT SAY NOTHING WAS FOUND, WITHOUT SAYING WHERE THE TEAM LOOKED\.[^\n]*"searched": true[^\n]*"noSearch": true/);
  assert.ok(said.indexOf('NO LINK TO IT') < said.indexOf('NOTHING WAS FOUND'), 'in order');
  // A report the owner already read with Got it is not open any more.
  const read = { ...done, humanQA: [{ ...report, dismissedAt: at, dismissedBy: 'owner', dismissedReason: 'Got it' }] };
  assert.deepEqual(R.asksToTidy([read], Infinity, EMAIL_SINCE), []);
  // The Masa Global ask on a Blocked card: both kinds, once each.
  const blocked = { id: 'ryan-masa-ask', title: 'Masa Global testimonial and drafts', status: 'blocked', assignee: 'ryan', humanQA: [masa] };
  assert.deepEqual(R.asksToTidy([blocked], Infinity, EMAIL_SINCE).map((c) => c.issue).sort(), ['no-search', 'no-source']);
});

test('every rule site tells members and Michael to keep and show sources', () => {
  // Value: protects=the eight rule sites stay in step with the checks (a hand-synced list); fails_when=a site loses its sources or searched-place rule, or the email-only line comes back; why_new=new rules; seam=source pins; no_claim=whether agents follow them (the behavior replay ship gate covers that)
  const hive = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  for (const pin of [
    'lists each one in that humanQA entry\\\'s "sources", so the owner opens it from the card instead of searching',
    'lists each place the team looked as {"label": "<the place, like HubSpot companies and contacts>", "searched": true}',
    'Folding a filing into a card, or several asks into one, keeps every source on the entry that stays.',
    'its email: link goes in "sources" as the team member gave it',
    '"q": "<one bold line with what happened and why it matters>", "sources": [<the email\\\'s link',
    'Name every page, record, post, email or file you tell the owner about with its link',
    'A standup or summary names each page, record, email or file it mentions with its link',
    'a report built from a connector with no link names it as {"label": "<the report>", "id": "<the connector, report and period>"}',
    'Keep the link of everything your work rests on, and pass it on',
    'Never shorten or rewrite a link, and never put a tracking link in place of the page.',
    'list each place you looked as {"label": "<the place, like HubSpot contacts>", "searched": true}',
    '- an ask that says nothing was found lists each place the team looked as \\`{"label": "...", "searched": true}\\`;',
    'A filing about something outside the office adds \\`"sources"\\`',
    // Records named in an ask are linked where they are named (owner, 2026-11-10).
    'Each record the ask, a part or an option names (a deal, a contact, a company, an invoice) is a link right where its name is',
    'for a record a tool gave no link for, with the record\\\'s own id from the tool, never its name again; at most six.',
    'In an "ask", write each record you name (a deal, a contact, a company, an invoice) as a link where you name it',
    "- each record an ask, a part or an option names (a deal, a contact, a company, an invoice) is a link where its name is"
  ]) assert.ok(hive.includes(pin), pin.slice(0, 70));
  assert.ok(!hive.includes('An ask about a particular email always carries that email'), 'the email-only rule is gone');
  assert.ok(!hive.includes('- an ask built on an email keeps that email'), 'the email-only protocol line is gone');
});
