'use strict';

/**
 * The one reader for what an Ask me card rests on (docs/designs/ask-me-source-links.md).
 * The card and Michael's checks both read sources through it, so what shows
 * and what counts can never disagree.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const S = loadTs('src/shared/askSources.ts');
const of = (sources) => S.sourcesOf({ sources });

test('links, named records and searched places read as their kinds, in order', () => {
  // Value: protects=the three source shapes Michael and members write; fails_when=a kind is misread or reordered; why_new=new reader; seam=none; no_claim=none beyond protects
  const r = of([
    { label: 'Our HubSpot consulting page', url: 'https://example.com/hubspot-consulting' },
    { label: 'Dana Ortiz, 27 Oct', url: 'email:sales-example-com/%3Cabc%40mail.example.com%3E' },
    { label: 'Q3 pricing sheet', url: '/Users/owner/Office/Sales/q3-pricing.xlsx' },
    { label: 'Masa Global', id: 'HubSpot company 1234' },
    { label: 'HubSpot companies and contacts', searched: true },
    { label: 'The sales mailbox', searched: true }
  ]);
  assert.deepEqual(r.items.map((x) => x.kind), ['web', 'email', 'file', 'named']);
  assert.deepEqual(r.searched.map((x) => x.label), ['HubSpot companies and contacts', 'The sales mailbox']);
  assert.equal(S.hasUsableSource(r), true);
  // Windows and home paths are full paths too.
  assert.equal(of([{ label: 'Plan', url: 'C:\\Office\\plan.docx' }]).items[0].kind, 'file');
  assert.equal(of([{ label: 'Plan', url: '~/Office/plan.docx' }]).items[0].kind, 'file');
});

test('a link the card will not open keeps its label but counts for nothing', () => {
  // Value: protects=only http(s), email: and full paths open, and a card whose only source was refused is still flagged; fails_when=a scheme slips through or a refused link counts; why_new=new reader; seam=none; no_claim=main's own scheme gate (separate)
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'relative/page.html', 'email:not a link', 'https://', `https://example.com/${'a'.repeat(2100)}`]) {
    const r = of([{ label: 'Looks fine', url }]);
    assert.deepEqual(r.items, [{ kind: 'rejected', label: 'Looks fine' }], url.slice(0, 30));
    assert.equal(S.hasUsableSource(r), false, url.slice(0, 30));
  }
  // A label with no link and no id names nothing the owner can find.
  assert.deepEqual(of([{ label: 'Masa Global' }]).items, [{ kind: 'rejected', label: 'Masa Global' }]);
  assert.equal(S.hasUsableSource(of([{ label: 'Masa Global' }])), false);
});

test('labels are clipped, duplicates dropped, and the lists capped', () => {
  // Value: protects=a card row stays short and readable; fails_when=a long label or a flood of sources reaches the card; why_new=new reader; seam=none; no_claim=visual layout
  const long = of([{ label: 'x'.repeat(300), url: 'https://example.com' }]).items[0];
  assert.ok(long.label.length <= S.SOURCE_LABEL_MAX && long.label.endsWith('…'));
  const dup = of([
    { label: 'A', url: 'https://example.com/a' }, { label: 'A again', url: 'https://example.com/a' },
    { label: 'HubSpot', searched: true }, { label: 'hubspot', searched: true }
  ]);
  assert.equal(dup.items.length, 1);
  assert.equal(dup.searched.length, 1);
  const many = of(Array.from({ length: 40 }, (_, i) => ({ label: `Page ${i}`, url: `https://example.com/${i}` })));
  assert.equal(many.items.length, S.SOURCE_LINKS_MAX);
  // A place given with an address opens: the link wins over "searched".
  assert.equal(of([{ label: 'Site', url: 'https://example.com', searched: true }]).items[0].kind, 'web');
});

test('anything that is not a list of objects is read as no sources', () => {
  // Value: protects=a malformed tasks.json entry never breaks a card or a check; fails_when=sourcesOf throws or shows junk; why_new=chaos input; seam=none; no_claim=none beyond protects
  for (const sources of [undefined, null, 'https://example.com', 42, {}, [null, 7, 'x', [], { label: '' }, { label: 5, url: 'https://example.com' }]]) {
    assert.deepEqual(S.sourcesOf({ sources }), { items: [], searched: [] }, JSON.stringify(sources));
  }
  assert.deepEqual(S.sourcesOf(null), { items: [], searched: [] });
  // Control and format characters never reach a label.
  assert.equal(of([{ label: 'Line\none\u202e', url: 'https://example.com' }]).items[0].label, 'Line one');
});

test('a file the question already shows is not listed again beside it', () => {
  // Value: protects=the owner sees the file to review once, not once in the question and again in the sources (owner, 2026-11-10); fails_when=a file named in the words is listed again, or another source is dropped with it; why_new=new display rule; seam=pure helpers; no_claim=the renderer's chip parse (chipPaths, pinned in ask-source-row)
  const draft = '/Users/owner/Office/Sales/Northwind last note draft.md';
  const first = '/Users/owner/Office/Sales/Northwind first contact.md';
  const entry = {
    q: `**Approve one last short note?**\n\n\`${draft}\``,
    sources: [
      { label: 'The draft note', url: draft },
      { label: 'First email, 26 Oct', url: first },
      { label: 'Our HubSpot page', url: 'https://example.com/hubspot' },
      { label: 'HubSpot contacts', searched: true }
    ]
  };
  const all = S.sourcesOf(entry);
  const shown = S.sourcesBesideText(all, [draft]);
  assert.deepEqual(shown.items.map((x) => x.label), ['First email, 26 Oct', 'Our HubSpot page']);
  assert.deepEqual(shown.searched.map((x) => x.label), ['HubSpot contacts']);
  // What Michael's checks count is unchanged.
  assert.equal(all.items.length, 3);
  assert.equal(S.hasUsableSource(S.sourcesBesideText(S.sourcesOf({ sources: [{ label: 'Draft', url: draft }] }), [draft])), false);
  assert.equal(S.hasUsableSource(S.sourcesOf({ sources: [{ label: 'Draft', url: draft }] })), true);
  // Nothing shown in the words: the list is kept as is.
  assert.equal(S.sourcesBesideText(all, []), all);
});

test('the words a card draws are the question, its parts and its options', () => {
  // Value: protects=a file named in a part or an option counts as shown too; fails_when=parts or option labels are left out, or bad shapes throw; why_new=new helper; seam=pure helper; no_claim=none beyond protects
  const t = S.entryText({ q: 'Main', parts: [{ q: 'Part one' }, null, 'x'], options: [{ label: 'Send it' }, {}] });
  assert.equal(t, 'Main\n\nPart one\n\nSend it');
  assert.equal(S.entryText(null), '');
  assert.equal(S.entryText({ q: 3 }), '');
});
