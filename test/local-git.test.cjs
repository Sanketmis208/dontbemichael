'use strict';

/**
 * Local git for members with GitHub repos (docs/designs/github-local-git.md):
 * the app's copy, the member's working copy, and a push taken as a bundle and
 * checked against the member's modes. Runs real git against a local repo that
 * stands in for GitHub.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');
const { posixOnly } = require('./platform.cjs');
const L = loadTs('src/shared/localGit.ts');
const { LocalGit, _test } = loadTs('src/main/localGit.ts');
const { GitHubHeldStore } = loadTs('src/main/githubConnector.ts');

let hasGit = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { hasGit = false; }
const gitOnly = hasGit ? {} : { skip: 'git is not installed' };

const g = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' } });

/** An office with a stand in GitHub repo holding one commit on main. */
function office(t, mode = 'push') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-localgit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const upstream = path.join(root, 'github', 'acme', 'site.git');
  const seed = path.join(root, 'seed');
  fs.mkdirSync(upstream, { recursive: true });
  g(upstream, 'init', '--bare', '--quiet');
  g(root, 'init', '--quiet', seed);
  fs.writeFileSync(path.join(seed, 'index.html'), '<h1>Hi</h1>\n');
  fs.mkdirSync(path.join(seed, 'test'));
  fs.writeFileSync(path.join(seed, 'test', 'site.test.js'), `${'// filler line\n'.repeat(5000)}const LIMIT = 981;\n`);
  g(seed, 'add', '.'); g(seed, 'commit', '--quiet', '-m', 'first');
  g(seed, 'push', '--quiet', upstream, 'main');
  g(upstream, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const cwd = path.join(root, 'office', 'IT');
  fs.mkdirSync(cwd, { recursive: true });
  const caps = { nick: { repos: [{ repo: 'acme/site', mode, seen: 'private' }] } };
  const told = [];
  const held = new GitHubHeldStore({ path: path.join(root, 'private', 'held.json'), tell: (to, subject, body) => told.push({ to, subject, body }), changed: () => {} });
  fs.mkdirSync(path.join(root, 'private'), { recursive: true });
  const lg = new LocalGit({
    home: () => path.join(root, 'home'),
    privateDir: () => path.join(root, 'private'),
    token: () => 'ghp_test_token',
    cap: (id) => caps[id] ?? { repos: [] },
    memberCwd: () => cwd,
    visibility: () => 'private',
    held,
    upstream: () => upstream
  });
  const clone = path.join(cwd, 'Code', 'acme', 'site');
  const bundle = path.join(cwd, 'Code', 'acme', `site${L.PUSH_BUNDLE_SUFFIX}`);
  /** The member's own work in its copy: a branch with one change, and its bundle. */
  const work = (branch, file, text, msg = 'Change') => {
    g(clone, 'checkout', '--quiet', '-B', branch, 'origin/HEAD');
    fs.mkdirSync(path.dirname(path.join(clone, file)), { recursive: true });
    fs.writeFileSync(path.join(clone, file), text);
    g(clone, 'add', '-A'); g(clone, 'commit', '--quiet', '-m', msg);
    g(clone, 'bundle', 'create', '--quiet', bundle, branch, '--not', 'origin/HEAD');
  };
  const remoteHead = (branch) => { try { return g(upstream, 'rev-parse', `refs/heads/${branch}`).trim(); } catch { return null; } };
  return { lg, held, told, caps, upstream, clone, bundle, work, remoteHead, root };
}

test('branch names: only plain agent/ names pass', () => {
  // Value: protects=a push can only land on an agent/ branch named in plain characters; fails_when=main, a refspec trick or an odd ref passes; why_new=adversarial review finding 10; seam=none
  for (const ok of ['agent/blog-link', 'agent/a/b_c.d', 'agent/x1']) assert.ok(L.isPlainAgentBranch(ok), ok);
  for (const bad of ['main', 'agent/', 'agent/../main', 'agent/a..b', 'agent/x.lock', 'agent/.hidden', 'agent/a b', 'agent/a@{1}', 'agent/*', 'agent/a:refs/heads/main', 'agent//x', 'refs/heads/agent/x', 'agent/x\n']) {
    assert.equal(L.isPlainAgentBranch(bad), false, JSON.stringify(bad));
  }
});

