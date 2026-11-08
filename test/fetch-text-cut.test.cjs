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
  const out = await outcome(getText('https://x.test/a', { timeoutMs: 600 }), 3000);
  assert.notEqual(out, 'pending', 'the idle timer kept restarting');
  assert.match(out.error, /timed out/);
  assert.ok(Date.now() - started < 1500);
});

test('the deadline covers the redirects too', async (t) => {
  await serve(t, (req, res) => {
    const n = Number(req.url.slice(1)) || 0;
    if (n < 4) setTimeout(() => { res.writeHead(302, { location: `/${n + 1}` }); res.end(); }, 250);
    else { res.writeHead(200); res.end('ok'); }
  });
  // Four hops of 250 ms each never trip a 600 ms idle timer, but they do pass
  // a 600 ms deadline for the whole fetch.
  const out = await outcome(getText('https://x.test/0', { timeoutMs: 600 }), 3000);
  assert.match(out.error ?? '', /timed out/);
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

test('release notes are fetched through getText', () => {
  // updater.ts imports electron, so its fetch is checked in the source.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'updater.ts'), 'utf8');
  const start = src.indexOf('function fetchReleaseBody');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(body, /getText\(`https:\/\/api\.github\.com\/repos\/\$\{REPO\}\/releases\/tags\/v\$\{version\}`/);
  assert.match(body, /timeoutMs: 10_000/);
  assert.match(body, /\.catch\(\(\) => undefined\)\.then\(done\)/);
  assert.doesNotMatch(body, /httpsRequest/);
});
