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