test('push rules follow the GitHub modes, and .github waits for the owner', () => {
  // Value: protects=a local push obeys the same Pull only / Pull and push / Push on approval rules as GitHub's write tools; fails_when=Pull only pushes, approval skips the owner, or a workflow change goes out unasked; why_new=github-local-git.md; seam=none
  const cap = (mode) => ({ repos: [{ repo: 'acme/site', mode, seen: 'private' }] });
  const one = [{ status: 'M', path: 'index.html', added: 1, deleted: 1 }];
  const wf = [{ status: 'M', path: '.github/workflows/ci.yml', added: 1, deleted: 0 }];
  assert.equal(L.decidePush(cap('pull'), 'acme/site', one, 'private').kind, 'refuse');
  assert.equal(L.decidePush(cap('push'), 'acme/site', one, 'private').kind, 'allow');
  assert.equal(L.decidePush(cap('approval'), 'acme/site', one, 'private').kind, 'hold');
  assert.equal(L.decidePush(cap('push'), 'acme/site', wf, 'private').kind, 'hold');
  assert.equal(L.decidePush(cap('push'), 'acme/other', one, 'private').kind, 'refuse');
  assert.equal(L.decidePush(cap('push'), 'acme/site', one, 'public').kind, 'refuse', 'a repo seen private that turned public waits for the owner');
  assert.equal(L.decidePush(cap('push'), 'acme/site', one, 'unknown').kind, 'refuse');
  assert.equal(L.decidePush(cap('push'), 'acme/site', [], 'private').kind, 'refuse');
  assert.deepEqual(L.pushFlags([...wf, { status: 'D', path: '.env', added: null, deleted: 2 }], '+const k = 1\n', 'public', true).sort(), ['delete', 'envfile', 'large', 'public', 'workflow']);
});

test('sync makes the app\'s copy and the member\'s working copy; a one line change to a big file pushes', gitOnly, async (t) => {
  // Value: protects=a member can change one number in a big file and push it (the 196 KB test file that blocked Nick); fails_when=sync makes no copy, the push needs the whole file, or the branch lands anywhere but agent/; why_new=owner 2026-11-26; seam=local repo stands in for GitHub
  const o = office(t);
  const s = await o.lg.sync('nick', { repo: 'acme/site' });
  assert.ok(s.ok, s.text);
  assert.ok(fs.existsSync(path.join(o.clone, 'test', 'site.test.js')));
  const big = fs.readFileSync(path.join(o.clone, 'test', 'site.test.js'), 'utf8');
  o.work('agent/word-limit', 'test/site.test.js', big.replace('981', '983'), 'Raise the home page word limit');
  const p = await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/word-limit' });
  assert.ok(p.ok, p.text);
  assert.match(p.text, /1 file changed/);
  assert.equal(o.remoteHead('agent/word-limit'), g(o.clone, 'rev-parse', 'HEAD').trim());
  assert.equal(o.remoteHead('main'), g(o.upstream, 'rev-parse', 'refs/heads/main').trim(), 'main untouched');
  assert.ok(!fs.readdirSync(path.join(o.root, 'private', 'git-held', 'incoming')).length, 'the bundle copy is gone');
});

