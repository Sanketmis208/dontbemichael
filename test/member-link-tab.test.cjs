'use strict';

/**
 * A link that opens a team member at a tab opens that tab in the person panel
 * (owner, 2026-11-19: "Pam, Access, Email" on an Ask me card opened Pam's
 * Profile; src/renderer/src/store/store.ts).
 *
 * Protects: the person panel reads sidebarTab, so each opener sets it, not
 * only the Command Center's ccTabRequest; Access, Email still unfolds Email.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/store/store.ts'), 'utf8');
const panel = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/components/AgentDetailPanel.tsx'), 'utf8');

test('the person panel shows the tab sidebarTab names', () => {
  assert.match(panel, /const sidebarTab = useStore\(s => s\.sidebarTab\);/);
  assert.match(panel, /\{sidebarTab === 'capabilities' && \(/);
});

test('each opener sets the panel\'s tab, Access with Email unfolded', () => {
  const opener = (name) => store.slice(store.indexOf(`  ${name}: (agentId) =>`), store.indexOf('})); },', store.indexOf(`  ${name}: (agentId) =>`)));
  for (const [name, tab] of [['openAgentEmail', 'capabilities'], ['openAgentProfile', 'profile'], ['openAgentWork', 'terminal'], ['openAgentMemory', 'memory']]) {
    const body = opener(name);
    assert.ok(body.length > 0, name);
    assert.match(body, new RegExp(`\\.\\.\\.personTab\\('${tab}'\\)`), name);
  }
  assert.match(opener('openAgentEmail'), /emailRequest: \{ agentId, seq:/);
  assert.match(store, /function personTab\(tab: SidebarTab\): \{ sidebarTab: SidebarTab \} \{\s*try \{ window\.localStorage\.setItem\(LS_SIDEBAR_TAB, tab\); \}/);
});
