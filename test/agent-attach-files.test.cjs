'use strict';

/**
 * A team member attaches files from its folder to an email
 * (docs/designs/agent-attach-files.md, owner 2026-11-16): read inside the
 * member's own folder walls, kept as copies no agent touches, sent as its
 * Sending allows, and the owner sees and may take off each file on the card.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const outgoing = loadTs('src/main/outgoingFiles.ts');
const { OutgoingFiles, OutgoingFileError, parseAttachPaths, sandboxProfile, bwrapArgs, readerLaunch, realWalls, readApart, NO_BWRAP, OUTGOING_FILES_MAX } = outgoing;
const { readOneFile } = loadTs('src/main/fileReader.ts');
const { handleMailRequest, sendTimeoutFor, MailError } = loadTs('src/main/mail.ts');
const { MailApprovals } = loadTs('src/main/mailApprovals.ts');
const { liveFileKeys, heldFileBytes, approvedFiles, standingProblem } = loadTs('src/shared/mailProposals.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const FIXTURE = path.resolve(__dirname, '..', 'test/fixtures/file-reader-run.cjs');
/** The reader under plain Node with no walls, as on Windows. */
const plainLaunch = { file: process.execPath, args: [FIXTURE] };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };

function office(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-attach-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const own = path.join(root, 'biz', 'Pam');
  const other = path.join(root, 'biz', 'Dwight');
  const granted = path.join(root, 'biz', 'Finance');
  const priv = path.join(root, 'app', 'private');
  for (const d of [own, other, granted, priv, path.join(own, 'interactiveBrokers')]) fs.mkdirSync(d, { recursive: true });
  return { root, own, other, granted, priv, outgoing: path.join(priv, 'outgoing') };
}

function files(o, extra = {}) {
  return new OutgoingFiles({
    root: () => o.outgoing,
    memberFolder: () => o.own,
    readFolders: () => [o.granted],
    check: (_id, p) => (p.startsWith(o.other) ? { deny: true, reason: 'That folder belongs to Dwight.' } : { deny: false }),
    launch: () => plainLaunch,
    ...extra
  });
}

test('the paths an agent gives: a list of strings, at most twenty, no blanks or repeats', () => {
  // Value: protects=a bad attach_files is refused in plain words before any file is opened; fails_when=a string, a number, a NUL or 21 paths get through; why_new=new field; seam=none
  assert.deepEqual(parseAttachPaths(undefined), { ok: true, paths: [] });
  assert.equal(parseAttachPaths('a.pdf').ok, false);
  assert.equal(parseAttachPaths([1]).ok, false);
  assert.equal(parseAttachPaths(['a\0b']).ok, false);
  assert.deepEqual(parseAttachPaths([' a.pdf ', 'a.pdf', '']), { ok: true, paths: ['a.pdf'] });
  const many = parseAttachPaths(Array.from({ length: OUTGOING_FILES_MAX + 1 }, (_, i) => `${i}.pdf`));
  assert.equal(many.ok, false);
  assert.match(many.error, /At most 20 files/);
});

test('the walls the reader starts in: closed folders first, open ones inside them after, and no network or writing', () => {
  // Value: protects=a member's own folder inside the closed business folder stays readable, and nothing else is; fails_when=allow comes before deny (the later rule wins), a quote breaks the profile, or Linux reads without bubblewrap; why_new=new reader; seam=pure builders
  const profile = sandboxProfile({ deny: ['/biz', '/a"b'], allow: ['/biz/Pam'] });
  assert.ok(profile.indexOf('(deny file-read*') < profile.indexOf('(allow file-read*'), 'the open folder must come after the closed one');
  assert.match(profile, /\(deny network\*\)/);
  assert.match(profile, /\(deny file-write\*\)/);
  assert.match(profile, /\(subpath "\/a\\"b"\)/);
  const args = bwrapArgs({ deny: ['/biz', '/hist'], allow: ['/biz/Pam', '/gone'] }, (p) => (p === '/hist' ? 'file' : p === '/gone' ? null : 'dir'));
  assert.deepEqual(args.slice(args.indexOf('--tmpfs')), ['--tmpfs', '/biz', '--ro-bind', '/dev/null', '/hist', '--ro-bind', '/biz/Pam', '/biz/Pam', '--']);
  assert.ok(args.includes('--unshare-net'));
  assert.deepEqual(readerLaunch({ platform: 'linux', runner: 'e', script: 's', walls: { deny: [], allow: [] }, bwrap: null }), { refused: NO_BWRAP });
  assert.equal(readerLaunch({ platform: 'darwin', runner: 'e', script: 's', walls: { deny: [], allow: [] } }).file, '/usr/bin/sandbox-exec');
  assert.deepEqual(readerLaunch({ platform: 'win32', runner: 'e', script: 's', walls: { deny: ['/x'], allow: [] } }).args, ['s']);
  assert.deepEqual(realWalls({ deny: ['/a'], allow: [] }, () => '/real/a').deny, ['/a', '/real/a']);
});

test('the reader takes one plain file with one name, never a link, never too big', (t) => {
  // Value: protects=a link or a second name for a file elsewhere never stands in for the member's file; fails_when=O_NOFOLLOW, the nlink check or the size cap is dropped; why_new=new reader; seam=real files
  const o = office(t);
  const file = path.join(o.own, 'a.pdf');
  fs.writeFileSync(file, PDF);
  assert.deepEqual(readOneFile(file, 1000), { ok: true, bytes: PDF });
  assert.deepEqual(readOneFile(file, 5), { ok: false, why: 'too-big' });
  assert.deepEqual(readOneFile(path.join(o.own, 'none.pdf'), 1000), { ok: false, why: 'missing' });
  assert.deepEqual(readOneFile(o.own, 1000), { ok: false, why: 'not-file' });
  if (process.platform !== 'win32') {
    fs.writeFileSync(path.join(o.priv, 'token.json'), '{"t":1}');
    fs.symlinkSync(path.join(o.priv, 'token.json'), path.join(o.own, 'link.json'));
    assert.deepEqual(readOneFile(path.join(o.own, 'link.json'), 1000), { ok: false, why: 'link' });
    fs.linkSync(path.join(o.priv, 'token.json'), path.join(o.own, 'hard.json'));
    assert.deepEqual(readOneFile(path.join(o.own, 'hard.json'), 1000), { ok: false, why: 'links' });
  }
});

test('on a Mac the system holds the walls: a link partway down the path reaches nothing closed', { skip: process.platform !== 'darwin' && 'macOS sandbox only' }, async (t) => {
  // Value: protects=the app's private folder (mail tokens) and another member's folder stay closed to a member's attach, whatever links it plants; fails_when=the reader runs outside the profile or the profile's order breaks; why_new=red team finding 1; seam=real sandbox-exec
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  fs.writeFileSync(path.join(o.priv, 'token.json'), '{"t":1}');
  fs.symlinkSync(o.priv, path.join(o.own, 'sub'));
  const walls = realWalls({ deny: [path.join(o.root, 'biz'), o.priv], allow: [o.own] }, real);
  const launch = readerLaunch({ platform: 'darwin', runner: process.execPath, script: FIXTURE, walls });
  const ok = await readApart(launch, path.join(o.own, 'a.pdf'), 1e6, 30_000);
  assert.ok(ok.ok, 'its own file reads');
  assert.deepEqual(await readApart(launch, path.join(o.own, 'sub', 'token.json'), 1e6, 30_000), { ok: false, why: 'denied' });
  fs.writeFileSync(path.join(o.other, 'b.pdf'), PDF);
  assert.deepEqual(await readApart(launch, path.join(o.other, 'b.pdf'), 1e6, 30_000), { ok: false, why: 'denied' });
});

test('reading for an email: own and granted folders only, the member check first, kinds from the bytes', async (t) => {
  // Value: protects=only files the member works from go out, each refusal names the file and why, and one refusal attaches nothing; fails_when=a path outside its folders, a denied one, or a program named .pdf is read; why_new=new tool field; seam=reader under plain Node
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'interactiveBrokers', 'ib_jan2026.pdf'), PDF);
  fs.writeFileSync(path.join(o.granted, 'books.csv'), 'a,b\n1,2\n');
  fs.writeFileSync(path.join(o.other, 'b.pdf'), PDF);
  fs.writeFileSync(path.join(o.root, 'outside.pdf'), PDF);
  fs.writeFileSync(path.join(o.own, 'run.pdf'), Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]));
  const f = files(o);
  const got = await f.read('pam', ['interactiveBrokers/ib_jan2026.pdf', path.join(o.granted, 'books.csv')]);
  assert.ok(got.ok, got.error);
  assert.deepEqual(got.files.map((x) => [x.name, x.kind, x.size, x.from]), [
    ['ib_jan2026.pdf', 'pdf', PDF.length, path.join(o.own, 'interactiveBrokers')],
    ['books.csv', 'csv', 8, o.granted]
  ]);
  const denied = await f.read('pam', [path.join(o.other, 'b.pdf')]);
  assert.match(denied.error, /belongs to Dwight/);
  const outside = await f.read('pam', ['interactiveBrokers/ib_jan2026.pdf', path.join(o.root, 'outside.pdf')]);
  assert.equal(outside.ok, false);
  assert.match(outside.error, /outside\.pdf.*Only files in your own folder/);
  assert.match((await f.read('pam', ['run.pdf'])).error, /not a kind of file the office sends/);
  assert.match((await f.read('pam', ['none.pdf'])).error, /was not found/);
  assert.match((await files(o, { launch: () => ({ refused: NO_BWRAP }) }).read('pam', ['interactiveBrokers/ib_jan2026.pdf'])).error, /bubblewrap/);
});

