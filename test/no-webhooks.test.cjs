'use strict';

/**
 * The inbound webhook feature is gone (owner, 2026-11-11: no use case). These
 * pin that it stays gone: no server, no trigger ledger, no IPC channel, no
 * Settings or History copy, and an install that once saved webhooks still opens.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('the webhook server and the trigger ledger are gone', () => {
  // Value: protects=no public inbound surface ships; fails_when=webhook.ts or triggerHistory.ts comes back; why_new=webhooks removed 2026-11-11; seam=none
  for (const f of ['src/main/webhook.ts', 'src/main/triggerHistory.ts', 'src/main/tunnelmole.d.ts']) {
    assert.ok(!fs.existsSync(path.join(root, f)), `${f} is gone`);
  }
});

test('main and preload have no webhook or trigger history channel', () => {
  // Value: protects=the renderer cannot reach a webhook or ledger handler; fails_when=a webhook:, webhooks: or triggerHistory: channel is registered or bridged; why_new=webhooks removed 2026-11-11; seam=none
  for (const f of ['src/main/index.ts', 'src/preload/index.ts']) {
    assert.doesNotMatch(read(f), /['"`](webhooks?|triggerHistory):/, f);
  }
});

test('en.json has no webhook or trigger history copy', () => {
  // Value: protects=no Settings or History text for a feature that is gone; fails_when=the webhook keys come back; why_new=webhooks removed 2026-11-11; seam=none
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  assert.equal(en.triggerHistory, undefined);
  assert.equal(en.webhooksSection, undefined);
  assert.equal(en.settings.connections, undefined);
  assert.equal(en.commandCenter.tabs.history, undefined);
  assert.doesNotMatch(JSON.stringify(en), /webhook/i);
});

test('a config.json that still holds webhook fields reads, and only the cadence moves', () => {
  // Value: protects=an older install opens and its 1h compact schedule still moves to 2h; fails_when=the old fields break the read, a legacy endpoint is rebuilt, or the cadence fold is lost; why_new=webhook fold removed from migrateTriggersV1; seam=electron app.getPath
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-no-webhooks-'));
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
  try {
    fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({
      onboardingComplete: true,
      notifications: false,
      webhookEnabled: true,
      webhookSecret: 'abc123secret',
      webhookPort: 4000,
      missions: [{ id: 'compact-maintenance', label: 'Auto-compact (maintenance)', intervalMs: 3_600_000, to: '', enabled: false }],
      triggersMigratedV1: false
    }));
    const { readConfig } = loadTs('src/main/config.ts');
    const cfg = readConfig();
    assert.equal(cfg.onboardingComplete, true);
    assert.equal(cfg.notifications, false);
    assert.equal(cfg.triggersMigratedV1, true);
    assert.equal(cfg.webhookTriggers, undefined, 'no endpoint is rebuilt from the old secret');
    assert.equal(cfg.missions.find((m) => m.id === 'compact-maintenance').intervalMs, 7_200_000, '1h moves to 2h');
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
    assert.equal(saved.missions.find((m) => m.id === 'compact-maintenance').intervalMs, 7_200_000, 'the move is saved');
  } finally {
    delete require.cache[electron];
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
