'use strict';

/**
 * GitHub through the owner's Claude connector with per member modes
 * (docs/designs/github-connector-modes.md): Pull only never writes, Pull and
 * push writes only agent/ branches, Push on approval holds every write,
 * .github/ is held in both write modes, and every unknown tool is refused.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const G = loadTs('src/shared/github.ts');
const read = (rel) => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', rel), 'utf8');

const URL = 'https://api.githubcopilot.com/mcp/';
const T = (name) => `mcp__claude_ai_GitHub__${name}`;
const cap = (rows) => G.cleanGitHubCapability({ repos: rows });
const ctx = (over) => ({
  cap: cap([{ repo: 'acme/site', mode: 'push', seen: 'private' }]),
  connectorUrl: URL,
  trimmed: false,
  visibility: () => 'private',
  ...over
});
const decide = (tool, input, over = {}) => G.githubAccess(ctx({ toolName: T(tool), input, ...over }));

const WRITES = {
  create_branch: { owner: 'acme', repo: 'site', branch: 'agent/x', from_branch: 'main' },
  create_or_update_file: { owner: 'acme', repo: 'site', branch: 'agent/x', path: 'blog/a.html', content: 'hi', message: 'add' },
  push_files: { owner: 'acme', repo: 'site', branch: 'agent/x', files: [{ path: 'blog/a.html', content: 'hi' }], message: 'add' },
  delete_file: { owner: 'acme', repo: 'site', branch: 'agent/x', path: 'blog/old.html', message: 'rm' },
  create_pull_request: { owner: 'acme', repo: 'site', head: 'agent/x', base: 'main', title: 'Blog page' }
};

test('Pull only allows listed reads and refuses every write', () => {
  const over = { cap: cap([{ repo: 'acme/site', mode: 'pull' }]) };
  assert.equal(decide('get_file_contents', { owner: 'acme', repo: 'site', path: 'a' }, over).kind, 'allow');
  for (const [tool, input] of Object.entries(WRITES)) {
    const d = decide(tool, input, over);
    assert.equal(d.kind, 'refuse', tool);
    assert.match(d.reason, /Pull only/);
  }
});

test('Pull and push allows writes to agent/ branches and opening a PR', () => {
  for (const [tool, input] of Object.entries(WRITES)) assert.equal(decide(tool, input).kind, 'allow', tool);
});

test('Push on approval holds every write, with its files', () => {
  const over = { cap: cap([{ repo: 'acme/site', mode: 'approval', seen: 'private' }]) };
  for (const [tool, input] of Object.entries(WRITES)) assert.equal(decide(tool, input, over).kind, 'hold', tool);
  const d = decide('push_files', WRITES.push_files, over);
  assert.deepEqual(d.files, ['blog/a.html']);
  assert.equal(d.branch, 'agent/x');
});

test('unknown and owner-only tools are refused in every mode', () => {
  for (const mode of G.GITHUB_MODES) {
    const over = { cap: cap([{ repo: 'acme/site', mode }]) };
    for (const tool of ['merge_pull_request', 'create_gist', 'fork_repository', 'issue_write', 'add_issue_comment', 'actions_run_trigger', 'update_pull_request', 'delete_repository', 'brand_new_tool', 'get_me']) {
      assert.equal(decide(tool, { owner: 'acme', repo: 'site' }, over).kind, 'refuse', `${mode} ${tool}`);
    }
  }
});

test('a repo not on the list is refused, with names normalized', () => {
  assert.equal(decide('get_file_contents', { owner: 'acme', repo: 'other', path: 'a' }).kind, 'refuse');
  assert.equal(decide('get_file_contents', { owner: 'Acme ', repo: 'Site', path: 'a' }).kind, 'allow');
  assert.equal(decide('get_file_contents', { path: 'a' }).kind, 'refuse');
});

test('branches must start with agent/', () => {
  for (const branch of ['main', 'agent', 'agent/', 'agentx/y', 'Agent/x', 'agent/../main']) {
    assert.equal(decide('create_or_update_file', { ...WRITES.create_or_update_file, branch }).kind, 'refuse', branch);
  }
  assert.equal(decide('create_or_update_file', { ...WRITES.create_or_update_file, branch: undefined }).kind, 'refuse');
  assert.equal(decide('create_pull_request', { ...WRITES.create_pull_request, head: 'acme:agent/x' }).kind, 'allow');
  assert.equal(decide('create_pull_request', { ...WRITES.create_pull_request, head: 'main' }).kind, 'refuse');
});

test('searches must name exactly one listed repo', () => {
  assert.equal(decide('search_code', { query: 'pricing repo:acme/site' }).kind, 'allow');
  for (const query of ['pricing', 'pricing repo:acme/site repo:acme/other', 'x repo:acme/site OR y', 'org:acme pricing', 'user:bob repo:acme/site', 'repo:acme/other x', '-repo:acme/site x']) {
    assert.equal(decide('search_code', { query }).kind, 'refuse', query);
  }
});

test('.github/ writes are held in Pull and push, refused in Pull only', () => {
  const wf = { ...WRITES.create_or_update_file, path: '.github/workflows/deploy.yml' };
  const held = decide('create_or_update_file', wf);
  assert.equal(held.kind, 'hold');
  assert.ok(held.flags.includes('workflow'));
  assert.equal(decide('push_files', { ...WRITES.push_files, files: [{ path: 'a.html', content: '' }, { path: './.GitHub/dependabot.yml', content: '' }] }).kind, 'hold');
  assert.equal(decide('create_or_update_file', wf, { cap: cap([{ repo: 'acme/site', mode: 'pull' }]) }).kind, 'refuse');
});

test('trimmed writes, missing files and climbing paths are refused', () => {
  assert.equal(decide('push_files', WRITES.push_files, { trimmed: true }).kind, 'refuse');
  assert.equal(decide('get_file_contents', { owner: 'acme', repo: 'site', path: 'a' }, { trimmed: true }).kind, 'allow');
  assert.equal(decide('push_files', { ...WRITES.push_files, files: [] }).kind, 'refuse');
  assert.equal(decide('create_or_update_file', { ...WRITES.create_or_update_file, path: '../x' }).kind, 'refuse');
});

test('only GitHub\'s own connector address gets the rules', () => {
  assert.equal(decide('get_file_contents', { owner: 'acme', repo: 'site', path: 'a' }, { connectorUrl: 'https://evil.example/mcp' }).kind, 'refuse');
  assert.equal(decide('get_file_contents', { owner: 'acme', repo: 'site', path: 'a' }, { connectorUrl: undefined }).kind, 'refuse');
  assert.ok(G.isGitHubConnectorUrl('https://api.githubcopilot.com/mcp/x/repos'));
  assert.ok(!G.isGitHubConnectorUrl('https://api.githubcopilot.com/mcpevil'));
});

test('visibility: unknown refuses writes, a private repo turned public refuses until confirmed, public is flagged', () => {
  assert.equal(decide('push_files', WRITES.push_files, { visibility: () => 'unknown' }).kind, 'refuse');
  assert.equal(decide('get_file_contents', { owner: 'acme', repo: 'site', path: 'a' }, { visibility: () => 'unknown' }).kind, 'allow');
  const flip = decide('push_files', WRITES.push_files, { visibility: () => 'public' });
  assert.equal(flip.kind, 'refuse');
  assert.match(flip.reason, /now public/);
  const pub = decide('push_files', WRITES.push_files, { cap: cap([{ repo: 'acme/site', mode: 'approval', seen: 'public' }]), visibility: () => 'public' });
  assert.ok(pub.flags.includes('public'));
});

test('flags come from the call: secrets, key files, deletes', () => {
  const over = { cap: cap([{ repo: 'acme/site', mode: 'approval', seen: 'private' }]) };
  const s = decide('create_or_update_file', { ...WRITES.create_or_update_file, content: 'key=ghp_' + 'a'.repeat(36) }, over);
  assert.ok(s.flags.includes('secret'));
  assert.ok(decide('create_or_update_file', { ...WRITES.create_or_update_file, path: 'config/.env' }, over).flags.includes('envfile'));
  assert.ok(decide('delete_file', WRITES.delete_file, over).flags.includes('delete'));
});

test('adding a repo: invalid, duplicate, public starts in Push on approval', () => {
  const c = cap([{ repo: 'acme/site', mode: 'pull' }]);
  assert.deepEqual(G.addRepoRow(c, 'not a repo', 'unknown'), { ok: false, error: 'invalid' });
  assert.deepEqual(G.addRepoRow(c, 'https://github.com/Acme/Site.git', 'private'), { ok: false, error: 'duplicate' });
  const pub = G.addRepoRow(c, 'acme/docs', 'public');
  assert.equal(pub.ok, true);
  assert.deepEqual(pub.cap.repos[1], { repo: 'acme/docs', mode: 'approval', seen: 'public' });
  assert.equal(G.addRepoRow(c, 'acme/new', 'private').cap.repos[1].mode, 'pull');
});

test('held writes: approve runs once, an error returns it, a second retry while running is refused', () => {
  const h = { id: 'h1', agentId: 'nick', tool: 'push_files', hash: 'abc', repo: 'acme/site', branch: 'agent/x', files: [], flags: [], visibility: 'private', says: '', input: {}, state: 'waiting', created: 0 };
  const list = [h];
  assert.equal(G.matchHeld(list, 'nick', 'abc').kind, 'waiting');
  h.state = 'approved';
  const m = G.matchHeld(list, 'nick', 'abc');
  assert.equal(m.kind, 'run');
  m.held.state = 'inflight'; m.held.toolUseId = 't1';
  assert.equal(G.matchHeld(list, 'nick', 'abc').kind, 'running');
  G.endHeld(list, 't1', false, 5);
  assert.equal(h.state, 'approved');
  m.held.state = 'inflight'; m.held.toolUseId = 't2';
  G.endHeld(list, 't2', true, 6);
  assert.equal(h.state, 'used');
  assert.equal(G.matchHeld(list, 'nick', 'abc').kind, 'new');
  assert.equal(G.matchHeld(list, 'other', 'abc').kind, 'new');
});

test('held writes: session end releases, expiry after 24 h, no timer release', () => {
  const h = { id: 'h1', agentId: 'nick', hash: 'abc', state: 'inflight', toolUseId: 't', created: 0 };
  assert.deepEqual(G.expireHeld([h], G.HELD_TTL_MS * 3), []);
  assert.equal(h.state, 'inflight');
  assert.equal(G.releaseAgent([h], 'nick'), 1);
  assert.equal(h.state, 'approved');
  assert.deepEqual(G.expireHeld([h], G.HELD_TTL_MS + 1), ['h1']);
});

test('canonical JSON ignores key order and changes with content', () => {
  assert.equal(G.callFingerprint('t', { b: 1, a: [{ y: 2, x: 1 }] }), G.callFingerprint('t', { a: [{ x: 1, y: 2 }], b: 1 }));
  assert.notEqual(G.callFingerprint('t', { a: 1 }), G.callFingerprint('t', { a: 2 }));
});

test('the repo picker reads GitHub\'s listing: normalized, private unless GitHub says public, no duplicates', () => {
  // Value: protects=the owner picks repos from the token's own list and a picked repo gets the right badge; fails_when=a missing private flag reads as public or a malformed row breaks the list; why_new=owner 2026-11-25 asked for a list instead of typing; seam=none; no_claim=GitHub's live API (checked by hand: 200, full_name and private on every row)
  const rows = G.reposFromListing([
    [{ full_name: 'Acme/Site', private: true }, { full_name: 'acme/docs', private: false }, { full_name: 'acme/odd' }, { nope: 1 }, null, { full_name: 'not a repo', private: false }],
    [{ full_name: 'acme/site', private: true }],
    { message: 'Bad credentials' }
  ]);
  assert.deepEqual(rows, [
    { repo: 'acme/docs', visibility: 'public' },
    { repo: 'acme/odd', visibility: 'private' },
    { repo: 'acme/site', visibility: 'private' }
  ]);
  assert.deepEqual(G.reposFromListing([]), []);
});

test('Actions: reading runs, jobs and logs is allowed in a listed repo; running or changing a run is refused', () => {
  // Value: protects=members can see how a change did in CI without being able to start, rerun, cancel or delete runs; fails_when=an Actions read is refused, a run_trigger call is allowed, or an unlisted repo is read; why_new=owner 2026-11-26 (actions toolset); seam=none; no_claim=GitHub's live tool catalog (names from github-mcp-server main)
  const over = { cap: cap([{ repo: 'acme/site', mode: 'pull' }]) };
  assert.equal(decide('actions_list', { method: 'list_workflow_runs', owner: 'acme', repo: 'site' }, over).kind, 'allow');
  assert.equal(decide('actions_get', { method: 'get_workflow_run', owner: 'acme', repo: 'site', resource_id: '1' }, over).kind, 'allow');
  assert.equal(decide('get_job_logs', { owner: 'acme', repo: 'site', run_id: 1, failed_only: true }, over).kind, 'allow');
  assert.equal(decide('get_job_logs', { owner: 'acme', repo: 'other', job_id: 1 }, over).kind, 'refuse');
  for (const mode of ['pull', 'push', 'approval']) {
    for (const method of ['run_workflow', 'rerun_workflow_run', 'rerun_failed_jobs', 'cancel_workflow_run', 'delete_workflow_run_logs']) {
      const d = decide('actions_run_trigger', { method, owner: 'acme', repo: 'site', run_id: 1, workflow_id: 'ci.yml', ref: 'main' }, { cap: cap([{ repo: 'acme/site', mode }]) });
      assert.equal(d.kind, 'refuse', `${mode} ${method}`);
    }
  }
  assert.match(G.githubContext(cap([{ repo: 'acme/site', mode: 'pull' }])), /read its Actions runs, jobs and job logs/);
});

test('job logs come back as a short tail; a member may ask for more, up to the cap', () => {
  // Value: protects=one job log call stays small enough to read in place, with a way to see further back; fails_when=a call without tail_lines goes up unchanged, a bigger ask is cut to the default, the cap is skipped, or other calls are rewritten; why_new=owner 2026-11-26 (82,000 character log); seam=none
  const call = (args, name = 'get_job_logs') => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const tail = (b) => JSON.parse(b).params.arguments.tail_lines;
  assert.equal(tail(G.withJobLogTail(call({ owner: 'acme', repo: 'site', job_id: 1 }))), G.JOB_LOG_TAIL_LINES);
  assert.equal(tail(G.withJobLogTail(call({ owner: 'acme', repo: 'site', job_id: 1, tail_lines: 'all' }))), G.JOB_LOG_TAIL_LINES);
  assert.equal(G.withJobLogTail(call({ owner: 'acme', repo: 'site', job_id: 1, tail_lines: 1200 })), null, 'a bigger ask in range goes up as asked');
  assert.equal(tail(G.withJobLogTail(call({ owner: 'acme', repo: 'site', job_id: 1, tail_lines: 999999 }))), G.JOB_LOG_MAX_TAIL_LINES);
  assert.equal(tail(G.withJobLogTail(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_job_logs' } }))), G.JOB_LOG_TAIL_LINES);
  assert.equal(G.withJobLogTail(call({ owner: 'acme', repo: 'site' }, 'actions_list')), null);
  assert.equal(G.withJobLogTail('{"jsonrpc":"2.0","id":1,"method":"tools/list"}'), null);
  assert.equal(G.withJobLogTail('not json'), null);
  const batch = JSON.parse(G.withJobLogTail(JSON.stringify([JSON.parse(call({ job_id: 1 })), JSON.parse(call({ run_id: 2, failed_only: true }))])));
  assert.deepEqual(batch.map((m) => m.params.arguments.tail_lines), [G.JOB_LOG_TAIL_LINES, G.JOB_LOG_TAIL_LINES]);
  const note = G.githubContext(cap([{ repo: 'acme/site', mode: 'pull' }]));
  assert.match(note, new RegExp(`last ${G.JOB_LOG_TAIL_LINES} lines; if the cause is not there, ask again with a bigger tail_lines, up to ${G.JOB_LOG_MAX_TAIL_LINES}`));
});

test('with local git, the GitHub note lets git run in the working copies and nowhere else', () => {
  // Value: protects=a member with working copies is never told both "never git from your shell" and "run git pull, commit, bundle"; fails_when=the GitHub note keeps its no-git line beside the LOCAL GIT note; why_new=/ship review 2026-11-26; seam=none
  const c = cap([{ repo: 'acme/site', mode: 'push' }]);
  assert.match(G.githubContext(c), /never git or the internet from your shell/, 'without local git, no git in the shell');
  const local = G.githubContext(c, true);
  assert.doesNotMatch(local, /never git/);
  assert.match(local, /git in it works only in those copies, and only git_push sends to GitHub/);
  assert.match(local, /edit files with the GitHub tools or in your working copy/);
  assert.match(read('src/main/hooks.ts'), /const gh = hasGitHub \? githubContext\(cap, !!local\) : null;/);
});
