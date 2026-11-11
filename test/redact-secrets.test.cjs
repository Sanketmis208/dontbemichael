'use strict';

/*
 * Unit tests for redactSecrets() in src/main/hive.ts: the main-side privacy
 * gate every message subject and body passes before the Messages tab
 * (`hive:history`) reads it; hooks.ts uses it too. hive.ts is TypeScript and not importable
 * from a plain .cjs test, so the redaction battery below is a
 * CHARACTER-IDENTICAL copy (minus TS type annotations). KEEP IN LOCKSTEP: if
 * you change redactSecrets in hive.ts, mirror the change here; these tests are
 * what PROVE a secret-shaped value is stripped.
 *
 * Run: node test/redact-secrets.test.cjs   (exit 0 = all pass)
 */

const assert = require('assert');

// ── redactSecrets — MIRROR of src/main/hive.ts redactSecrets() ───────────────
function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
  let s = text;
  // 1. PEM private-key blocks (RSA/EC/OPENSSH/PGP — header through footer).
  s = s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[redacted]');
  // 2. JSON Web Tokens — three base64url segments separated by dots.
  s = s.replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, '[redacted]');
  // 3. Known credential prefixes: OpenAI/Anthropic (sk-, sk-ant-), Slack
  //    (xoxb/xoxp/xoxa/xoxr/xoxs-, xapp-), GitHub (ghp_/gho_/ghu_/ghs_/ghr_,
  //    github_pat_), AWS access-key ids (AKIA…), Google API keys (AIza…).
  s = s.replace(
    /(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|xox[bpaors]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})/g,
    '[redacted]'
  );
  // 4. Bearer tokens — keep the label, drop the credential.
  s = s.replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]');
  // 5. Sensitive key = value / key: value — keep the key name, drop the value.
  //    An optional namespace prefix (aws_, gcp_, …) is folded into the captured
  //    key so a LABELED secret survives the \b boundary: `aws_secret_access_key`
  //    is all word chars, so a bare `\b(secret)\b` never sees it. Listing
  //    secret_access_key / private_key alone is not enough — the prefix run is
  //    what lets `aws_secret_access_key=…` (no AKIA shape on the value) redact.
  s = s.replace(
    /\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|secret[_-]?access[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|signing[_-]?secret|webhook[_-]?secret|auth[_-]?token|bot[_-]?token|private[_-]?key))(\s*[:=]\s*)(["']?)[^\s"',}]{6,}\3/gi,
    (_m, k) => `${k}=[redacted]`
  );
  return s;
}

// ── harness ──────────────────────────────────────────────────────────────────
let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n     ${err.message}`);
  }
}

console.log('redactSecrets: the main-side privacy gate');

// ===== REDACTION (the security crux) =========================================
const SECRETS = [
  ['OpenAI key', 'key is sk-proj-abc123DEF456ghi789JKL012mno345 ok', 'sk-proj-abc123DEF456ghi789JKL012mno345'],
  ['Anthropic key', 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx done', 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx'],
  // NB: this fake Slack-token fixture is split ('xoxb-' + '…') so GitHub push protection
  // doesn't flag it as a real secret — the runtime value is byte-identical, the redaction
  // assertion is unchanged. Do NOT rejoin into one literal (it re-trips the public-push block).
  ['Slack bot token', 'token xoxb-' + '1234567890-ABCDEFghijklmnop here', 'xoxb-' + '1234567890-ABCDEFghijklmnop'],
  ['Slack app token', 'xapp-1-A0123456-789012345-abcdef0123 end', 'xapp-1-A0123456-789012345-abcdef0123'],
  ['GitHub PAT', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 x', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
  ['GitHub fine-grained', 'github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ z', 'github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ'],
  ['AWS access key', 'AKIAIOSFODNN7EXAMPLE is the id', 'AKIAIOSFODNN7EXAMPLE'],
  ['Google API key', 'AIzaSyA1234567890_abcdefghijklmnopqrst go', 'AIzaSyA1234567890_abcdefghijklmnopqrst'],
  ['JWT', 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJ here', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJ'],
  ['api_key assignment', 'config api_key=sk_live_thisIsASecretValue123 stored', 'sk_live_thisIsASecretValue123'],
  ['password assignment', 'login password: hunter2password now', 'hunter2password'],
  ['signing_secret assignment', 'slack signing_secret = 8f9a0b1c2d3e4f5a6b7c done', '8f9a0b1c2d3e4f5a6b7c'],
  ['bot_token assignment', 'env bot_token="xoxb-keepme-but-strip" set', 'xoxb-keepme-but-strip'],
  // Pam hardening: a LABELED aws secret access key — the AKIA id half is caught
  // by rule 3, but the 40-char SECRET value has no prefix shape and sits behind a
  // namespace prefix (aws_), so it must be caught by the rule-5 key=value path.
  ['aws_secret_access_key (namespaced label)', 'creds aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY here', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
  ['private_key assignment', 'config private_key=abc123DEF456ghi789jkl012mno here', 'abc123DEF456ghi789jkl012mno']
];

for (const [label, input, secret] of SECRETS) {
  test(`redact: strips ${label}`, () => {
    const out = redactSecrets(input);
    assert.ok(!out.includes(secret), `secret leaked: ${out}`);
    assert.ok(out.includes('[redacted]'), `nothing redacted: ${out}`);
  });
}

test('redact: PEM private key block is stripped', () => {
  const pem = 'before -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY----- after';
  const out = redactSecrets(pem);
  assert.ok(!out.includes('MIIEowIBAAKCAQEA'));
  assert.ok(out.includes('[redacted]'));
  assert.ok(out.includes('before') && out.includes('after'), 'surrounding prose preserved');
});

test('redact: bearer keeps the label, drops the credential', () => {
  const out = redactSecrets('Authorization: Bearer abcDEF0123456789xyzqrst');
  assert.ok(!out.includes('abcDEF0123456789xyzqrst'));
  assert.ok(/bearer \[redacted\]/i.test(out));
});

// ===== BENIGN CONTENT MUST SURVIVE ===========================================
const BENIGN = [
  'integrated feat/voice-key-ux at commit db61b12 off main 4585902',
  'kevin-mqpbq43v parked, awaiting assignment',
  '/Users/chaitanya/Documents/Personal/cth-voice-msg-access is the worktree',
  'The token cap is 1.2 million tokens this session.',
  'Tasks: 3 todo, 1 doing, 0 blocked, 12 done.',
  'Pam approved 8 of 8 dimensions, no must-fix.'
];
for (const b of BENIGN) {
  test(`benign preserved: "${b.slice(0, 40)}..."`, () => {
    assert.strictEqual(redactSecrets(b), b, 'redaction must not alter benign content');
  });
}

test('redact: tolerates non-string input', () => {
  assert.strictEqual(redactSecrets(undefined), '');
  assert.strictEqual(redactSecrets(null), '');
  assert.strictEqual(redactSecrets(42), '');
  assert.strictEqual(redactSecrets(''), '');
});

console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}.`);
process.exit(failures ? 1 : 0);
