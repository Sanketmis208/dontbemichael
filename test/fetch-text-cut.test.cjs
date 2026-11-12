'use strict';

// getBuffer/getText (src/main/fetchText.ts) settled only on 'end' or a request
// error. A connection cut partway through the body sends neither (only 'close'
// with the message incomplete), and req.setTimeout is an idle timer that a
// server sending a byte every few seconds never trips. Either way the promise
// never settled: a skill install or catalog browse spun forever, and the hero
// and model catalog never fell back to their cached data. https.request is
// pointed at a local plain http server, so the sockets are real but nothing
// leaves the machine.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { getText } = loadTs('src/main/fetchText.ts');

/** Serve `handler` locally and send fetchText's https.request there. */
async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const real = https.request;
  https.request = (url, opts, cb) => {
    const u = new URL(url);
    return http.request({ ...opts, host: '127.0.0.1', port, path: u.pathname + u.search }, cb);
  };
  t.after(() => { https.request = real; server.closeAllConnections(); server.close(); });
}

/** The promise's outcome, or 'pending' if it hasn't settled in `ms`. */
function outcome(p, ms) {
  return Promise.race([
    p.then((v) => ({ value: v }), (e) => ({ error: e.message })),
    new Promise((r) => setTimeout(() => r('pending'), ms).unref())
  ]);
}

test('a body cut partway (with a content-length) rejects', async (t) => {
  await serve(t, (req, res) => {
    res.writeHead(200, { 'content-length': '100' });
    res.write('{"name":');
    setTimeout(() => res.socket.destroy(), 20);
  });
  const out = await outcome(getText('https://x.test/a', { timeoutMs: 5000 }), 2000);
  assert.notEqual(out, 'pending', 'the fetch never settled');
  assert.match(out.error, /closed before the whole body arrived|aborted/);
});

test('a chunked body cut partway rejects', async (t) => {
  await serve(t, (req, res) => {
    res.writeHead(200);
    res.write('{"name":');
    setTimeout(() => res.socket.destroy(), 20);
  });
  const out = await outcome(getText('https://x.test/a', { timeoutMs: 5000 }), 2000);
  assert.notEqual(out, 'pending', 'the fetch never settled');
  assert.ok(out.error);
});

test('a body sent a byte at a time still ends at the deadline', async (t) => {
  await serve(t, (req, res) => {
    res.writeHead(200);
    const tick = setInterval(() => res.write(' '), 100);
    res.on('close', () => clearInterval(tick));
  });
  const started = Date.now();
  const out = await outcome(getText('https://x.test/a', { timeoutMs: 5000, deadlineMs: 600 }), 4000);
  assert.notEqual(out, 'pending', 'the idle timer kept restarting');
  assert.match(out.error, /timed out/);
  assert.ok(Date.now() - started < 2500);
});

test('the deadline covers the redirects too', async (t) => {
  await serve(t, (req, res) => {
    const n = Number(req.url.slice(1)) || 0;
    if (n < 4) setTimeout(() => { res.writeHead(302, { location: `/${n + 1}` }); res.end(); }, 250);
    else { res.writeHead(200); res.end('ok'); }
  });
  // Four hops of 250 ms each never trip the idle timer, but they do pass a
  // 600 ms deadline for the whole fetch.
  const out = await outcome(getText('https://x.test/0', { timeoutMs: 5000, deadlineMs: 600 }), 3000);
  assert.match(out.error ?? '', /timed out/);
});

test('a slow body that keeps arriving outlasts the idle limit', async (t) => {
  // A skill file on a slow link: no gap reaches the idle limit, the whole
  // fetch takes longer than it, and it still arrives.
  await serve(t, (req, res) => {
    res.writeHead(200);
    let n = 0;
    const tick = setInterval(() => { res.write('x'); if (++n === 8) { clearInterval(tick); res.end(); } }, 100);
  });
  const out = await outcome(getText('https://x.test/a', { timeoutMs: 400 }), 4000);
  assert.deepEqual(out, { value: 'xxxxxxxx' });
});

test('a redirect whose body never ends doesn\'t keep its connection', async (t) => {
  let held;
  await serve(t, (req, res) => {
    if (req.url === '/moved') {
      held = res.socket;
      res.writeHead(302, { location: '/here', 'content-length': '100' });
      res.write('partial');
      return;
    }
    res.writeHead(200);
    res.end('ok');
  });
  assert.equal(await getText('https://x.test/moved'), 'ok');
  const closed = await Promise.race([
    new Promise((r) => (held.destroyed ? r(true) : held.once('close', () => r(true)))),
    new Promise((r) => setTimeout(() => r(false), 2000).unref())
  ]);
  assert.equal(closed, true, 'the redirect hop\'s socket stayed open');
});

test('a whole body, extra headers and a redirect still read as before', async (t) => {
  let seen;
  await serve(t, (req, res) => {
    if (req.url === '/old') { res.writeHead(301, { location: '/new' }); res.end(); return; }
    seen = req.headers;
    res.writeHead(200);
    res.end('{"body":"notes"}');
  });
  const out = await getText('https://x.test/old', { headers: { Accept: 'application/vnd.github+json' } });
  assert.equal(out, '{"body":"notes"}');
  assert.equal(seen.accept, 'application/vnd.github+json');
  assert.equal(seen['user-agent'], 'dontbemichael');
});

test('an own User-Agent replaces the default, and only one goes out', async (t) => {
  let raw;
  await serve(t, (req, res) => { raw = req.rawHeaders; res.writeHead(200); res.end('{}'); });
  await getText('https://x.test/a', { headers: { 'user-agent': 'dontbemichael-updater' } });
  const uas = raw.filter((_, i) => i % 2 === 0 && raw[i].toLowerCase() === 'user-agent').length;
  assert.equal(uas, 1);
  assert.equal(raw[raw.findIndex((h) => h.toLowerCase() === 'user-agent') + 1], 'dontbemichael-updater');
});

test('release notes are fetched through getText', () => {
  // updater.ts imports electron, so its fetch is checked in the source.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'updater.ts'), 'utf8');
  const start = src.indexOf('function fetchReleaseBody');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(body, /getText\(`https:\/\/api\.github\.com\/repos\/\$\{REPO\}\/releases\/tags\/v\$\{version\}`/);
  assert.match(body, /timeoutMs: 10_000/);
  assert.match(body, /deadlineMs: 20_000/);
  // The cap was where done was never called; it counts bytes now.
  assert.match(body, /maxBytes: 1_048_576/);
  assert.match(body, /'user-agent': 'dontbemichael-updater', accept: 'application\/vnd\.github\+json'/);
  assert.match(body, /\.catch\(\(\) => undefined\)\.then\(done\)/);
  assert.doesNotMatch(body, /httpsRequest/);
});
