'use strict';

/**
 * A job update is worked into the member's own job, and the card shows the
 * exact lines (owner, CEO review D2 to D4, 2026-11-07;
 * docs/designs/work-style-update-card-clarity.md).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { lineChanges, noLineChanges, roleLineChange, toRevisePrompt, wordDiff } = loadTs('src/shared/workStyleText.ts');
const fs = require('node:fs');
const path = require('node:path');

const JOB = [
  'The owner set this work style for your role at Sunrise, Portland.',
  '',
  '### The job',
  'Repeat work costs less to win than new work.',
  '',
  '### How to work',
  'Keep the pipeline current: name, referrer, service wanted, last contact, next step.',
  'Follow up on every quote within two days.'
].join('\n');

test('line changes: added, changed and no longer in it, headings and the opening line left out', () => {
  // Value: protects=the exact lines the card shows (CEO review C1); fails_when=a heading or the opening line shows as a change, a reworded line shows as one removed and one added, or an identical job shows changes; why_new=new helper; seam=none; no_claim=what the model writes
  assert.ok(noLineChanges(lineChanges(JOB, JOB)), 'nothing changes');
  const added = lineChanges(JOB, `${JOB}\nKeep the office's customer list and tell Michael about each new one.`);
  assert.deepEqual(added, { added: ["Keep the office's customer list and tell Michael about each new one."], changed: [], removed: [] });
  const reworded = lineChanges(JOB, JOB.replace('Follow up on every quote within two days.', 'Follow up on every quote within three days.'));
  assert.deepEqual(reworded.changed, [{ before: 'Follow up on every quote within two days.', after: 'Follow up on every quote within three days.' }]);
  assert.deepEqual(reworded.added, []);
  assert.deepEqual(reworded.removed, []);
  const gone = lineChanges(JOB, JOB.replace('Repeat work costs less to win than new work.\n', ''));
  assert.deepEqual(gone.removed, ['Repeat work costs less to win than new work.']);
  const headings = lineChanges(JOB, JOB.replace('### How to work', '### Working steps').replace('Sunrise, Portland', 'Sunrise, Salem'));
  assert.ok(noLineChanges(headings), 'headings and the opening line are not job lines');
});

test('a lengthened line is one change, read word by word', () => {
  // Value: protects=owner 2026-11-07 (the card was hard to read: a sentence the update lengthened showed as one line added and one taken out, and each change twice); fails_when=a line the new one holds whole is listed as removed, or the word runs lose, double or reorder words; why_new=bug fix; seam=pure; no_claim=colours
  const deals = 'Every open deal has a stage, a next step and a date, so nothing goes quiet by accident.';
  const longer = `${deals} You also keep the office's customer list, every customer ever won that the office knows by name, so there is one place to see who the office has sold to.`;
  const c = lineChanges(JOB.replace('### The job', `### The job\n${deals}`), JOB.replace('### The job', `### The job\n${longer}`));
  assert.deepEqual(c, { added: [], changed: [{ before: deals, after: longer }], removed: [] });
  assert.deepEqual(wordDiff(deals, longer), [{ kind: 'same', text: deals }, { kind: 'add', text: longer.slice(deals.length) }]);
  const before = 'Send here for "chase this prospect" or "what will close this month". Not for invoices.';
  const after = 'Send here for "chase this prospect", "what will close this month" or "who are our customers". Not for invoices.';
  const parts = wordDiff(before, after);
  assert.equal(parts.filter((p) => p.kind !== 'del').map((p) => p.text).join(''), after, 'the kept and added runs read as the new line');
  assert.equal(parts.filter((p) => p.kind !== 'add').map((p) => p.text).join(''), before, 'the kept and taken out runs read as the old line');
  assert.ok(!parts.some((p) => p.kind !== 'same' && /prospect|month/.test(p.text)), `a word beside new punctuation stays kept: ${JSON.stringify(parts)}`);
  assert.deepEqual(wordDiff('same words', 'same words'), [{ kind: 'same', text: 'same words' }]);
});

test('the role line is a marked change on the card, and never an unmarked paragraph', () => {
  // Value: protects=owner 2026-11-07 ("is What Dwight handles also changed?"); fails_when=a changed role line shows without its old text, an unchanged or kept one shows as a change, a role only change hides Use it, or the preview draws its own unmarked role paragraph on the card; why_new=bug fix; seam=pure + source; no_claim=layout
  const before = 'Dwight runs the sales pipeline: leads, open deals and their stages.';
  assert.equal(roleLineChange(before, null), null, 'kept by the analysis');
  assert.equal(roleLineChange(before, `  ${before.replace(' leads', '\n leads')} `), null, 'written back the same');
  assert.deepEqual(roleLineChange(before, `${before} And the office's customer list.`), { before, after: `${before} And the office's customer list.` });
  const card = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/WorkStyleUpdateCards.tsx'), 'utf8');
  assert.match(card, /const role = roleLineChange\(splitAgentRole\(agent\?\.description \?\? ''\)\.roleDescription, ok\.handles\);/);
  assert.match(card, /if \(noLineChanges\(c\) && !role\) return/, 'a role only change keeps Use it');
  assert.match(card, /\{role && <Changed label=\{t\('jobChange\.handles', \{ name \}\)\} pairs=\{\[role\]\} \/>\}/);
  const review = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/JobChangeReview.tsx'), 'utf8');
  assert.match(review, /\{!lead && !changes && \(\n\s*<div[^\n]*\n\s*<span style=\{fieldLabel\}>\{t\('jobChange\.handles'/, 'the preview leaves the role line to the card');
});

test('update mode: the duty is worked into the current job, the owner\'s job wins, clashes and scope changes are asked', () => {
  // Value: protects=owner CEO review D3 and eng E3, E7; fails_when=update mode loses the owner wins rule, the broader or narrower question, the routing lines, or leaks into an owner's own change; why_new=new mode; seam=none; no_claim=the model following it (eval)
  const base = { ctx: { name: 'Dwight', title: 'Sales Director', business: { name: 'Sunrise' } }, instructions: JOB, handles: 'Handles leads and deals', changes: ['Keep the office\'s customer list.'] };
  const update = toRevisePrompt({ ...base, update: true, routing: ['Not for marketing lists; that goes to Ryan.'] });
  assert.match(update, /The app has an update for the job of Dwight/);
  assert.match(update, /never replace the job/);
  assert.match(update, /the owner's current job wins every conflict/);
  assert.match(update, /Put each duty in the job once: as one line in the section it fits, usually "### How to work", or by changing the one line it belongs to, never both\. Leave the "### The job" sentences as they are unless the duty changes the outcome the whole job is for\./, 'one duty, one place (owner, 2026-11-07)');
  assert.match(update, /would make the role broader or narrower than the duty itself needs/);
  assert.match(update, /If the current job already covers the duty, return the current instructions unchanged, "handles": null and "summary": \[\]\./);
  assert.match(update, /--- ROUTING LINES \(check the duty against these; they stay as they are\) ---\nNot for marketing lists; that goes to Ryan\./);
  assert.match(update, /--- CHANGES: THE DUTIES THE APP ADDS, OLDEST FIRST ---/);
  const own = toRevisePrompt(base);
  assert.doesNotMatch(own, /The app has an update|broader or narrower|ROUTING LINES/, 'an owner\'s own change is unchanged (eng review E5)');
  assert.match(own, /Apply the owner's change to the current job below/);
});

test('the update flag survives the trip to main', () => {
  // Value: protects=the request parser keeps the update flag (eng review E8); fails_when=readReviseRequest rebuilds the request without it; why_new=new field; seam=none; no_claim=none beyond protects
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: {} };
  const { readReviseRequest } = loadTs('src/main/workStyleConvert.ts');
  const req = { to: 'revise', ctx: { name: 'Dwight' }, current: { instructions: JOB, handles: '' }, changes: ['Keep the customer list.'] };
  assert.equal(readReviseRequest({ ...req, update: true }).update, true);
  assert.equal(readReviseRequest(req).update, undefined);
});

test('a pack duty sits in the job\'s duties, never under the owner\'s approval list', () => {
  // Value: protects=new hires read each update's duty as work, not as something to ask approval for (owner, 2026-11-07); fails_when=a duty line is appended after "### Needs the owner's approval"; why_new=bug fix; seam=pack data; no_claim=wording
  const { WORK_STYLE_UPDATES } = loadTs('src/shared/workStyleUpdates.ts');
  const dir = path.join(__dirname, '../resources/packs');
  let seen = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    for (const a of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).agents ?? []) {
      for (const u of WORK_STYLE_UPDATES) {
        const at = (a.workStyle ?? '').indexOf(u.duty.slice(0, 40));
        if (at < 0) continue;
        seen++;
        const heads = a.workStyle.slice(0, at).match(/^### .+$/gm) ?? [];
        assert.notEqual(heads[heads.length - 1], '### Needs the owner\'s approval', `${f} ${a.id}: ${u.key}`);
      }
    }
  }
  assert.ok(seen >= 5, `the duties were found in the packs (${seen})`);
});

test('the card says why, and holds one row of buttons', () => {
  // Value: protects=owner 2026-11-07 ("why buttons in two rows", "what caused to suggest these changes", then "the why section does not need to be on the top"); fails_when=the reason sits open at the top or goes back behind an icon, the Why link loses its indigo, the reason no longer opens in place, Keep mine gets its own row under the preview, or the preview shows Cancel beside Keep mine; why_new=owner feedback; seam=source; no_claim=layout
  const card = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/WorkStyleUpdateCards.tsx'), 'utf8');
  assert.match(card, /why=\{\{ label: t\('jobChange\.updateWhyLabel'\), text: `\$\{t\(offer\.whyKey\)/, 'the reason is a folded link on the card (design job-update-why B)');
  assert.doesNotMatch(card, /<span style=\{groupLabel\}>\{t\('jobChange\.updateWhyLabel'\)\}/, 'not open at the top');
  assert.doesNotMatch(card, /<InfoTip/, 'not behind an icon');
  assert.match(card, /keep=\{keepMine\}/, 'Keep mine rides in the review\'s own row');
  assert.equal((card.match(/\{keepMine\}/g) ?? []).length, 2, 'and in the one row when nothing is worked out yet');
  const review = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/JobChangeReview.tsx'), 'utf8');
  assert.match(review, /<Keep \/>\n\s*\{!keep && <PixelButton variant="secondary" size="sm" onClick=\{onCancel\}/, 'no Cancel beside Keep mine');
  assert.equal((review.match(/<Keep \/>/g) ?? []).length, 6, 'every button row of the review');
  assert.match(review, /<Disclosure open=\{whyOpen\} \/>\{why\.label\}/, 'Why this change folds like See the whole new job');
  assert.match(review, /color: 'var\(--cth-indigo-text\)', fontWeight: 600 \}\}>\n\s*<Disclosure open=\{whyOpen\}/, 'and is set apart, easy to notice');
  assert.match(review, /\{why && whyOpen && <span/, 'it opens in place');
  for (const lang of ['en', 'ar', 'zh-CN']) {
    const L = JSON.parse(fs.readFileSync(path.join(__dirname, `../src/renderer/src/i18n/locales/${lang}.json`), 'utf8'));
    assert.match(L.jobChange.updateWhy, /\{\{name\}\}/, lang);
    assert.ok(L.jobChange.updateWhyLabel, lang);
    // Each reason names what went wrong before, not only what the update does.
    for (const [k, v] of Object.entries(L.askMe.workStyleWhy)) assert.ok(/[.。]\s*\S/.test(v), `${lang} ${k}: a cause, then the change`);
  }
});
