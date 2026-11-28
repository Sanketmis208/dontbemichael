'use strict';

/**
 * What an email promises for later is tracked (owner, 2026-11-27: Pam told a
 * bookkeeper two statements "will follow separately", and nothing kept that as
 * a to do). The member lists each promise on propose or send, the owner sees
 * them on the card, and once the email is out Michael gets one request to
 * keep a card for each.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { readPromises, promiseMessage, PROMISES_MAX, PROMISE_MAX } = loadTs('src/shared/mailProposals.ts');
const { handleMailRequest, PROMISES_NOT_FILED } = loadTs('src/main/mail.ts');
const { MailApprovals } = loadTs('src/main/mailApprovals.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const server = { host: 'h', port: 993, secure: true };
const box = (id) => ({ id, address: `${id}@x.com`, provider: 'gmail', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 });
const cfg = {
  mailboxes: [box('ceo'), box('support')],
  agentCapabilities: {
    pam: { email: { enabled: true, mailboxes: ['ceo'], send: false, sending: 'approval' } },
    kelly: { email: { enabled: true, mailboxes: ['support'], send: true, sending: 'send' } }
  }
};
const PROMISES = ['Send the statement closing in November, which covers the rest of October', 'Send the bank statements for April to October'];

function setup({ hive = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-promises-'));
  const out = { messages: [], sends: [] };
  const approvals = new MailApprovals({
    path: path.join(dir, 'mail-proposals.json'),
    send: (m) => { if (!hive) return false; out.messages.push(m); return true; },
    remember: () => {},
    toast: () => {},
    agentName: (id) => ({ pam: 'Pam', kelly: 'Kelly', god: 'Michael' }[id] ?? id),
    godId: () => 'god',
    changed: () => {},
    now: () => 1_000_000
  });
  let repeat = false;
  const svc = { send: async (agentId, id, input) => { out.sends.push(input); return repeat ? { sent: true, repeated: true, messageId: '<m1@x.com>' } : { sent: true, messageId: `<m${out.sends.length}@x.com>` }; } };
  const call = (agent, op, body) => handleMailRequest(svc, { getConfig: () => cfg, proposals: approvals }, agent, op, body);
  return { approvals, call, out, repeatNext: () => { repeat = true; }, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const promised = (out) => out.messages.filter((m) => m.subject === 'Promised in an email');

test('promises are short plain lines, no blanks or repeats, and at most five', () => {
  // Value: protects=what the member writes can't flood Michael or the card; fails_when=a non list, blanks, repeats or overlong lines get through; why_new=new field; seam=pure
  assert.deepEqual(readPromises('one'), []);
  assert.deepEqual(readPromises([' a  b ', '', 'A B', 3, 'c']), ['a b', 'c']);
  assert.equal(readPromises(Array.from({ length: 9 }, (_, i) => `p${i}`)).length, PROMISES_MAX);
  assert.equal(readPromises(['x'.repeat(900)])[0].length, PROMISE_MAX);
});

test('a proposal keeps its promises for the card, and the approved send hands them to Michael once', async (t) => {
  // Value: protects=the bookkeeper case: approved email goes out and each promise reaches Michael as a card to keep; fails_when=propose drops the promises, the send forgets them, or a repeat send files them twice; why_new=owner 2026-11-27; seam=fake mail service
  const { approvals, call, out, repeatNext, cleanup } = setup();
  t.after(cleanup);
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'books@keeper.com', subject: 'Re: statements', body: 'Attached. The rest will follow separately.', promises: PROMISES });
  assert.equal(p.status, 200);
  assert.deepEqual(approvals.get(p.body.proposal).promises, PROMISES, 'on the card');
  assert.equal(promised(out).length, 0, 'nothing is tracked before it is sent');
  approvals.decide(p.body.proposal, 'approve', {}, '');
  const sent = await call('pam', 'send', { mailbox: 'ceo', proposal: p.body.proposal });
  assert.equal(sent.status, 200);
  const [m] = promised(out);
  assert.ok(m, 'Michael is asked');
  assert.equal(m.to, 'god');
  assert.equal(m.act, 'request');
  assert.match(m.body, /^Pam sent an email to books@keeper\.com, "Re: statements" \(\[To books@keeper\.com, \d+ \w+\]\(email:/);
  for (const line of PROMISES) assert.ok(m.body.includes(`- ${line}`), line);
  assert.match(m.body, /"pam" as assignee/);
  assert.match(m.body, /"waiting" with "waitingOn"[^]*"nextAt"/, 'a dated promise waits until its date');
  assert.match(m.body, /--- SENT TEXT ---\nAttached\. The rest will follow separately\./, 'the text as sent, so an owner edit that dropped a promise is seen');
  repeatNext();
  await call('pam', 'send', { mailbox: 'ceo', proposal: p.body.proposal });
  assert.equal(promised(out).length, 1, 'a repeat send files nothing again');
});

test('a direct send with promises is tracked; one with none, a draft or a failed send is not', async (t) => {
  // Value: protects=Can send members are tracked too, and only real sends count; fails_when=only proposals carry promises, or an empty list or a draft asks Michael; why_new=owner 2026-11-27; seam=fake mail service
  const { call, out, cleanup } = setup();
  t.after(cleanup);
  await call('kelly', 'send', { mailbox: 'support', to: 'a@b.com', subject: 'S', body: 'B', promises: ['Send the signed contract on Monday'] });
  assert.equal(promised(out).length, 1);
  assert.match(promised(out)[0].body, /^Kelly sent an email to a@b\.com[^]*- Send the signed contract on Monday/);
  await call('kelly', 'send', { mailbox: 'support', to: 'a@b.com', subject: 'S2', body: 'B2' });
  await call('kelly', 'draft', { mailbox: 'support', to: 'a@b.com', subject: 'S3', body: 'B3', promises: ['x'] });
  assert.equal(promised(out).length, 1);
});

test('promises given at the send of an approved proposal are added to the proposal\'s, never dropped', async (t) => {
  // Value: protects=a promise named only when the approved email is sent still reaches Michael; fails_when=the approved send uses only the promises given to propose and drops the rest without a word; why_new=review 2026-11-27 of the running branch; seam=fake mail service
  const { approvals, call, out, cleanup } = setup();
  t.after(cleanup);
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'books@keeper.com', subject: 'Re: statements', body: 'The rest will follow.', promises: [PROMISES[0]] });
  approvals.decide(p.body.proposal, 'approve', {}, '');
  await call('pam', 'send', { mailbox: 'ceo', proposal: p.body.proposal, promises: [PROMISES[1], PROMISES[0]] });
  const [m] = promised(out);
  assert.ok(m, 'Michael is asked');
  for (const line of PROMISES) assert.equal(m.body.split(`- ${line}`).length, 2, `once each: ${line}`);
  const tool = read('resources/md-mail-mcp.cjs');
  assert.match(tool, /With a proposal id, the promises given to propose are used, and any you give here are added to them\./);
});

test('promises that could not reach Michael are said in the send result, and the send still stands', async (t) => {
  // Value: protects=a member is never left believing Michael tracks a promise he never got; fails_when=the hive is off at the send and the result says nothing, so the promise is lost; why_new=review 2026-11-27 of the running branch; seam=fake mail service with a hive that refuses
  const { call, out, cleanup } = setup({ hive: false });
  t.after(cleanup);
  const r = await call('kelly', 'send', { mailbox: 'support', to: 'a@b.com', subject: 'S', body: 'B', promises: ['Send the signed contract on Monday'] });
  assert.equal(r.status, 200);
  assert.equal(r.body.sent, true, 'the email went out');
  assert.equal(r.body.promises, PROMISES_NOT_FILED);
  assert.doesNotMatch(PROMISES_NOT_FILED, /[\u2013\u2014]| - /, 'no dashes in text an agent reads');
  const plain = await call('kelly', 'send', { mailbox: 'support', to: 'a@b.com', subject: 'S2', body: 'B2' });
  assert.equal(plain.body.promises, undefined, 'nothing said when there were none');
  assert.equal(out.sends.length, 2);
});

test('Michael\'s request keeps the logged subject fixed and names nothing private there', () => {
  // Value: protects=D14, the office log (committed to git) never carries the email's subject or address; fails_when=the subject holds the email's own words; why_new=new message; seam=pure
  const m = promiseMessage({ member: 'Pam', memberId: 'pam', to: 'x@y.com', subject: 'Private', body: 'b', link: null, promises: ['p'] });
  assert.equal(m.subject, 'Promised in an email');
  assert.match(m.body, /Track it on the board/);
});

test('the mail tool offers promises on propose and send, and the card shows them', () => {
  // Value: protects=members can list promises and the owner sees them before approving; fails_when=the schema or the card loses the field; why_new=owner 2026-11-27; seam=tool list over stdio and a source pin; no_claim=layout
  const res = execFileSync(process.execPath, [path.resolve(__dirname, '../resources/md-mail-mcp.cjs')], { input: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n', timeout: 5000 }).toString();
  const tools = Object.fromEntries(JSON.parse(res.split('\n')[0]).result.tools.map((x) => [x.name, x.inputSchema.properties]));
  assert.ok(tools.propose.promises && tools.send.promises);
  assert.equal(tools.draft.promises, undefined, 'a draft is the owner\'s to send');
  const card = read('src/renderer/src/components/MailProposalCards.tsx');
  assert.match(card, /\{p\.promises!\.map\(\(line, i\) => <li key=\{i\} dir="auto">\{line\}<\/li>\)\}/);
  const L = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).askMe;
  assert.ok(L.mailPromises);
  assert.match(L.mailPromisesTip, /\{\{manager\}\}[^]*\{\{name\}\}/);
  for (const s of [L.mailPromises, L.mailPromisesTip]) assert.doesNotMatch(s, /[–—]| - /, 'no dashes in owner copy');
});
