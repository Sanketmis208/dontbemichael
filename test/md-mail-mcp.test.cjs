'use strict';

/**
 * md-mail MCP server (eng review E1, T5): the real script, spawned as a child
 * process, talking to a real IntegrationBroker whose mail handler is a stub.
 * Proves the token rides every call, errors come back as tool errors, and a bad
 * line gets a JSON-RPC error instead of killing the server (F-7).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const SCRIPT = path.resolve(__dirname, '..', 'resources', 'md-mail-mcp.cjs');

function rpc(child) {
  let buf = '';
  const waiting = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); w(msg); }
    }
  });
  let next = 1;
  return {
    send(method, params) {
      const id = next++;
      return new Promise((resolve) => { waiting.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    },
    raw(line, id = null) {
      return new Promise((resolve) => { waiting.set(id, resolve); child.stdin.write(line + '\n'); });
    }
  };
}

test('md-mail relays tool calls to the broker with the agent token', { timeout: 15_000 }, async (t) => {
  const calls = [];
  const broker = new IntegrationBroker({
    getRecord: () => undefined,
    getSecret: () => undefined,
    mail: async (agentId, op, body) => {
      calls.push({ agentId, op, body });
      if (op === 'send') return { status: 403, body: { error: 'You are Draft only: save the reply as a draft instead.' } };
      return { status: 200, body: { mailboxes: [{ mailbox: 'sales', address: 'sales@x.com' }], sending: 'draft only' } };
    }
  });
  await broker.start();
  t.after(() => broker.stop());
  const token = broker.grant('pty-dwight', [], 'dwight');

  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, MD_BROKER_URL: broker.url(), MD_BROKER_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const c = rpc(child);

  const init = await c.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'md-mail');
  const list = await c.send('tools/list', {});
  assert.deepEqual(list.result.tools.map((x) => x.name), ['list_mailboxes', 'search', 'read', 'save_attachment', 'archive', 'mark_read', 'mark_junk', 'draft', 'propose', 'send']);

  const ok = await c.send('tools/call', { name: 'list_mailboxes', arguments: {} });
  assert.equal(ok.result.isError, false);
  assert.match(ok.result.content[0].text, /sales@x.com/);
  assert.equal(calls[0].agentId, 'dwight', 'the broker resolved the token to the agent');

  const refused = await c.send('tools/call', { name: 'send', arguments: { mailbox: 'sales', to: 'a@b.com', subject: 's', body: 'b' } });
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0].text, /Draft only/);

  const unknown = await c.send('tools/call', { name: 'delete_everything', arguments: {} });
  assert.equal(unknown.error.code, -32602);

  const bad = await c.raw('{not json');
  assert.equal(bad.error.code, -32700);
  const still = await c.send('tools/list', {});
  assert.ok(still.result.tools.length, 'still answering after a bad line');
});

test('without a broker token every call is a plain tool error, not a crash', { timeout: 15_000 }, async (t) => {
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, MD_BROKER_URL: '', MD_BROKER_TOKEN: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const c = rpc(child);
  const r = await c.send('tools/call', { name: 'list_mailboxes', arguments: {} });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /not connected/);
});

test('a token the broker does not know is refused before mail runs', { timeout: 15_000 }, async (t) => {
  let ran = false;
  const broker = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined, mail: async () => { ran = true; return { status: 200, body: {} }; } });
  await broker.start();
  t.after(() => broker.stop());
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, MD_BROKER_URL: broker.url(), MD_BROKER_TOKEN: 'forged' }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const r = await rpc(child).send('tools/call', { name: 'list_mailboxes', arguments: {} });
  assert.equal(r.result.isError, true);
  assert.equal(ran, false);
});

test('closing the input right after a request still returns the whole reply', { timeout: 15_000 }, async () => {
  // Value: protects=a reply longer than one pipe write is never cut off when the caller closes the input; fails_when=the server exits on close before its answers are written out (macOS CI cut the 14 KB tool list at 8 KB on the 0.4.5 release head, 2026-11-28); why_new=that CI failure; seam=the real server over a pipe plus a pin on its close handler, since the cut depends on pipe timing a local run rarely hits; no_claim=answers that outlast the 10 s cap
  const child = spawn(process.execPath, [SCRIPT], { stdio: ['pipe', 'pipe', 'ignore'] });
  const chunks = [];
  child.stdout.on('data', (d) => chunks.push(d));
  const closed = new Promise((r) => child.on('close', r));
  child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
  assert.equal(await closed, 0);
  const reply = JSON.parse(Buffer.concat(chunks).toString('utf8').split('\n')[0]);
  assert.ok(reply.result.tools.length > 5, 'the whole tool list arrived');
  const src = require('node:fs').readFileSync(SCRIPT, 'utf8');
  const onClose = src.slice(src.indexOf("rl.on('close'"));
  assert.match(onClose, /Promise\.allSettled\(\[\.\.\.inFlight\]\)/, 'it finishes the answers already asked for');
  assert.match(onClose, /process\.stdout\.write\('', quit\)/, 'and exits only once stdout is written out');
  assert.doesNotMatch(src, /rl\.on\('close', \(\) => process\.exit\(0\)\)/, 'never exits the moment input closes');
});
