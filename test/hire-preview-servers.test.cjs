'use strict';

/**
 * A hire link that names MCP servers (owner, 2026-11-11). The app starts none
 * of them, so the Add Agent preview lists them once as not turned on. It used
 * to call some "enabled by default" and send the owner to a Settings section
 * that no longer exists.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the hire preview says the named servers are not turned on, and points nowhere', () => {
  // Value: protects=the owner is told the truth about a hire's servers; fails_when=the preview claims a server is enabled, points to a Settings section, or the words go missing in a language; why_new=owner 2026-11-11 (copy pointed at removed Settings); seam=source pin plus locale files; no_claim=a rendered dialog
  const modal = read('src/renderer/src/components/AddAgentModal.tsx');
  assert.match(modal, /tr\('addAgent\.mcpNotStarted'\)/);
  assert.ok(!/addAgent\.mcp(Safe|Consent|EnableInSettings)/.test(modal), 'the old enabled and Settings lines are gone');
  for (const loc of ['en']) {
    const add = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).addAgent;
    assert.ok(typeof add.mcpNotStarted === 'string' && add.mcpNotStarted, `${loc} addAgent.mcpNotStarted`);
    assert.ok(!/[–—→]|\s-\s/.test(add.mcpNotStarted), `${loc}: no dashes or arrows`);
    for (const k of ['mcpSafe', 'mcpConsent', 'mcpEnableInSettings']) assert.equal(add[k], undefined, `${loc}: ${k} removed`);
  }
});
