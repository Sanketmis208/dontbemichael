'use strict';

/**
 * MCP servers the owner adds with a token (integration kind 'mcp'): any
 * service whose Claude connector login does not fit, such as a GitHub account
 * on another email. The broker adds the token and forwards MCP to the server's
 * own address; a member never sees the token, reaches only what it was given,
 * and GitHub's repo modes still apply in the hook.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = require.cache[electron] || { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };

const I = loadTs('src/shared/integrations.ts');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function send(base, route, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(route, base), { method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { text += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function setup(t, grants = { gh: 'change' }) {
  const seen = [];
  const upstream = http.createServer((req, res) => {
    let b = '';
    req.on('data', (d) => { b += d; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: b });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-1', 'www-authenticate': 'Bearer realm="x"' });
      res.end('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');
    });
  });
  const port = await listen(upstream);
  t.after(() => upstream.close());
  const records = {
    gh: { id: 'gh', label: 'GitHub (token)', kind: 'mcp', baseUrl: `http://127.0.0.1:${port}/mcp/`, authType: 'bearer', secretRef: 'int:gh', enabled: true },
    rest: { id: 'rest', label: 'Books', kind: 'custom-rest', baseUrl: `http://127.0.0.1:${port}`, authType: 'none', enabled: true }
  };
  const broker = new IntegrationBroker({
    getRecord: (id) => records[id],
    getSecret: (ref) => (ref === 'int:gh' ? 'ghp_real_secret' : undefined),
    integrationLevel: (agentId, id) => (agentId === 'nick' ? grants[id] : undefined)
  });
  await broker.start();
  t.after(() => broker.stop());
  return { broker, seen, records, nick: broker.grant('pty-n', [], 'nick'), pam: broker.grant('pty-p', [], 'pam') };
}

test('the broker adds the token, forwards MCP headers and never passes the member\'s token up', { timeout: 10_000 }, async (t) => {
  // Value: protects=a token connection works without the member ever holding the token; fails_when=the broker token goes upstream or the real token is missing; why_new=new route; seam=none; no_claim=GitHub's real server (local stub)
  const { broker, seen, nick } = await setup(t);
  const out = await send(broker.url(), '/mcp/gh', {
    headers: { authorization: `Bearer ${nick}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-session-id': 'sess-1', cookie: 'a=b' },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  });
  assert.equal(out.status, 200);
  assert.match(out.body, /"result"/);
  assert.equal(out.headers['mcp-session-id'], 'sess-1');
  assert.equal(out.headers['www-authenticate'], undefined, 'no login prompt reaches the member');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, '/mcp/');
  assert.equal(seen[0].headers.authorization, 'Bearer ghp_real_secret');
  assert.equal(seen[0].headers['mcp-session-id'], 'sess-1');
  assert.equal(seen[0].headers.cookie, undefined);
  assert.ok(!JSON.stringify(seen[0].headers).includes(nick), 'the member token never goes upstream');
});

test('only a member holding the connection reaches it', { timeout: 10_000 }, async (t) => {
  const { broker, seen, pam, nick, records } = await setup(t);
  assert.equal((await send(broker.url(), '/mcp/gh', { headers: { authorization: `Bearer ${pam}` }, body: '{}' })).status, 403);
  assert.equal((await send(broker.url(), '/mcp/gh', { body: '{}' })).status, 401);
  records.gh.enabled = false;
  assert.equal((await send(broker.url(), '/mcp/gh', { headers: { authorization: `Bearer ${nick}` }, body: '{}' })).status, 403);
  assert.equal(seen.length, 0);
});

test('a REST integration is not reachable as MCP, and an MCP one not as REST', { timeout: 10_000 }, async (t) => {
  const { broker, nick, seen } = await setup(t, { gh: 'change', rest: 'change' });
  assert.equal((await send(broker.url(), '/mcp/rest', { headers: { authorization: `Bearer ${nick}` }, body: '{}' })).status, 404);
  assert.equal((await send(broker.url(), '/i/gh/anything', { method: 'GET', headers: { authorization: `Bearer ${nick}` } })).status, 400);
  assert.equal(seen.length, 0);
});

test('MCP records: validated, kept out of list_integrations, started only when granted, ready and enabled', () => {
  // Value: protects=a member starts with exactly the token connections it holds; fails_when=a disabled, keyless or ungranted one loads; why_new=new kind; seam=none; no_claim=none beyond protects
  assert.equal(I.validateIntegrationRecord({ id: 'gh', label: 'GitHub', kind: 'mcp', baseUrl: 'https://api.githubcopilot.com/mcp/', authType: 'bearer', enabled: true }).ok, true);
  assert.equal(I.validateIntegrationRecord({ id: 'gh', label: 'GitHub', kind: 'mcp', baseUrl: 'https://api.githubcopilot.com/mcp/', authType: 'github', enabled: true }).ok, false);
  assert.equal(I.validateIntegrationRecord({ id: 'gh', label: 'GitHub', kind: 'mcp', baseUrl: 'http://example.com/mcp', authType: 'bearer', enabled: true }).ok, false, 'https only');
  const cfg = { agentCapabilities: { nick: { integrations: { gh: 'change', off: 'change', nokey: 'change', rest: 'read' } } } };
  const recs = [
    { id: 'gh', kind: 'mcp', authType: 'bearer', enabled: true, hasSecret: true, label: 'G', baseUrl: 'https://a/mcp' },
    { id: 'off', kind: 'mcp', authType: 'bearer', enabled: false, hasSecret: true, label: 'O', baseUrl: 'https://a/mcp' },
    { id: 'nokey', kind: 'mcp', authType: 'bearer', enabled: true, hasSecret: false, label: 'N', baseUrl: 'https://a/mcp' },
    { id: 'other', kind: 'mcp', authType: 'bearer', enabled: true, hasSecret: true, label: 'X', baseUrl: 'https://a/mcp' },
    { id: 'rest', kind: 'custom-rest', authType: 'none', enabled: true, hasSecret: false, label: 'R', baseUrl: 'https://a' }
  ];
  assert.deepEqual(I.mcpIntegrationsFor(cfg, 'nick', recs), ['gh']);
  assert.deepEqual(I.mcpIntegrationsFor(cfg, 'research', recs), []);
  assert.deepEqual(I.agentIntegrations(cfg, 'nick', recs).map((r) => r.id), ['rest']);
  assert.equal(I.mcpIntegrationId('mcp__md-mcp-github-mcp__push_files'), 'github-mcp');
  assert.equal(I.mcpIntegrationId('md-mcp-gh'), 'gh');
  assert.equal(I.mcpIntegrationId('mcp__md-mail__send'), null);
});

test('a GitHub token connection gets the repo modes in the hook; another token connection passes the gate', async (t) => {
  const { HiveManager } = loadTs('src/main/hive.ts');
  const { HookServer } = loadTs('src/main/hooks.ts');
  const { GitHubHeldStore } = loadTs('src/main/githubConnector.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-tok-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'nick', name: 'nick', provider: 'claude', cwd: home });
  const cfg = {
    harnessHome: home,
    integrations: [
      { id: 'github-mcp', label: 'GitHub (token)', kind: 'mcp', baseUrl: 'https://api.githubcopilot.com/mcp/', authType: 'bearer', enabled: true },
      { id: 'notes', label: 'Notes', kind: 'mcp', baseUrl: 'https://notes.example.com/mcp', authType: 'bearer', enabled: true }
    ],
    agentCapabilities: { nick: { integrations: { 'github-mcp': 'change', notes: 'change' }, github: { repos: [{ repo: 'acme/site', mode: 'pull' }] } } }
  };
  const server = new HookServer(hive, () => null, () => cfg);
  server.github = { visibility: () => 'private', held: new GitHubHeldStore({ path: path.join(home, 'held.json'), tell: () => {}, changed: () => {} }) };
  const call = (tool_name, tool_input) => server.handle({ agent_id: 'nick', session_id: 's', hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 'u', cwd: home });
  const denied = (r) => r?.hookSpecificOutput?.permissionDecision === 'deny';
  assert.ok(!denied(await call('mcp__md-mcp-github-mcp__get_file_contents', { owner: 'acme', repo: 'site', path: 'a' })));
  assert.match((await call('mcp__md-mcp-github-mcp__push_files', { owner: 'acme', repo: 'site', branch: 'agent/x', files: [{ path: 'a', content: 'b' }], message: 'm' })).hookSpecificOutput.permissionDecisionReason, /Pull only/);
  assert.ok(denied(await call('mcp__md-mcp-github-mcp__get_file_contents', { owner: 'acme', repo: 'other', path: 'a' })));
  assert.ok(denied(server.handle({ agent_id: 'nick', session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'ReadMcpResourceTool', tool_input: { server: 'md-mcp-github-mcp', uri: 'repo://x' }, cwd: home })), 'its resources are refused');
  assert.ok(!denied(await call('mcp__md-mcp-notes__search', { q: 'x' })), 'another token connection passes; the broker checks its grant');
});

test('the broker checks each tool call too, so a call that skips the hook still meets the rules', { timeout: 10_000 }, async (t) => {
  // Value: protects=GitHub modes hold even when a member reaches the broker without Claude (no shell sandbox on Windows); fails_when=the broker forwards a refused tools/call; why_new=defense in depth for the new route; seam=mcpToolGate dep; no_claim=the real gate wiring in index.ts (stub gate here)
  const seen = [];
  const upstream = http.createServer((req, res) => { req.resume(); req.on('end', () => { seen.push(req.url); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"jsonrpc":"2.0","id":7,"result":{}}'); }); });
  const port = await listen(upstream);
  t.after(() => upstream.close());
  const rec = { id: 'gh', label: 'G', kind: 'mcp', baseUrl: `http://127.0.0.1:${port}/mcp`, authType: 'none', enabled: true };
  const broker = new IntegrationBroker({
    getRecord: () => rec, getSecret: () => undefined, integrationLevel: () => 'change',
    mcpToolGate: (_a, _i, tool) => (tool === 'merge_pull_request' ? 'Not allowed.' : null)
  });
  await broker.start();
  t.after(() => broker.stop());
  const token = broker.grant('pty', [], 'nick');
  const call = (name) => send(broker.url(), '/mcp/gh', { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: {} } }) });
  const refused = await call('merge_pull_request');
  assert.equal(JSON.parse(refused.body).error.message, 'Not allowed.');
  assert.equal(seen.length, 0, 'never forwarded');
  const ok = await call('get_file_contents');
  assert.match(ok.body, /"result"/);
  assert.equal(seen.length, 1);
  const batch = await send(broker.url(), '/mcp/gh', { headers: { authorization: `Bearer ${token}` }, body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'merge_pull_request', arguments: {} } }]) });
  assert.match(batch.body, /Not allowed/, 'a batch with one refused call is refused');
  assert.equal(seen.length, 1);
  // Every request in that batch is answered, so no call waits forever; a
  // notification (no id) gets nothing (/ship review 2026-11-26).
  const many = await send(broker.url(), '/mcp/gh', { headers: { authorization: `Bearer ${token}` }, body: JSON.stringify([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_file_contents', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'merge_pull_request', arguments: {} } },
    { jsonrpc: '2.0', method: 'notifications/progress' }
  ]) });
  const answers = JSON.parse(many.body);
  assert.ok(Array.isArray(answers));
  assert.deepEqual(answers.map((a) => a.id), [1, 2]);
  assert.match(answers[0].error.message, /another call in the same batch was refused/);
  assert.equal(answers[1].error.message, 'Not allowed.');
  assert.equal(seen.length, 1, 'nothing in the batch was forwarded');
});

test('the Test button speaks MCP to an MCP server: a POSTed initialize, never a GET', () => {
  // Value: protects=testing a working MCP integration reads as working; fails_when=the probe falls back to GET (GitHub's MCP answers 405); why_new=owner saw 405 on 2026-11-25; seam=none; no_claim=a live server (checked by hand: GET 405, this POST 200)
  const { mcpProbeRequest } = loadTs('src/shared/integrations.ts');
  const r = mcpProbeRequest();
  assert.equal(r.method, 'POST');
  assert.match(r.headers.accept, /application\/json/);
  assert.match(r.headers.accept, /text\/event-stream/);
  const body = JSON.parse(r.body);
  assert.equal(body.method, 'initialize');
  assert.equal(body.jsonrpc, '2.0');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  const handler = src.slice(src.indexOf("ipcMain.handle('integrations:test'"), src.indexOf('// ─── IPC: config'));
  assert.match(handler, /rec\.kind === 'mcp' \? mcpProbeRequest\(\)/);
});

test('the repo list uses the integration\'s own token, only to api.github.com, and keeps it out of the window', () => {
  // Value: protects=the token never leaves main or goes to another host; fails_when=the handler forwards to the record's baseUrl or returns the secret; why_new=repo picker; seam=source pin; no_claim=a live call
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  const h = src.slice(src.indexOf("ipcMain.handle('github:listRepos'"), src.indexOf("ipcMain.handle('github:visibility'"));
  assert.match(h, /rec\.kind !== 'mcp' \|\| !isGitHubConnectorUrl\(rec\.baseUrl\)/);
  assert.match(h, /fetch\(`https:\/\/api\.github\.com\/user\/repos\?/);
  assert.equal((h.match(/fetch\(/g) ?? []).length, 1);
  assert.match(h, /return \{ ok: true, repos \}/);
  assert.doesNotMatch(h, /repos, secret|secret \}/);
});

test('a GitHub connection asks for the actions toolset; other MCP servers get no toolsets header', { timeout: 10_000 }, async (t) => {
  // Value: protects=members see GitHub's Actions tools (CI runs and logs) through the token connection; fails_when=the header is missing for GitHub or leaks to another server; why_new=owner 2026-11-26; seam=fake fetch; no_claim=GitHub's live server
  const calls = [];
  const records = {
    gh: { id: 'gh', label: 'GitHub (token)', kind: 'mcp', baseUrl: 'https://api.githubcopilot.com/mcp/', authType: 'bearer', secretRef: 'int:gh', enabled: true },
    other: { id: 'other', label: 'Other', kind: 'mcp', baseUrl: 'https://mcp.example.com/mcp/', authType: 'bearer', secretRef: 'int:gh', enabled: true }
  };
  const broker = new IntegrationBroker({
    getRecord: (id) => records[id],
    getSecret: () => 'ghp_real_secret',
    integrationLevel: (agentId) => (agentId === 'nick' ? 'change' : undefined),
    fetchImpl: async (url, init) => { calls.push({ url: String(url), headers: init.headers, body: init.body }); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); }
  });
  await broker.start();
  t.after(() => broker.stop());
  const nick = broker.grant('pty-n', [], 'nick');
  for (const id of ['gh', 'other']) {
    await send(broker.url(), `/mcp/${id}`, { headers: { authorization: `Bearer ${nick}`, 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['x-mcp-toolsets'], 'context,repos,issues,pull_requests,users,actions');
  assert.equal(calls[1].headers['x-mcp-toolsets'], undefined);
  // A job log call to GitHub goes up with a short tail; the same call to another server is untouched.
  calls.length = 0;
  const logs = '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_job_logs","arguments":{"owner":"acme","repo":"site","job_id":1}}}';
  for (const id of ['gh', 'other']) await send(broker.url(), `/mcp/${id}`, { headers: { authorization: `Bearer ${nick}`, 'content-type': 'application/json' }, body: logs });
  assert.equal(JSON.parse(String(calls[0].body)).params.arguments.tail_lines, 150);
  assert.equal(JSON.parse(String(calls[1].body)).params.arguments.tail_lines, undefined);
});