test('Pull only, other repos and bad branches never push', gitOnly, async (t) => {
  // Value: protects=the modes and repo list hold for local pushes; fails_when=a Pull only member, an unlisted repo or main gets pushed; why_new=github-local-git.md; seam=local repo stands in for GitHub
  const o = office(t, 'pull');
  assert.ok((await o.lg.sync('nick', { repo: 'acme/site' })).ok, 'Pull only still gets a working copy');
  o.work('agent/x', 'index.html', 'changed\n');
  const p = await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' });
  assert.equal(p.ok, false); assert.match(p.text, /Pull only/);
  o.caps.nick.repos[0].mode = 'push';
  assert.match((await o.lg.push('nick', { repo: 'acme/site', branch: 'main' })).text, /agent\//);
  assert.match((await o.lg.push('nick', { repo: 'acme/other', branch: 'agent/x' })).text, /has not given you/);
  assert.match((await o.lg.sync('nick', { repo: 'acme/other' })).text, /has not given you/);
  assert.equal(o.remoteHead('agent/x'), null);
});

test('the bundle must hold only the named branch, and a link is never followed', { ...gitOnly, ...posixOnly('symlinks and a shell script') }, async (t) => {
  // Value: protects=main reads one plain file the member made, never a link to another file, and pushes only the branch named; fails_when=a bundle with main in it, or a symlink to another file, is accepted; why_new=adversarial review findings 3 and 10; seam=local repo stands in for GitHub
  const o = office(t);
  await o.lg.sync('nick', { repo: 'acme/site' });
  o.work('other', 'about.html', 'other\n');
  o.work('agent/x', 'index.html', 'changed\n');
  g(o.clone, 'bundle', 'create', '--quiet', o.bundle, 'agent/x', 'other', '--not', 'origin/HEAD');
  assert.match((await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' })).text, /only your branch/);
  fs.rmSync(o.bundle);
  const other = path.join(o.root, 'secret.bundle');
  fs.writeFileSync(other, 'x');
  fs.symlinkSync(other, o.bundle);
  assert.match((await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' })).text, /plain file/);
  assert.equal(o.remoteHead('agent/x'), null);
});

test('a push that is not a fast forward is refused; nothing is force pushed', gitOnly, async (t) => {
  // Value: protects=another push to the same branch is never overwritten; fails_when=the app force pushes over newer commits; why_new=adversarial review finding 5; seam=local repo stands in for GitHub
  const o = office(t);
  await o.lg.sync('nick', { repo: 'acme/site' });
  o.work('agent/x', 'index.html', 'one\n');
  assert.ok((await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' })).ok);
  const first = o.remoteHead('agent/x');
  o.work('agent/x', 'index.html', 'two\n'); // rebuilt from origin/HEAD: does not contain the first push
  const p = await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' });
  assert.equal(p.ok, false); assert.match(p.text, /has commits yours does not/);
  assert.equal(o.remoteHead('agent/x'), first);
});

test('Push on approval holds the push with its real diff; the approved commit goes once', gitOnly, async (t) => {
  // Value: protects=the owner sees the actual changed lines and only that commit goes out; fails_when=a held push goes out unapproved, the card lacks the diff, or a new commit rides on the old approval; why_new=github-local-git.md held push; seam=local repo stands in for GitHub
  const o = office(t, 'approval');
  await o.lg.sync('nick', { repo: 'acme/site' });
  o.work('agent/x', 'index.html', '<h1>Hello</h1>\n', 'Say hello');
  const first = await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' });
  assert.equal(first.ok, false); assert.match(first.text, /Held for the owner/);
  assert.equal(o.remoteHead('agent/x'), null);
  const card = o.held.waiting()[0];
  assert.equal(card.tool, 'git_push');
  assert.match(card.input.diff, /-<h1>Hi<\/h1>\n\+<h1>Hello<\/h1>/);
  assert.equal(card.says, 'Say hello');
  assert.deepEqual(card.files, ['index.html']);
  assert.ok(o.held.decide(card.id, 'approve'));
  assert.ok((await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' })).ok, 'the approved push goes');
  assert.equal(o.remoteHead('agent/x'), g(o.clone, 'rev-parse', 'HEAD').trim());
  // A newer commit needs its own approval.
  g(o.clone, 'commit', '--quiet', '--allow-empty', '-m', 'more');
  fs.writeFileSync(path.join(o.clone, 'about.html'), 'x\n'); g(o.clone, 'add', '-A'); g(o.clone, 'commit', '--quiet', '-m', 'About page');
  g(o.clone, 'bundle', 'create', '--quiet', o.bundle, 'agent/x', '--not', 'origin/HEAD');
  assert.match((await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' })).text, /Held for the owner/);
});

test('a .gitattributes diff driver in the repo never runs a program', { ...gitOnly, ...posixOnly('symlinks and a shell script') }, async (t) => {
  // Value: protects=repo content can't make the app run a program while it diffs a push; fails_when=an external diff or textconv named by .gitattributes runs; why_new=adversarial review finding 2; seam=local repo stands in for GitHub
  const o = office(t);
  await o.lg.sync('nick', { repo: 'acme/site' });
  const marker = path.join(o.root, 'ran');
  const evil = path.join(o.root, 'evil.sh');
  fs.writeFileSync(evil, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
  g(o.clone, 'checkout', '--quiet', '-B', 'agent/x', 'origin/HEAD');
  fs.writeFileSync(path.join(o.clone, '.gitattributes'), '*.html diff=evil\n');
  fs.writeFileSync(path.join(o.clone, 'index.html'), 'changed\n');
  g(o.clone, 'add', '-A'); g(o.clone, 'commit', '--quiet', '-m', 'attrs');
  g(o.clone, 'bundle', 'create', '--quiet', o.bundle, 'agent/x', '--not', 'origin/HEAD');
  // Even if the owner's own git config named that driver, the app ignores it.
  const prev = process.env.GIT_CONFIG_PARAMETERS;
  process.env.GIT_CONFIG_PARAMETERS = `'diff.evil.command=${evil}' 'diff.evil.textconv=${evil}'`;
  t.after(() => { if (prev === undefined) delete process.env.GIT_CONFIG_PARAMETERS; else process.env.GIT_CONFIG_PARAMETERS = prev; });
  assert.ok((await o.lg.push('nick', { repo: 'acme/site', branch: 'agent/x' })).ok);
  assert.equal(fs.existsSync(marker), false);
});

test('GitHub\'s errors come back in plain words with no address or token', () => {
  // Value: protects=a refusal tells the member what to do and never echoes a token-bearing address; fails_when=raw git output with the URL reaches the member; why_new=github-local-git.md errors; seam=none
  assert.match(_test.githubError('remote: Permission to acme/site.git denied to x.\nfatal: unable to access \'https://x-access-token@github.com/acme/site.git/\': The requested URL returned error: 403'), /refused the app's token/);
  assert.doesNotMatch(_test.githubError('fatal: something odd at https://x-access-token@github.com/acme/site.git'), /github\.com/);
});

test('a linked folder on the way to a member\'s copy or bundle is never followed', posixOnly('symlinks'), (t) => {
  // Value: protects=the app never clones into, or reads a bundle from, another member's folder through a link the member made in its own Code folder; fails_when=only the last path part is checked; why_new=/ship review 2026-11-26 finding 4; seam=none
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-git-links-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const nick = path.join(home, 'nick');
  const pam = path.join(home, 'pam');
  fs.mkdirSync(path.join(nick, 'Code'), { recursive: true });
  fs.mkdirSync(pam, { recursive: true });
  // Not there yet, or real folders: fine.
  assert.equal(_test.linkFree(nick, path.join(nick, 'Code', 'acme', 'site')), true);
  fs.mkdirSync(path.join(nick, 'Code', 'acme'));
  assert.equal(_test.linkFree(nick, path.join(nick, 'Code', 'acme', 'site.push.bundle')), true);
  // Code/acme made a link to another member's folder: refused.
  fs.rmSync(path.join(nick, 'Code', 'acme'), { recursive: true });
  fs.symlinkSync(pam, path.join(nick, 'Code', 'acme'));
  assert.equal(_test.linkFree(nick, path.join(nick, 'Code', 'acme', 'site')), false);
  assert.equal(_test.linkFree(nick, path.join(nick, 'Code', 'acme', 'site.push.bundle')), false);
  // Outside the member's folder: refused.
  assert.equal(_test.linkFree(nick, path.join(pam, 'site')), false);
});

test('each member\'s shell reads only its own repos\' mirrors, and no file tool opens them', () => {
  // Value: protects=a member's working copy can fetch offline, but never another repo's mirror, and nobody writes a mirror; fails_when=the mirror root stays readable, an outside path is reopened, or writes are allowed; why_new=github-local-git.md; seam=none
  const F = loadTs('src/shared/folderAccess.ts');
  const root = path.join(os.tmpdir(), 'home', 'git');
  const base = { sandbox: { denyWrite: [], denyRead: [], allowRead: [] }, deny: [], sandboxOnly: true };
  const p = F.withGitMirrorWall(base, root, [path.join(root, 'acme', 'site.git'), path.join(os.tmpdir(), 'elsewhere')]);
  assert.ok(p.sandbox.denyRead.includes(root));
  assert.ok(p.sandbox.denyWrite.includes(root));
  assert.deepEqual(p.sandbox.allowRead, [path.join(root, 'acme', 'site.git')], 'a path outside the mirror folder is never reopened');
  assert.equal(p.deny.length, 2);
  assert.equal(F.withGitMirrorWall(base, null, []), base);
});

test('md-git calls pass the connector gate as the app\'s own server; the broker routes them per member', { timeout: 10_000 }, async (t) => {
  // Value: protects=members can reach git_sync and git_push, only through the broker with their own token, and a resource call naming md-git is refused; fails_when=the gate refuses md-git tools, or the route answers without a member token; why_new=github-local-git.md; seam=fake handler
  const C = loadTs('src/shared/claudeConnectors.ts');
  assert.equal(C.mcpTarget({}, 'mcp__md-git__git_push', {}).kind, 'app');
  assert.equal(C.mcpTarget({}, 'ListMcpResourcesTool', { server: 'md-git' }).kind, 'app');
  const electron = require.resolve('electron');
  require.cache[electron] = require.cache[electron] || { id: electron, filename: electron, loaded: true, exports: {} };
  const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
  const calls = [];
  const broker = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined, git: async (agentId, op, body) => { calls.push({ agentId, op, body }); return { status: 200, body: { ok: true, text: 'done' } }; } });
  await broker.start();
  t.after(() => broker.stop());
  const nick = broker.grant('pty-n', [], 'nick');
  const http = require('node:http');
  const post = (route, headers) => new Promise((resolve) => {
    const req = http.request(new URL(route, broker.url()), { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.end('{"repo":"acme/site"}');
  });
  assert.equal((await post('/git/git_sync', { 'x-md-broker-token': nick })).status, 200);
  assert.deepEqual(calls, [{ agentId: 'nick', op: 'git_sync', body: { repo: 'acme/site' } }]);
  assert.equal((await post('/git/git_sync', {})).status, 401);
  const worker = broker.grant('pty-w', []);
  assert.equal((await post('/git/git_sync', { 'x-md-broker-token': worker })).status, 404, 'only team members');
});

test('the md-git server lists its two tools and passes a call to the broker, an error as isError', { timeout: 15_000 }, async (t) => {
  // Value: protects=members see git_sync and git_push, and a refused push reads as an error to the agent; fails_when=the tools are missing, the call does not reach /git/<tool>, or a refusal looks like success; why_new=github-local-git.md; seam=fake broker
  const http = require('node:http');
  const { spawn } = require('node:child_process');
  const seen = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { seen.push({ url: req.url, token: req.headers['x-md-broker-token'], body: JSON.parse(b) }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(req.url === '/git/git_push' ? { ok: false, text: 'You are Pull only in acme/site' } : { ok: true, text: 'ready' })); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'resources', 'md-git-mcp.cjs')], { env: { ...process.env, MD_BROKER_URL: `http://127.0.0.1:${srv.address().port}`, MD_BROKER_TOKEN: 'tok' } });
  t.after(() => child.kill());
  const answers = new Map();
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); answers.set(m.id, m); } });
  const ask = (id, method, params) => new Promise((resolve) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    const tick = setInterval(() => { if (answers.has(id)) { clearInterval(tick); resolve(answers.get(id)); } }, 10);
  });
  assert.deepEqual((await ask(1, 'tools/list', {})).result.tools.map((x) => x.name), ['git_sync', 'git_push']);
  const ok = (await ask(2, 'tools/call', { name: 'git_sync', arguments: { repo: 'acme/site' } })).result;
  assert.equal(ok.isError, false); assert.equal(ok.content[0].text, 'ready');
  const no = (await ask(3, 'tools/call', { name: 'git_push', arguments: { repo: 'acme/site', branch: 'agent/x' } })).result;
  assert.equal(no.isError, true); assert.match(no.content[0].text, /Pull only/);
  assert.deepEqual(seen.map((s) => [s.url, s.token]), [['/git/git_sync', 'tok'], ['/git/git_push', 'tok']]);
});