test('a slow file stops at its time limit, and files too big together are refused before any copy', async (t) => {
  // Value: protects=a cloud placeholder never freezes the call past md-mail's limit, and an email never grows past what mail carries; fails_when=the time limit or the total cap is lost; why_new=red team 8, 11; seam=a reader that hangs, real big files
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  const hang = { file: process.execPath, args: ['-e', 'setTimeout(() => {}, 20000)'] };
  const slow = await files(o, { launch: () => hang, readMs: 300 }).read('pam', ['a.pdf']);
  assert.match(slow.error, /took too long to read/);
  const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
  fs.writeFileSync(path.join(o.own, 'b1.pdf'), big);
  fs.writeFileSync(path.join(o.own, 'b2.pdf'), big);
  const both = await files(o).read('pam', ['b1.pdf', 'b2.pdf']);
  assert.match(both.error, /together, more than one email carries/);
  assert.equal(fs.existsSync(o.outgoing), false, 'nothing kept');
});

test('copies: kept where no agent reaches, checked against their hash, and swept once no email needs them', async (t) => {
  // Value: protects=what goes out is what was proposed, a changed or lost copy never goes, and copies never pile up; fails_when=load skips the hash, sweep deletes a set being filed or keeps a dead one; why_new=new store; seam=real files
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  fs.writeFileSync(path.join(o.own, 'b.txt'), 'hello\n');
  const f = files(o);
  const got = await f.read('pam', ['a.pdf', 'b.txt']);
  const set = f.keep(got.files);
  assert.match(set.key, /^[0-9a-f]{18}$/);
  assert.deepEqual(set.items.map((x) => x.name), ['a.pdf', 'b.txt']);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), 'changed on disk');
  assert.deepEqual(f.load(set).map((x) => [x.filename, x.contentType, x.content.equals(PDF) || x.content.toString()]), [['a.pdf', 'application/pdf', true], ['b.txt', 'text/plain; charset=utf-8', 'hello\n']]);
  assert.deepEqual(f.load(set, [1]).map((x) => x.filename), ['b.txt'], 'only those the owner left on it');
  f.sweep([]);
  assert.ok(fs.existsSync(path.join(o.outgoing, set.key)), 'a set still being filed stays');
  f.settled(set.key);
  fs.writeFileSync(path.join(o.outgoing, set.key, '1'), 'tampered');
  assert.throws(() => f.load(set), OutgoingFileError);
  f.sweep([set.key]);
  assert.ok(fs.existsSync(path.join(o.outgoing, set.key)));
  f.sweep([]);
  assert.equal(fs.existsSync(path.join(o.outgoing, set.key)), false);
  assert.throws(() => f.load(set), /no longer kept/);
  assert.throws(() => f.load({ key: '../../x', items: set.items }), /no longer kept/);
});

const PFILES = { key: 'abcdefabcdefabcdef', items: [{ name: 'a.pdf', size: 10, kind: 'pdf', sha256: 'x', from: '/o/IB' }, { name: 'b.pdf', size: 20, kind: 'pdf', sha256: 'y', from: '/o/IB' }] };

