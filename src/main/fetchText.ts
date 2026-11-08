/**
 * One place that fetches text over https.
 *
 * Extracted from skills.ts when the hero payload needed the same thing: two
 * copies of redirect-following, timeout and status handling would drift, and the
 * one that drifted would be the one nobody was looking at.
 *
 * https only, by construction — every caller fetches from raw.githubusercontent
 * or a repo URL, and an http: fallback would silently downgrade content the app
 * then renders.
 */
import { request as httpsRequest } from 'node:https';

/** Redirect hops followed before giving up. Some callers fetch URLs scraped from
 *  third-party pages, and a redirect loop there would otherwise never settle. */
export const MAX_REDIRECTS = 5;

/** Largest body read before giving up. Every caller fetches a small document
 *  (the biggest, the skills catalog, is about 60 KB; skill installs refuse
 *  more than 2 MB in all), and some URLs are scraped from third-party pages,
 *  so an endless or huge body must not fill memory. */
export const MAX_BYTES = 8 * 1024 * 1024;

export interface FetchOptions {
  /** Whole fetch, redirects included. */
  timeoutMs?: number;
  maxBytes?: number;
  /** Extra request headers (an API's Accept, its own User-Agent). */
  headers?: Record<string, string>;
}

export function getText(url: string, opts: FetchOptions = {}): Promise<string> {
  return getBuffer(url, opts).then((body) => body.toString('utf8'));
}

export function getBuffer(url: string, opts: FetchOptions = {}, redirects = 0, deadlineAt?: number): Promise<Buffer> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  // One deadline for the whole fetch. req.setTimeout alone is an idle timer:
  // it starts only once the socket connects and restarts on every byte, so a
  // server sending a byte every few seconds was never cut off.
  const until = deadlineAt ?? Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    // Every way out goes through here, so the promise settles exactly once and
    // a failure always drops the connection.
    let settled = false;
    const fail = (e: Error): void => {
      if (settled) return;
      settled = true; clearTimeout(timer); req.destroy(); reject(e);
    };
    const req = httpsRequest(url, { method: 'GET', headers: { 'user-agent': 'dontbemichael', ...opts.headers } }, (res) => {
      // Follow a redirect once per hop; raw.githubusercontent does this for
      // branch aliases and the request just fails without it. A relative
      // Location resolves against this URL; an http: one still fails, since
      // httpsRequest refuses that protocol.
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) { fail(new Error('too many redirects')); return; }
        let next: string;
        try { next = new URL(res.headers.location, url).href; }
        catch { fail(new Error('bad redirect')); return; }
        settled = true; clearTimeout(timer);
        getBuffer(next, opts, redirects + 1, until).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); fail(new Error(`HTTP ${res.statusCode}`)); return; }
      // Counted in bytes as data arrives: a declared Content-Length can be
      // missing or wrong.
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) { fail(new Error('response too large')); return; }
        chunks.push(c);
      });
      res.on('end', () => {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(Buffer.concat(chunks));
      });
      // A connection cut partway through the body sends 'close' with the
      // message incomplete and never 'end' (and 'error' only to a listener),
      // so without these the promise never settled.
      res.on('error', fail);
      res.on('close', () => { if (!res.complete) fail(new Error('connection closed before the whole body arrived')); });
    });
    const timer = setTimeout(() => fail(new Error('timed out')), Math.max(0, until - Date.now()));
    // A fetch never holds the app open on quit.
    timer.unref?.();
    req.on('error', fail);
    req.setTimeout(timeoutMs, () => fail(new Error('timed out')));
    req.end();
  });
}
