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
const { handleMailRequest, sendTimeoutFor } = loadTs('src/main/mail.ts');
const { MailApprovals } = loadTs('src/main/mailApprovals.ts');
const { liveFileKeys, heldFileBytes, approvedFiles, standingProblem } = loadTs('src/shared/mailProposals.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const FIXTURE = path.resolve(__dirname, 'fixtures', 'file-reader-run.cjs');
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

function route(t, o) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-attach-route-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = { sends: [], drafts: [], audit: [], messages: [] };
  const f = files(o);
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
  assert.match(mail, /'Saving to Sent', true, sendTimeoutFor\(input\)\)/);
  assert.ok(outgoing.OUTGOING_READ_BUDGET_MS + sendTimeoutFor({ files: [{ content: Buffer.alloc(18 * 1024 * 1024) }] }) < 180_000, 'read and send fit inside md-mail\'s three minutes');
});