test('the approvals store: copies live while an email may still go, the owner may take files off, and the member hears which', (t) => {
  // Value: protects=every way out of waiting or approved frees the copies, and a file the owner removed never goes; fails_when=a state is missed, the kept list is read loosely, or the member is not told; why_new=red team 6; seam=real store
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-attach-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const live = [];
  const msgs = [];
  const s = new MailApprovals({ path: path.join(dir, 'p.json'), send: (m) => msgs.push(m), remember: () => {}, toast: () => {}, agentName: (id) => id, godId: () => 'god', changed: () => {}, filesLive: (k) => live.push(k) });
  const p = s.file({ agentId: 'pam', mailbox: 'ceo', to: 'shivam@acct.com', subject: 'IB statements', body: 'Attached.', files: PFILES });
  assert.deepEqual(live.at(-1), [PFILES.key]);
  assert.equal(s.heldFileBytes('pam'), 30);
  assert.deepEqual(s.decide(p.id, 'approve', { files: [5] }, ''), { ok: false, error: 'files not understood' });
  assert.deepEqual(s.decide(p.id, 'approve', { files: [1, 1] }, ''), { ok: false, error: 'files not understood' });
  assert.deepEqual(s.decide(p.id, 'approve', { files: [1] }, ''), { ok: true });
  const done = s.get(p.id);
  assert.deepEqual(done.approved.files, [1]);
  assert.deepEqual(approvedFiles(done), [1]);
  assert.match(msgs.at(-1).body, /took this file off the email, so it does not go: "a\.pdf"/);
  assert.deepEqual(live.at(-1), [PFILES.key], 'approved still holds its copies');
  s.markSending(p.id);
  assert.deepEqual(live.at(-1), [PFILES.key], 'and while it is being sent');
  s.markSent(p.id, '<m@x>');
  assert.deepEqual(live.at(-1), [], 'sent: freed');
  const q = s.file({ agentId: 'pam', mailbox: 'ceo', to: 'a@b.com', subject: 'Two', body: 'x', files: { ...PFILES, key: 'bbbbbbbbbbbbbbbbbb' } });
  s.cancel({ id: q.id }, 'grant ended');
  assert.deepEqual(live.at(-1), [], 'cancelled: freed');
  const r = s.file({ agentId: 'pam', mailbox: 'ceo', to: 'a@b.com', subject: 'Three', body: 'x', files: { ...PFILES, key: 'cccccccccccccccccc' } });
  s.decide(r.id, 'changes', {}, 'Add March');
  assert.deepEqual(liveFileKeys([s.get(r.id)]), [], 'changes asked: freed');
  assert.equal(heldFileBytes([s.get(r.id)], 'pam'), 0);
  assert.equal(approvedFiles({ files: PFILES, approved: { subject: 's', body: 'b' } }).length, 2, 'none taken off: all go');
});

const server = { host: 'h', port: 993, secure: true };
const box = (id) => ({ id, address: `${id}@x.com`, provider: 'gmail', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 });
const cfg = {
  mailboxes: [box('ceo'), box('support'), box('it'), box('shared'), box('sales')],
  agentCapabilities: {
    pam: { email: { enabled: true, mailboxes: ['ceo'], send: false, sending: 'approval' } },
    kelly: { email: { enabled: true, mailboxes: ['support'], send: true, sending: 'send' } },
    nick: { email: { enabled: true, mailboxes: ['it'], send: false } },
    dwight: { email: { enabled: true, mailboxes: ['sales'], send: true, sending: 'send' }, sendOnly: { mailbox: 'shared', sending: 'send' } },
    jim: { email: { enabled: true, mailboxes: ['shared'], send: true, sending: 'send' } }
  }
};

function route(t, o, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-attach-route-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = { sends: [], drafts: [], audit: [], messages: [] };
  const f = files(o, extra);
  const approvals = new MailApprovals({ path: path.join(dir, 'p.json'), send: (m) => out.messages.push(m), remember: () => {}, toast: () => {}, agentName: (id) => id, godId: () => 'god', changed: () => {}, filesLive: (k) => f.sweep(k) });
  const svc = {
    send: async (agentId, id, input) => { out.sends.push({ agentId, id, input }); return { sent: true, messageId: `<m${out.sends.length}@x.com>` }; },
    draft: async (id, input) => { out.drafts.push({ id, input }); return { saved: true, messageId: '<d@x.com>' }; }
  };
  const call = (agent, op, body) => handleMailRequest(svc, { getConfig: () => cfg, proposals: approvals, outgoing: f, audit: (e) => out.audit.push(e), present: () => true }, agent, op, body);
  return { call, approvals, out, f };
}

test('Send on approval: the files go on the card, and the copies the owner left on it go out, not the files on disk', async (t) => {
  // Value: protects=the owner approves exactly the files that leave; fails_when=the call's files are sent at send time, a removed file goes, or a changed copy goes; why_new=new flow; seam=fake mail service, real reader and store
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'interactiveBrokers', 'ib_jan2026.pdf'), PDF);
  fs.writeFileSync(path.join(o.own, 'interactiveBrokers', 'ib_feb2026.pdf'), Buffer.concat([PDF, Buffer.from('feb')]));
  const { call, approvals, out } = route(t, o);
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'shivam@acct.com', subject: 'IB statements', body: 'Attached.', attach_files: ['interactiveBrokers/ib_jan2026.pdf', 'interactiveBrokers/ib_feb2026.pdf'] });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const card = approvals.get(p.body.proposal);
  assert.deepEqual(card.files.items.map((x) => x.name), ['ib_jan2026.pdf', 'ib_feb2026.pdf']);
  assert.ok(fs.existsSync(path.join(o.outgoing, card.files.key, '0')));
  fs.writeFileSync(path.join(o.own, 'interactiveBrokers', 'ib_jan2026.pdf'), 'swapped after the card went up');
  approvals.decide(card.id, 'approve', { files: [0] }, '');
  const sent = await call('pam', 'send', { mailbox: 'ceo', proposal: card.id, attach_files: ['interactiveBrokers/other.pdf'] });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.deepEqual(out.sends[0].input.files.map((x) => [x.filename, x.content.equals(PDF)]), [['ib_jan2026.pdf', true]]);
  assert.equal(fs.existsSync(path.join(o.outgoing, card.files.key)), false, 'sent: copies gone');
  assert.deepEqual(out.audit.find((e) => e.kind === 'mail-sent-approved'), { kind: 'mail-sent-approved', agentId: 'pam', mailbox: 'ceo', proposal: card.id, files: 1, bytes: PDF.length });
  assert.ok(!JSON.stringify(out.audit).includes('ib_jan2026'), 'no file name in the office log');
});

