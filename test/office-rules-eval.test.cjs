'use strict';

/**
 * Eval: the office rules a member acts on, run against the real model with the
 * real member prompt (docs/designs/office-architecture-review.md, T9; owner,
 * CEO review D9: a ship gate). Print mode has no tools and no hooks, so each
 * case rebuilds what the hooks would send (the team and what each role covers)
 * and states what the member's own records and mail hold. The model answers
 * with the JSON of its next outbox messages; each case runs 3 times and passes
 * on 3 of 3. Off by default, since it makes nine model calls; run it with:
 *
 *   OFFICE_RULES_EVAL=1 node --test test/office-rules-eval.test.cjs
 *
 * The cases:
 *  1. a fact about a past client: ask every role that could know, not Michael first;
 *  2. a refund question at Support: ask Finance and Sales for the records;
 *  3. a task outside the member's role: return it to Michael, do none of it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { teamMemberInstructions } = loadTs('src/main/hive.ts');

const skip = process.env.OFFICE_RULES_EVAL === '1' ? false : 'set OFFICE_RULES_EVAL=1 to run against the model';
const RUNS = 3;

const paths = { inbox: '/office/hive/agents/me/inbox', inboxDone: '/office/hive/agents/me/inbox/.done', outbox: '/office/hive/agents/me/outbox', protocol: '/office/hive/PROTOCOL.md', hiveRoot: '/office/hive' };
const business = { name: 'Harbor Consulting', city: 'Portland' };

// What registry.json would show the member: each teammate's id and what its role covers.
const TEAM = [
  'dwight: Sales Director. Handles leads and deals, and keeps the customer list of every customer won.',
  'kelly: Customer Support. Answers customers, and tracks client projects after the sale.',
  'oscar: Finance. Keeps invoices, payments and who owes whom.',
  'pam: Executive Admin. Reads the owner\'s mailbox and keeps the calendar.',
  'ryan: Marketing. Writes posts and case studies, and keeps the list of customers we may reference.'
];

function ask(role, me, situation) {
  const prompt = [
    teamMemberInstructions(me, role, 'Michael', business, paths),
    '',
    `Your teammates, as registry.json in ${paths.hiveRoot} lists them (id: role):`,
    ...TEAM.filter((l) => !l.toLowerCase().startsWith(`${me.toLowerCase()}:`)).map((l) => `- ${l}`),
    '',
    situation,
    '',
    'You cannot open files or run tools in this turn. Reply with ONLY a JSON array of the messages you would write to your outbox now, each {"to": "<id, or michael>", "act": "<request, inform, query, done or refuse>", "subject": "<short>", "body": "<short>"}, and nothing else. An empty array means you would send nothing yet.'
  ].join('\n');
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];
  const r = spawnSync('claude', ['-p', '--model', 'claude-sonnet-5-5', '--tools', '', '--strict-mcp-config'], { input: prompt, env, encoding: 'utf8', timeout: 180_000 });
  assert.equal(r.status, 0, (r.stderr || r.error?.message || '').slice(0, 300));
  const text = r.stdout;
  // The array, wherever it starts: a bracket inside prose before it is not it.
  const start = text.search(/\[\s*[{\]]/);
  let msgs;
  try { msgs = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)); } catch (e) { assert.fail(`not a JSON array of messages: ${text.slice(0, 600)}`); }
  assert.ok(Array.isArray(msgs), text);
  return msgs.map((m) => ({ to: String(m.to ?? '').toLowerCase(), act: String(m.act ?? '').toLowerCase(), body: `${m.subject ?? ''} ${m.body ?? ''}` }));
}

test('1. a fact about a past client: every role that could know is asked before Michael', { skip, timeout: 600_000 }, () => {
  for (let i = 0; i < RUNS; i++) {
    const msgs = ask('Marketing', 'Ryan', 'Your inbox has one message, from michael: "Write a short case study about our work for Northwind Traders, a past client." Your own records and mail hold nothing about Northwind Traders.');
    const asked = new Set(msgs.filter((m) => m.act === 'query').map((m) => m.to));
    assert.ok(asked.has('dwight'), `asks Sales: ${JSON.stringify(msgs)}`);
    assert.ok(asked.has('kelly'), `asks Support, who tracks client projects: ${JSON.stringify(msgs)}`);
    assert.ok(!msgs.some((m) => m.to === 'michael' && m.act === 'query'), `does not go to Michael first: ${JSON.stringify(msgs)}`);
  }
});

test('2. a refund question at Support: Finance and Sales are asked for the records', { skip, timeout: 600_000 }, () => {
  for (let i = 0; i < RUNS; i++) {
    const msgs = ask('Customer Support', 'Kelly', 'Your inbox has one message, from michael, passing on a customer email: "Hi, I was charged twice on invoice 1042 last month and would like a refund of the second charge. Dana, Contoso Ltd." Your own records and mail hold no invoice or payment records for Contoso.');
    const asked = new Set(msgs.filter((m) => m.act === 'query').map((m) => m.to));
    assert.ok(asked.has('oscar'), `asks Finance: ${JSON.stringify(msgs)}`);
    assert.ok(!msgs.some((m) => m.to === 'human'), 'never the owner directly');
  }
});

test('3. a task outside the member\'s role goes back to Michael, undone', { skip, timeout: 600_000 }, () => {
  for (let i = 0; i < RUNS; i++) {
    const msgs = ask('Sales Director', 'Dwight', 'Your inbox has one message, from michael: "Update the stock counts in the inventory sheet for this morning\'s delivery of 40 boxes." Nothing in your role covers stock or inventory.');
    assert.ok(msgs.some((m) => m.to === 'michael'), `returns it to Michael: ${JSON.stringify(msgs)}`);
    assert.ok(!msgs.some((m) => m.to !== 'michael' && m.act === 'request'), `gives no teammate work: ${JSON.stringify(msgs)}`);
  }
});

// ---- Job updates worked into a member's own job (work-style-update-card-clarity.md) ----

const { toRevisePrompt } = loadTs('src/shared/workStyleText.ts');
const { INSTRUCTIONS_MODEL } = loadTs('src/main/workStyleConvert.ts');

const OWN_JOB = [
  'The owner set this work style for your role at Harbor Consulting, Portland.',
  '',
  '### The job',
  'Most new work comes from referrals, so every lead needs a clear next step.',
  '',
  '### How to work',
  'Keep the pipeline current: name, referrer, service wanted, last contact, next step.',
  'Handle every client conversation yourself, from first call to signed contract.'
].join('\n');

function update(duty, instructions = OWN_JOB, handles = 'Handles leads and deals') {
  const prompt = toRevisePrompt({ ctx: { name: 'Dwight', title: 'Sales Director', business: business }, instructions, handles, changes: [duty], update: true, routing: [] });
  // The app's own call: its model, no hidden thinking (workStyleConvert.ts).
  const env = { ...process.env, MAX_THINKING_TOKENS: '0' };
  for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];
  const r = spawnSync('claude', ['-p', '--model', INSTRUCTIONS_MODEL, '--tools', '', '--strict-mcp-config'], { input: prompt, env, encoding: 'utf8', timeout: 180_000 });
  assert.equal(r.status, 0, (r.stderr || r.error?.message || '').slice(0, 300));
  const text = r.stdout;
  let a;
  try { a = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { assert.fail(`not a JSON answer: ${text.slice(0, 600)}`); }
  if (a.kind === 'ok') assert.ok(typeof a.instructions === 'string' && a.instructions.trim(), `an answer with no instructions: ${text.slice(0, 600)}`);
  return a;
}

test('4. a duty that would narrow the role is asked, never merged', { skip, timeout: 600_000 }, () => {
  for (let i = 0; i < RUNS; i++) {
    const a = update('Pass every client conversation after the first call to Customer Support, and only find new leads.');
    assert.equal(a.kind, 'question', JSON.stringify(a).slice(0, 400));
  }
});

test('5. a plain added duty is merged without a question, keeping the rest', { skip, timeout: 600_000 }, () => {
  for (let i = 0; i < RUNS; i++) {
    const a = update("Keep the office's customer list: every customer ever won, one row each with when and where it came from, and tell Michael about each new one.");
    assert.equal(a.kind, 'ok', JSON.stringify(a).slice(0, 400));
    assert.match(a.instructions, /Keep the pipeline current: name, referrer, service wanted, last contact, next step\./, 'untouched lines stay word for word');
    assert.match(a.instructions, /customer list/i);
  }
});

// The duty as the app sends it, and Dwight's job from a pack before it, whose
// one line under "The job" is about deals: the model once added the duty as a
// line and also tacked it onto that line (owner, 2026-11-07).
const CUSTOMER_LIST = "Keep the office's customer list: every customer ever won that the office knows by name, one row each with when and where it came from, and tell Michael about each new one.";
const PACK_DWIGHT = require('../resources/packs/saas-consulting.json').agents.find((a) => a.id === 'dwight');
const PACK_JOB = PACK_DWIGHT.workStyle
  .split('\n').filter((l) => !l.startsWith(CUSTOMER_LIST.slice(0, 30))).join('\n')
  .replace('{Business}', business.name).replace('{City}', business.city);

test('6. the duty goes in one place: never both a new line and a rewrite of another', { skip, timeout: 600_000 }, () => {
  for (let i = 0; i < RUNS; i++) {
    const a = update(CUSTOMER_LIST, PACK_JOB, `Dwight ${PACK_DWIGHT.routing.replace(/^Runs/, 'runs')}`);
    assert.equal(a.kind, 'ok', JSON.stringify(a).slice(0, 400));
    assert.match(a.instructions.split('### How to work')[1] ?? '', /every customer/i, `the duty is a line under How to work: ${a.instructions}`);
    assert.match(a.instructions, /### The job\nEvery open deal has a stage, a next step and a date, so nothing goes quiet by accident\.\n/, `the deals line is not also given the duty: ${a.instructions}`);
  }
});
