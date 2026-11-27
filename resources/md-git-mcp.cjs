#!/usr/bin/env node
'use strict';

/**
 * md-git: a team member's local git tools (docs/designs/github-local-git.md).
 *
 * A dependency-free MCP stdio server, the same shape as md-mail. Claude Code
 * starts it outside the agent's shell sandbox with MD_BROKER_URL and
 * MD_BROKER_TOKEN. Every tool call becomes `POST <broker>/git/<tool>`; the app
 * holds the GitHub token and decides what this member may do, so this file
 * holds no token and no rules, and runs no git.
 */

const http = require('node:http');
const readline = require('node:readline');

const BROKER = process.env.MD_BROKER_URL || '';
const TOKEN = process.env.MD_BROKER_TOKEN || '';
// A push fetches, checks and pushes: several git commands of two minutes at most.
const CALL_TIMEOUT_MS = 10 * 60_000;

const repo = { type: 'string', description: 'The repo as owner/name, one of your GitHub repos, for example acme/site.' };

const TOOLS = [
  {
    name: 'git_sync',
    description: 'Bring GitHub\'s latest for one of your repos into the app\'s copy on this computer, and make your own working copy the first time. Then run git pull (or git fetch) in your working copy: your shell has no internet, and git there reaches only the app\'s copy.',
    inputSchema: { type: 'object', properties: { repo }, required: ['repo'] }
  },
  {
    name: 'git_push',
    description: 'Send your committed branch to GitHub. First, in your working copy, run: git bundle create ../<repo folder>.push.bundle <branch> --not origin/HEAD. The app reads that one file, checks it against your GitHub mode (only agent/ branches, never a force push; Push on approval and any change under .github/ wait for the owner), then pushes it. Open the pull request afterwards with the GitHub tools.',
    inputSchema: { type: 'object', properties: { repo, branch: { type: 'string', description: 'Your branch, starting with agent/, for example agent/blog-link.' } }, required: ['repo', 'branch'] }
  }
];

function write(msg) {
  try { process.stdout.write(JSON.stringify(msg) + '\n'); } catch { /* stdout closed */ }
}

function callBroker(tool, args) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(`/git/${tool}`, BROKER); } catch { return resolve({ status: 503, body: { error: 'Local git is not connected for you right now.' } }); }
    const payload = JSON.stringify(args || {});
    const req = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-md-broker-token': TOKEN },
      timeout: CALL_TIMEOUT_MS
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data || '{}'); } catch { body = { error: data.slice(0, 500) || 'Empty answer from the app.' }; }
        resolve({ status: res.statusCode || 500, body });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 504, body: { error: 'The app took too long to answer. Run git_sync and look at the branches before pushing again: the push may have gone.' } }); });
    req.on('error', (e) => resolve({ status: 503, body: { error: `Couldn't reach the app: ${e.code || e.message}` } }));
    req.end(payload);
  });
}

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => { if (id !== undefined) write({ jsonrpc: '2.0', id, result }); };
  const fail = (code, message) => { if (id !== undefined) write({ jsonrpc: '2.0', id, error: { code, message } }); };
  if (method === 'initialize') {
    return reply({
      protocolVersion: (params && params.protocolVersion) || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'md-git', version: '1.0.0' },
      instructions: 'Local git for your GitHub repos: git_sync, work and commit in your working copy, then git_push. Open pull requests with the GitHub tools.'
    });
  }
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    const name = params && params.name;
    if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
    const out = await callBroker(name, (params && params.arguments) || {});
    const ok = out.status >= 200 && out.status < 300 && out.body && out.body.ok === true;
    const text = (out.body && (out.body.text || out.body.error)) || `Git error ${out.status}`;
    return reply({ content: [{ type: 'text', text }], isError: !ok });
  }
  if (method === 'ping') return reply({});
  if (typeof method === 'string' && method.startsWith('notifications/')) return;
  return fail(-32601, `Method not found: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  if (!msg || typeof msg !== 'object') return write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
  handle(msg).catch((e) => write({ jsonrpc: '2.0', id: msg.id === undefined ? null : msg.id, error: { code: -32603, message: String((e && e.message) || e) } }));
});
rl.on('close', () => process.exit(0));
process.on('uncaughtException', (e) => { try { process.stderr.write(`md-git: ${e && e.stack}\n`); } catch { /* ignore */ } });