test('an approved email whose copies are gone is withdrawn, never sent without them', async (t) => {
  // Value: protects=an email the owner approved with files never leaves bare; fails_when=a missing copy is skipped and the email sent; why_new=new flow; seam=fake mail service
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  const { call, approvals, out } = route(t, o);
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'shivam@acct.com', subject: 'One', body: 'x', attach_files: ['a.pdf'] });
  const card = approvals.get(p.body.proposal);
  approvals.decide(card.id, 'approve', {}, '');
  fs.rmSync(path.join(o.outgoing, card.files.key), { recursive: true });
  const sent = await call('pam', 'send', { mailbox: 'ceo', proposal: card.id });
  assert.equal(sent.status, 409);
  assert.match(sent.body.error, /no longer kept.*propose it again with the files/);
  assert.equal(out.sends.length, 0);
  assert.equal(approvals.get(card.id).state, 'cancelled');
});

test('Can send sends the files at once, Draft only drafts them, and neither grants nor standing approvals carry them', async (t) => {
  // Value: protects=the sending setting decides as for any email (owner decision 1, 2026-11-16), and files never cross into a mailbox another member reads; fails_when=Can send is forced onto a card, a grant or standing send takes files; why_new=new field; seam=fake mail service
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  const { call, out } = route(t, o);
  const sent = await call('kelly', 'send', { mailbox: 'support', to: 'c@client.com', subject: 'Invoice', body: 'Attached.', attach_files: ['a.pdf'] });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.deepEqual(out.sends[0].input.files.map((x) => x.filename), ['a.pdf']);
  assert.deepEqual(out.audit.find((e) => e.kind === 'mail-sent-files'), { kind: 'mail-sent-files', agentId: 'kelly', mailbox: 'support', messageId: '<m1@x.com>', files: 1, bytes: PDF.length });
  const draft = await call('nick', 'draft', { mailbox: 'it', to: 'c@client.com', subject: 'Draft', body: 'x', attach_files: ['a.pdf'] });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  assert.deepEqual(out.drafts[0].input.files.map((x) => x.filename), ['a.pdf']);
  const grant = await call('dwight', 'send', { mailbox: 'shared', to: 'c@client.com', subject: 'x', body: 'x', attach_files: ['a.pdf'] });
  assert.equal(grant.status, 403, JSON.stringify(grant.body));
  assert.match(grant.body.error, /send only from this mailbox/);
  assert.equal(standingProblem({ id: 's', agentId: 'pam', mailbox: 'ceo', kind: 'k' }, 'pam', 'ceo', { files: ['a.pdf'] }), 'A standing approval never covers forwards or attachments. Use propose instead.');
  const refused = await call('kelly', 'send', { mailbox: 'support', to: 'c@client.com', subject: 'x', body: 'x', attach_files: ['../../outside.pdf'] });
  assert.equal(refused.status, 400);
  assert.equal(out.sends.length, 1, 'a refused file sends nothing');
});

test('one member holds only so many waiting copies', async (t) => {
  // Value: protects=no member can fill the disk with waiting cards; fails_when=the cap is not checked before copying; why_new=red team 6; seam=store stub
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  const { call, approvals } = route(t, o);
  approvals.heldFileBytes = () => 60 * 1024 * 1024;
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'a@b.com', subject: 'x', body: 'x', attach_files: ['a.pdf'] });
  assert.equal(p.status, 409);
  assert.match(p.body.error, /more room than the app keeps for you/);
  assert.equal(fs.existsSync(o.outgoing) ? fs.readdirSync(o.outgoing).length : 0, 0);
});

test('a send with files waits longer, up to just inside md-mail\'s limit', () => {
  // Value: protects=a large email on a slow line is not cut off mid send; fails_when=the timeout ignores the files or passes md-mail's three minutes; why_new=red team 9; seam=pure
  assert.equal(sendTimeoutFor({}), 60_000);
  assert.ok(sendTimeoutFor({ files: [{ content: Buffer.alloc(2 * 1024 * 1024) }] }) > 60_000);
  assert.equal(sendTimeoutFor({ files: [{ content: Buffer.alloc(18 * 1024 * 1024) }] }), 120_000);
});

