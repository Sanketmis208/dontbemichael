'use strict';

// The updater's own log lines (src/main/updater.ts → updater.log in userData).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

test('updater.ts still logs each step of an update to updater.log', () => {
  // updater.log is how an update that went wrong is read back afterwards: the
  // download, the restart request, a failed or refused restart, and the version
  // that launched next.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/updater.ts'), 'utf8');
  assert.ok(
    src.includes('logLine(`update downloaded: ${info.version}'),
    'updater.ts no longer logs "update downloaded: <version>"'
  );
  assert.ok(
    src.includes("logLine('quitAndInstall requested by the user')"),
    'updater.ts no longer logs the restart request'
  );
  assert.ok(
    src.includes('logLine(`quitAndInstall failed:'),
    'updater.ts no longer logs the failed attempt'
  );
  assert.ok(
    src.includes('logLine(`native updater ready (current v${app.getVersion()})`)'),
    'updater.ts no longer names the launching version'
  );
  assert.ok(
    src.includes("logLine('quitAndInstall cancelled by the user at the quit warning')"),
    'updater.ts no longer logs the refused quit'
  );
});

test('the manual-download breadcrumb matches the URL the badge actually opens', () => {
  // The only trace the manual path leaves in updater.log. The pattern in
  // updater.ts must match what installerUrl() hands the badge, or the line
  // never appears for a real download.
  const { installerUrl, REPO } = loadTs('src/shared/updateState.ts');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/updater.ts'), 'utf8');
  assert.ok(
    src.includes('logLine(`manual download opened: ${asset[1]}`)'),
    'updater.ts no longer logs the manual download'
  );
  const pattern = /const asset = (\/.+\/)\.exec\(href\);/.exec(src);
  assert.ok(pattern, 'the breadcrumb no longer derives the version from the href');
  const re = new RegExp(pattern[1].slice(1, -1));

  for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64'], ['linux', 'x64']]) {
    const hit = re.exec(installerUrl('0.4.6', platform, arch));
    assert.ok(hit, `${platform}/${arch} installer URL does not match the breadcrumb pattern`);
    assert.equal(hit[1], '0.4.6');
  }
  assert.equal(re.exec(installerUrl('0.5.0-beta.1', 'darwin', 'arm64'))[1], '0.5.0-beta.1');
  // and the notes link is NOT a download: reading the release page is not
  // choosing the manual path.
  assert.equal(re.test(`https://github.com/${REPO}/releases/tag/v0.4.6`), false);
  assert.equal(re.test(`https://github.com/${REPO}/releases/latest`), false);
});