test('wiring: walls kept at spawn, the reader built, copies swept, the tool and the rules say it', () => {
  // Value: protects=the pieces this feature needs stay connected in main, the tool and the agents' rules; fails_when=a refactor drops the walls capture, the sweep, the bundle entry or the rule text; why_new=new feature; seam=source pins
  const index = read('src/main/index.ts');
  assert.match(index, /folderPolicy: keepWalls\(opts\.hive!\.id, memberPolicy\(\)\)/);
  assert.match(index, /outgoing: outgoingFiles/);
  assert.match(index, /filesLive: \(keys\) => outgoingFiles\.sweep\(keys\)/);
  assert.match(index, /if \(live\) outgoingFiles\.sweep\(live\);/);
  assert.match(read('electron.vite.config.ts'), /fileReaderCli: resolve\(__dirname, 'src\/main\/fileReaderCli\.ts'\)/);
  // The reader's command runs the same readerMain the tests run under Node.
  assert.match(read('src/main/fileReaderCli.ts'), /readerMain\(process\.argv\.slice\(2\)\)/);
  assert.match(read('resources/md-mail-mcp.cjs'), /attach_files: \{ type: 'array'/);
  const hive = read('src/main/hive.ts');
  assert.match(hive, /attach it with attach_files on draft, propose or send; never ask the owner to attach it and send the email themselves/);
  assert.match(hive, /Never ask the owner to attach a file from a folder and send an email themselves either/);
});

test('the card: files listed with their folder, opened from the kept copy, and only a removal is sent back', () => {
  // Value: protects=the owner sees each file and where it came from, opens the copy not the disk file, and an untouched card approves every file; fails_when=the card drops the list, opens by path, or always sends a kept list; why_new=new card section; seam=source pins
  const card = read('src/renderer/src/components/MailProposalCards.tsx');
  assert.match(card, /t\('askMe\.mailFiles', \{ count: kept\.length, from: isolate\(keptFolders\.join\(', '\)\) \}\)/);
  assert.match(card, /window\.cth\.openMailProposalFile\(p\.id, i\)/);
  assert.match(card, /const left = files\.length && kept\.length < files\.length \? \{ files: kept \} : \{\};/);
  assert.match(card, /t\('askMe\.mailFilesCount', \{ count: kept\.length \}\)/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  assert.match(card, /onClick=\{\(\) => setKept\(files\.map\(\(_, i\) => i\)\)\}/, 'a file taken off can be put back');
  for (const k of ['mailFiles', 'mailFilesCount', 'mailFilesTip', 'mailFilesAll', 'mailFileRemove', 'mailFileGone', 'mailFilesPutBack']) {
    assert.ok(en.askMe[k], k);
    assert.doesNotMatch(en.askMe[k], /[–—]| - /, 'no dashes in what the owner reads');
  }
  const index = read('src/main/index.ts');
  assert.match(index, /ipcMain\.handle\('mailProposals:openFile'/);
  assert.match(index, /p\.state === 'waiting' \? outgoingFiles\.copyPath\(p\.files, index\)/);
});

test('review fixes: an unreadable store sweeps nothing, a card stuck sending holds no room, drafts and Sent copies wait as a send does', (t) => {
  // Value: protects=a damaged approvals file never wipes the owner's approved copies, an uncertain send never blocks the member's next files, and big drafts are not cut off at 30 s; fails_when=liveFileKeys reads an unreadable store as empty, sending counts in the cap, or the appends keep the default limit; why_new=review findings 1, 2, 4; seam=real store, source pins
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-attach-fix-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'p.json');
  const s = new MailApprovals({ path: file, send: () => {}, remember: () => {}, toast: () => {}, agentName: (id) => id, godId: () => 'god', changed: () => {} });
  const p = s.file({ agentId: 'pam', mailbox: 'ceo', to: 'a@b.com', subject: 'x', body: 'x', files: PFILES });
  assert.deepEqual(s.liveFileKeys(), [PFILES.key]);
  s.decide(p.id, 'approve', {}, '');
  s.markSending(p.id);
  assert.equal(s.heldFileBytes('pam'), 0, 'stuck sending: copies kept, not counted');
  assert.deepEqual(s.liveFileKeys(), [PFILES.key]);
  fs.writeFileSync(file, '{ not json');
  assert.equal(s.liveFileKeys(), null);
  assert.match(read('src/main/index.ts'), /const live = mailApprovals\.liveFileKeys\(\);\n\s+if \(live\) outgoingFiles\.sweep\(live\);/);
  const mail = read('src/main/mail.ts');
  assert.match(mail, /'Saving the draft', true, sendTimeoutFor\(input\)\)/);
  assert.match(mail, /'Saving to Sent', true, sentLimit\)/);
  // The Sent copy gets only what is left of the send's own time (review, pass 1).
  assert.match(mail, /const sentLimit = Math\.max\(5_000, Math\.min\(sendTimeoutFor\(input\), SEND_TIMEOUT_MAX_MS - \(Date\.now\(\) - sendStarted\)\)\);/);
  assert.ok(outgoing.OUTGOING_READ_BUDGET_MS + sendTimeoutFor({ files: [{ content: Buffer.alloc(18 * 1024 * 1024) }] }) < 180_000, 'read and send fit inside md-mail\'s three minutes');
});

test('teammate hand-off: files from the sender\'s folder follow the message once copied, and a refusal reaches both', async (t) => {
  // Value: protects=a file one member keeps reaches the member who sends the email, without either opening the other's folder (owner, 2026-11-16, option A); fails_when=a list of files is refused, the message waits on the copy, the teammate never hears where the files are, or a refusal is silent; why_new=new hand-off kind; seam=the handover is a stand in
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-teammate-files-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  let release;
  hive.onFileHandover((from, to, file) => {
    if (file === '/bad') return { count: 1, coming: Promise.resolve({ error: 'Not sent: "/bad" was not found.' }) };
    return { count: file.length, coming: new Promise((r) => { release = () => r({ paths: file.map((f) => `/office/Admin/From teammates/${path.basename(f)}`) }); }) };
  });
  const root = hive.root();
  const send = (name, m) => fs.writeFileSync(path.join(root, 'agents', 'oscar', 'outbox', name), JSON.stringify({ to: 'pam', act: 'inform', subject: 'IB statements', body: 'Here they are.', ...m }));
  const inbox = (who) => fs.readdirSync(path.join(root, 'agents', who, 'inbox')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(root, 'agents', who, 'inbox', f), 'utf8')));

  send('a.json', { file: ['/office/Finance/2026/ib/ib_jan2026.pdf', '/office/Finance/2026/ib/ib_feb2026.pdf'] });
  hive.routeOnce();
  const got = inbox('pam').find((m) => m.subject === 'IB statements');
  assert.match(got.body, /\[2 files from Oscar's folder come with this message\. The app copies them into your folder and tells you where in a moment\.\]/);
  assert.equal(inbox('pam').some((m) => m.subject === 'Files from Oscar'), false, 'not before the copy is done');
  release();
  await new Promise((r) => setTimeout(r, 20));
  const files = inbox('pam').find((m) => m.subject === 'Files from Oscar');
  assert.match(files.body, /\/office\/Admin\/From teammates\/ib_jan2026\.pdf\n\/office\/Admin\/From teammates\/ib_feb2026\.pdf/);
  assert.match(files.body, /attach them to an email with attach_files/);
  assert.equal(files.in_reply_to, got.id);

  send('b.json', { subject: 'Second', file: '/bad' });
  hive.routeOnce();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(inbox('oscar').find((m) => m.subject === 'File not delivered').body, /its files did not: Not sent: "\/bad" was not found\./);
  assert.match(inbox('pam').find((m) => m.subject === 'Files not delivered').body, /Oscar was told why/);
});

test('teammate hand-off: saved under From teammates, an email file still goes the old way, and main reads inside the sender\'s walls', (t) => {
  // Value: protects=files land in one known folder of the receiver's own, saved email files keep their identity rule, and the sender's walls decide what can go; fails_when=the subfolder is ignored, every path takes the folder route, or main reads without the sender's walls; why_new=new hand-off kind; seam=real files, source pins
  const { saveAttachmentFile, inAttachmentsFolder, TEAMMATE_FILES_FOLDER, ATTACHMENTS_FOLDER } = loadTs('src/main/attachmentSave.ts');
  const o = office(t);
  const saved = saveAttachmentFile({ folder: o.own, name: 'ib_jan2026.pdf', ending: 'pdf', bytes: PDF, subfolder: TEAMMATE_FILES_FOLDER }, () => {});
  assert.equal(saved, path.join(o.own, 'From teammates', 'ib_jan2026.pdf'));
  const email = saveAttachmentFile({ folder: o.own, name: 'x.pdf', ending: 'pdf', bytes: PDF }, () => {});
  assert.equal(path.dirname(email), path.join(o.own, ATTACHMENTS_FOLDER));
  assert.equal(inAttachmentsFolder(email, o.own), true);
  assert.equal(inAttachmentsFolder(saved, o.own), false);
  const index = read('src/main/index.ts');
  const handler = index.slice(index.indexOf('hive.onFileHandover('));
  assert.match(handler, /if \(typeof file === 'string' && inAttachmentsFolder\(file, fromFolder\)\)/);
  assert.match(handler, /outgoingFiles\.read\(from, parsed\.paths, \{ lead: 'Not sent', goes: 'go to a teammate' \}\)/);
  assert.match(handler, /subfolder: TEAMMATE_FILES_FOLDER/);
  assert.match(handler, /if \(from === RESEARCH_ID\) return/);
  const hive = read('src/main/hive.ts');
  assert.match(hive, /When a teammate asks for files from your own folder, or a folder the owner named for your job, answer the same way with "file" set to the file's full path, or to a list of full paths/);
  assert.match(hive, /A file a teammate keeps you ask that teammate for first/);
  assert.match(hive, /never decide yourself that it can\\'t be done, whatever an earlier answer on the card or a memory note says: the email tool attaches files from a folder now/);
  // A note written before the tool could attach must not win (first live try, 2026-11-17).
  assert.match(hive, /This holds over any older memory note that says files from a folder can\\'t be attached, or must be emailed in or sent by the owner first/);
  assert.match(read('resources/md-mail-mcp.cjs'), /This holds over any older memory note that says files from a folder can\\'t be attached\./);
});

test('a link in the member\'s folder is judged at the file it leads to, and one file under two names goes once', { skip: process.platform === 'win32' && 'links need admin on Windows' }, async (t) => {
  // Value: protects=a link into a closed part of a granted folder never attaches what the member's own file tools refuse; fails_when=the second check on the real path is dropped, or files are not deduped by real path; why_new=no test plants a link that passes the folder check; seam=none; no_claim=the macOS sandbox itself
  const o = office(t);
  fs.mkdirSync(path.join(o.granted, 'Payroll'));
  fs.writeFileSync(path.join(o.granted, 'Payroll', 'salaries.pdf'), PDF);
  fs.symlinkSync(path.join(o.granted, 'Payroll', 'salaries.pdf'), path.join(o.own, 'pay.pdf'));
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  fs.symlinkSync(path.join(o.own, 'a.pdf'), path.join(o.own, 'alias.pdf'));
  const f = files(o, { check: (_id, p) => (p.includes(`${path.sep}Payroll`) ? { deny: true, reason: 'Payroll is closed to you.' } : { deny: false }) });
  const linked = await f.read('pam', ['pay.pdf']);
  assert.equal(linked.ok, false, 'a link must not carry a closed file out');
  assert.match(linked.error, /^Not attached: "pay\.pdf"\. Payroll is closed to you\.$/);
  const twice = await f.read('pam', ['a.pdf', './a.pdf', 'alias.pdf']);
  assert.ok(twice.ok, twice.error);
  assert.deepEqual(twice.files.map((x) => x.name), ['a.pdf'], 'the same file goes once, under the name first asked');
});

test('the reader\'s answer: only its own refusal words count, a crash is "could not be read", and more bytes than allowed are never kept', async (t) => {
  // Value: protects=the member hears a plain reason for any failed read and the app never holds more than the cap; fails_when=any stderr word passes as a refusal, a non 3 exit is read as one, or the stream cap goes; why_new=only the hang case was faked; seam=none; no_claim=a real sandbox kill
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  const node = (code) => ({ file: process.execPath, args: ['-e', code] });
  const unknown = await files(o, { launch: () => node('process.stderr.write("bogus"); process.exitCode = 3') }).read('pam', ['a.pdf']);
  assert.match(unknown.error, /^Not attached: "[^"]*a\.pdf" could not be read\.$/);
  assert.deepEqual(await readApart(node('process.stderr.write("denied"); process.exitCode = 1'), path.join(o.own, 'a.pdf'), 1000, 10_000), { ok: false, why: 'failed' }, 'only exit 3 is a refusal');
  assert.deepEqual(await readApart(node('process.stderr.write("link"); process.exitCode = 3'), path.join(o.own, 'a.pdf'), 1000, 10_000), { ok: false, why: 'link' });
  const flood = await readApart(node('process.stdout.write(Buffer.alloc(5000))'), path.join(o.own, 'a.pdf'), 1000, 10_000);
  assert.deepEqual(flood, { ok: false, why: 'too-big' });
});

test('every file of one email is read inside one time budget, however long each may take alone', async (t) => {
  // Value: protects=reading four slow cloud files never outlasts the budget that keeps the call inside md-mail's three minutes; fails_when=each file gets its own full limit, or a file past the deadline is still started; why_new=only one file with readMs was tested; seam=none; no_claim=real cloud downloads
  const o = office(t);
  for (const n of ['a', 'b', 'c', 'd']) fs.writeFileSync(path.join(o.own, `${n}.pdf`), PDF);
  const hang = { file: process.execPath, args: ['-e', 'setTimeout(() => {}, 20000)'] };
  const started = Date.now();
  const got = await files(o, { launch: () => hang, readMs: 20_000, budgetMs: 400 }).read('pam', ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']);
  assert.match(got.error, /^Not attached: "[^"]*a\.pdf" took too long to read/);
  // gstack-timing-ok: the bound (8 s) is 20x the budget (400 ms) and far under one file's own limit (20 s), so only the regression it targets can cross it.
  assert.ok(Date.now() - started < 8_000, `stopped at the budget, not each file's own limit: ${Date.now() - started} ms`);
});

test('a standing approval send with files is refused at the route, before any file is read or sent', async (t) => {
  // Value: protects=files never leave under a standing approval, only on the owner's card; fails_when=the route stops passing attach_files to standingProblem; why_new=standingProblem was only tested alone, never through the route; seam=store stub for getStanding; no_claim=the fit check
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  let reads = 0;
  const { call, approvals, out } = route(t, o, { launch: () => { reads++; return plainLaunch; } });
  approvals.getStanding = (id) => (id === 'st_1' ? { id: 'st_1', agentId: 'pam', mailbox: 'ceo', kind: 'monthly statements to the bookkeeper', createdAt: 1 } : undefined);
  const r = await call('pam', 'send', { mailbox: 'ceo', standing: 'st_1', to: 'shivam@acct.com', subject: 'IB statements', body: 'Attached.', attach_files: ['a.pdf'] });
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.error, 'A standing approval never covers forwards or attachments. Use propose instead.');
  assert.equal(out.sends.length, 0);
  assert.equal(reads, 0, 'no file is read for it');
  assert.equal(approvals.read().length, 0, 'nothing goes on the card');
});

test('a proposal that can\'t be kept or filed leaves no copies and no card', async (t) => {
  // Value: protects=a failed propose tells the member why and leaves no stray copy of its files; fails_when=a missing private folder throws past the route, or a failed filing keeps the copies; why_new=only the room cap failure was tested; seam=store stub for file; no_claim=a disk full mid write
  const o = office(t);
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  const email = { mailbox: 'ceo', to: 'a@b.com', subject: 'x', body: 'x', attach_files: ['a.pdf'] };
  const noRoot = route(t, o, { root: () => undefined });
  const r = await noRoot.call('pam', 'propose', email);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.match(r.body.error, /no private folder to keep the files in, so nothing was attached/);
  assert.equal(noRoot.approvals.read().length, 0);
  const failing = route(t, o);
  failing.approvals.file = () => { throw new Error('store write failed'); };
  const f2 = await failing.call('pam', 'propose', email);
  assert.notEqual(f2.status, 200);
  assert.deepEqual(fs.existsSync(o.outgoing) ? fs.readdirSync(o.outgoing) : [], [], 'the copies go with the failed filing');
});


test('Linux readers get their own process space, so a fresh /proc mounts and no other process root is reachable', () => {
  // Value: protects=bubblewrap reads work unprivileged and /proc/<pid>/root never leads past the hidden folders; fails_when=--unshare-pid is dropped; why_new=review pass 1 (security); seam=none; no_claim=a real bubblewrap run (Linux only)
  const args = bwrapArgs({ deny: [], allow: [] }, () => null);
  assert.ok(args.indexOf('--unshare-pid') > -1 && args.indexOf('--unshare-pid') < args.indexOf('--'), 'before the command');
  assert.ok(args.indexOf('--proc') > -1);
});

test('reader processes are limited for the whole app, and reading stops once the email\'s bytes are spent', async (t) => {
  // Value: protects=many attach calls or hand-offs never run more than three readers at once, and one call never reads far past one email's worth; fails_when=the shared slot or the running total goes; why_new=review pass 1 (red team); seam=none; no_claim=memory use measured in the packaged app
  const o = office(t);
  for (const n of ['a', 'b', 'c', 'd', 'e', 'f']) fs.writeFileSync(path.join(o.own, `${n}.pdf`), PDF);
  const log = path.join(o.root, 'readers.log');
  const code = `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},'+');setTimeout(()=>{fs.appendFileSync(${JSON.stringify(log)},'-');process.stderr.write('missing');process.exitCode=3},250)`;
  const f = files(o, { launch: () => ({ file: process.execPath, args: ['-e', code] }) });
  await Promise.all([f.read('pam', ['a.pdf', 'b.pdf', 'c.pdf']), f.read('pam', ['d.pdf', 'e.pdf', 'f.pdf'])]);
  let now = 0;
  let most = 0;
  for (const ch of fs.readFileSync(log, 'utf8')) { now += ch === '+' ? 1 : -1; most = Math.max(most, now); }
  assert.equal(most, 3, 'six files from two calls, at most three readers at once');
  const big = Buffer.concat([PDF, Buffer.alloc(7 * 1024 * 1024)]);
  for (const n of ['g', 'h', 'i', 'j']) fs.writeFileSync(path.join(o.own, `${n}.pdf`), big);
  const over = await files(o).read('pam', ['g.pdf', 'h.pdf', 'i.pdf', 'j.pdf']);
  assert.equal(over.ok, false);
  assert.match(over.error, /together, more than one email carries/);
});

function heldRoute(t, o) {
  // A mail service whose send can be held open, fail once, or be stopped by
  // the access check the route passes in, as the real one is.
  const r = route(t, o);
  const ctl = { hold: null, failOnce: false, sends: [] };
  const svc = {
    send: async (agentId, id, input, beforeSmtp) => {
      if (ctl.hold) await ctl.hold;
      if (ctl.failOnce) { ctl.failOnce = false; throw new MailError('network', 'Not sent. The line dropped before the server.'); }
      const stop = beforeSmtp?.();
      if (stop) throw new MailError('refused', `Not sent. ${stop}`);
      ctl.sends.push({ input });
      return { sent: true, messageId: `<h${ctl.sends.length}@x.com>` };
    },
    draft: async () => ({ saved: true })
  };
  const call = (agent, op, body) => handleMailRequest(svc, { getConfig: () => cfg, proposals: r.approvals, outgoing: r.f, audit: () => {}, present: () => true }, agent, op, body);
  return { ...r, call, ctl };
}

async function filedCard(call, approvals, o, subject = 'Statements') {
  fs.writeFileSync(path.join(o.own, 'a.pdf'), PDF);
  fs.writeFileSync(path.join(o.own, 'b.pdf'), Buffer.concat([PDF, Buffer.from('b')]));
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'shivam@acct.com', subject, body: 'Attached.', attach_files: ['a.pdf', 'b.pdf'] });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  return approvals.get(p.body.proposal);
}

const copies = (o) => (fs.existsSync(o.outgoing) ? fs.readdirSync(o.outgoing) : []);

test('a card with files: declined, replaced or handed back, its copies go; the new card keeps its own', async (t) => {
  // Value: protects=copies live only while their email may still go, through every way a waiting card ends; fails_when=a decline, a re-propose or a Can send hand back leaves its copies; why_new=state cells files x decline/replace/handback had no test; seam=none; no_claim=none beyond protects
  const o = office(t);
  const { call, approvals } = heldRoute(t, o);
  const one = await filedCard(call, approvals, o);
  approvals.decide(one.id, 'decline', {}, '');
  assert.deepEqual(copies(o), [], 'declined: copies gone');
  const two = await filedCard(call, approvals, o, 'Again');
  const three = await filedCard(call, approvals, o, 'Again');
  assert.equal(three.replaces, two.id);
  assert.deepEqual(copies(o), [three.files.key], 'replaced: only the new card keeps copies');
  approvals.sendingChanged('pam', 'ceo', 'ceo@x.com', 'send');
  assert.equal(approvals.get(three.id).state, 'cancelled');
  assert.deepEqual(copies(o), [], 'handed back: copies gone');
});

test('a card with files: every file taken off sends the email bare and says so; a failed send keeps the copies for the retry', async (t) => {
  // Value: protects=an email the owner stripped of files goes with none, and a send that failed sends the very same copies on retry; fails_when=approve with [] still attaches, or a failed send frees the copies; why_new=state cells files x approve-none/send-fail had no test; seam=none; no_claim=none beyond protects
  const o = office(t);
  const { call, approvals, ctl, out } = heldRoute(t, o);
  const bare = await filedCard(call, approvals, o);
  approvals.decide(bare.id, 'approve', { files: [] }, '');
  assert.match(out.messages.at(-1).body, /took these files off the email, so they do not go: "a\.pdf", "b\.pdf"/);
  const sent = await call('pam', 'send', { mailbox: 'ceo', proposal: bare.id });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(ctl.sends.at(-1).input.files?.length ?? 0, 0, 'no files go');
  const card = await filedCard(call, approvals, o, 'Retry');
  approvals.decide(card.id, 'approve', {}, '');
  ctl.failOnce = true;
  const failed = await call('pam', 'send', { mailbox: 'ceo', proposal: card.id });
  assert.notEqual(failed.status, 200);
  assert.equal(approvals.get(card.id).state, 'approved', 'back to approved after a failure that never reached the server');
  assert.deepEqual(copies(o), [card.files.key], 'copies kept for the retry');
  const retry = await call('pam', 'send', { mailbox: 'ceo', proposal: card.id });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.deepEqual(ctl.sends.at(-1).input.files.map((x) => [x.filename, x.content.equals(PDF) || 'b']), [['a.pdf', true], ['b.pdf', 'b']]);
  assert.deepEqual(copies(o), [], 'sent: copies gone');
});

test('a card with files withdrawn while it is being sent never reaches the server, and its copies go', async (t) => {
  // Value: protects=a withdraw during the send stops it before the server and frees the copies; fails_when=the late access check is skipped or a cancelled sending card keeps its copies; why_new=state cell files x cancel-sending had no test; seam=held fake send; no_claim=a real SMTP server
  const o = office(t);
  const { call, approvals, ctl } = heldRoute(t, o);
  const card = await filedCard(call, approvals, o);
  approvals.decide(card.id, 'approve', {}, '');
  let open;
  ctl.hold = new Promise((r) => { open = r; });
  const sending = call('pam', 'send', { mailbox: 'ceo', proposal: card.id });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(approvals.get(card.id).state, 'sending');
  approvals.cancel({ id: card.id }, 'The owner withdrew it.');
  assert.deepEqual(copies(o), [], 'withdrawn: copies gone at once');
  open();
  const res = await sending;
  assert.notEqual(res.status, 200);
  assert.equal(ctl.sends.length, 0, 'nothing reached the server');
});

test('a kept copy is found only by a file the card has', (t) => {
  // Value: protects=Open on a card names only its own copies, never a path outside them; fails_when=copyPath accepts an index past the list or a bad key; why_new=state cell files x open-file had only a source pin; seam=none; no_claim=the IPC's waiting-only check, pinned in the wiring test
  const o = office(t);
  const f = files(o);
  const set = { key: 'aaaaaaaaaaaaaaaaaa', items: [{ name: 'a.pdf', size: 1, kind: 'pdf', sha256: 'x', from: o.own }] };
  assert.equal(f.copyPath(set, 0), path.join(o.outgoing, set.key, '0'));
  assert.equal(f.copyPath(set, 1), null);
  assert.equal(f.copyPath({ ...set, key: '../x' }, 0), null);
});

test('regression: the reader limit holds when a call has more files than readers and another call waits', async (t) => {
  // Value: protects=never more than three readers hold a slot at once, even when a worker loops back for its next file while another call waits; fails_when=a releasing worker takes a slot back ahead of the woken waiter; why_new=review pass 2 (queue jump; the 3+3 case cannot loop); seam=none (counts slots held through the instance's own slot method); no_claim=none beyond protects
  const o = office(t);
  const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  for (const n of names) fs.writeFileSync(path.join(o.own, `${n}.pdf`), PDF);
  const f = files(o, { launch: () => ({ file: process.execPath, args: ['-e', 'setTimeout(()=>{process.stderr.write("missing");process.exitCode=3},100)'] }) });
  let held = 0;
  let most = 0;
  const slot = f.readerSlot.bind(f);
  f.readerSlot = async () => {
    const release = await slot();
    most = Math.max(most, ++held);
    return () => { held--; release(); };
  };
  await Promise.all([f.read('pam', names.slice(0, 6).map((n) => `${n}.pdf`)), f.read('pam', names.slice(6).map((n) => `${n}.pdf`))]);
  assert.ok(most <= 3, `at most three readers at once, saw ${most}`);
});

test('regression: a hand-off that fails partway removes only the copies it made, never one a teammate already had', (t) => {
  // Value: protects=a failed hand-off never deletes a file an earlier hand-off delivered; fails_when=the rollback removes a reused identical copy; why_new=review pass 2 (data loss, both readers); seam=none; no_claim=the hive messages, covered above
  const { saveFilesAllOrNone, TEAMMATE_FILES_FOLDER, AttachmentSaveError } = loadTs('src/main/attachmentSave.ts');
  const o = office(t);
  const dir = path.join(o.own, TEAMMATE_FILES_FOLDER);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.pdf'), PDF);
  // No free name left for b.pdf: every one holds other bytes.
  for (let n = 1; n <= 50; n++) fs.writeFileSync(path.join(dir, n === 1 ? 'b.pdf' : `b (${n}).pdf`), `other ${n}`);
  const c = Buffer.concat([PDF, Buffer.from('c')]);
  assert.throws(() => saveFilesAllOrNone({ folder: o.own, subfolder: TEAMMATE_FILES_FOLDER, files: [
    { name: 'c.pdf', ending: 'pdf', bytes: c },
    { name: 'a.pdf', ending: 'pdf', bytes: PDF },
    { name: 'b.pdf', ending: 'pdf', bytes: PDF }
  ] }), AttachmentSaveError);
  assert.ok(fs.existsSync(path.join(dir, 'a.pdf')), 'the earlier identical copy stays');
  assert.equal(fs.existsSync(path.join(dir, 'c.pdf')), false, 'the copy this call made is gone');
  assert.deepEqual(saveFilesAllOrNone({ folder: o.own, subfolder: TEAMMATE_FILES_FOLDER, files: [{ name: 'a.pdf', ending: 'pdf', bytes: PDF }] }), [path.join(fs.realpathSync(dir), 'a.pdf')]);
});
