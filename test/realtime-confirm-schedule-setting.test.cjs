'use strict';

/**
 * A voice confirm for a schedule or a setting is for the one it was staged
 * for (TODOS "Voice confirms for schedules and settings carry no target").
 * Before this, with a delete of Morning report waiting, "confirm, delete the
 * Invoice check schedule" deleted Morning report: the confirm check looked
 * only for the verb word, and only a member's name could cancel it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const handlers = new Map();
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) }, Notification: class { show() {} static isSupported() { return false; } } }
};

const { registerRealtimeActionIpc } = loadTs('src/main/realtimeActions.ts');

const mission = (id, label) => ({ id, label, intervalMs: 3_600_000, to: 'god', body: '', focus: 'x', enabled: true });
let missions = [];
let config = {};
const patched = [];
registerRealtimeActionIpc({
  hiveEnabled: () => true,
  hiveSend: () => ({}), hiveTasks: () => [], hivePatchTask: () => true,
  hiveMoveTask: () => true, hiveCloseTask: () => true,
  hiveRegistry: () => ({ godId: 'god', agents: { god: { name: 'Michael', isGod: true }, jim: { name: 'Jim' } } }),
  hiveLog() {}, controlPause() {}, controlSteer() {}, controlHalt() {}, controlSnapshot: () => null,
  killAgent: () => ({ ok: true }),
  listMissions: () => missions.map((m) => ({ ...m })),
  saveMissions: (list) => { missions = list.map((m) => ({ ...m })); },
  getConfigValue: (k) => config[k],
  patchConfig: (p) => { patched.push(p); config = { ...config, ...p }; }
});
const act = (p) => handlers.get('realtime:action')(null, p);
const confirm = (phrase) => handlers.get('realtime:action:confirm')(null, { phrase });
const nothingLeft = async (why) => assert.equal((await confirm('confirm')).spoken, 'There\'s nothing waiting to confirm.', why);

const office = () => {
  missions = [mission('m-morning', 'Morning report'), mission('m-invoice', 'Invoice check'), mission('m-weekly', 'Morning report weekly')];
};

test('a schedule confirm that names another schedule cancels the staged one and changes nothing', async () => {
  // Value: protects=a voice schedule edit reaches only the schedule it was staged for; fails_when=a confirm naming another schedule by name or id runs the staged edit, or leaves it staged; why_new=TODOS P2, memory and voice trust gaps (2026-10-26); seam=the real ipc handlers
  for (const phrase of ['confirm, delete the Invoice check schedule', 'delete invoice check', 'Confirm m-invoice', 'confirm the morning report weekly schedule']) {
    office();
    assert.equal((await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' })).needsConfirm, true);
    const res = await confirm(phrase);
    assert.deepEqual([res.ok, res.spoken], [false, 'That named a different schedule than the "Morning report" schedule, so I cancelled the edit schedule. Ask again for the one you mean.'], phrase);
    await nothingLeft(`${phrase}: nothing is left staged`);
    assert.deepEqual(missions.map((m) => m.id), ['m-morning', 'm-invoice', 'm-weekly'], `${phrase}: nothing deleted`);
  }
});

test('a schedule confirm naming the staged one, or none, still runs it', async () => {
  // Value: protects=the check never blocks a valid confirm; fails_when=the staged schedule's own name, a word inside it, or a longer schedule name holding a shorter one cancels; why_new=TODOS P2; seam=the real ipc handlers
  for (const phrase of ['confirm', 'confirm, delete the Morning report schedule', 'schedule', 'yes delete morning report, confirm']) {
    office();
    await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
    assert.equal((await confirm(phrase)).ok, true, phrase);
    assert.deepEqual(missions.map((m) => m.id), ['m-invoice', 'm-weekly'], phrase);
  }
  // The staged name holds another schedule's whole name: that is still the staged one.
  office();
  await act({ verb: 'edit_schedule', missionId: 'm-weekly', action: 'disable' });
  assert.equal((await confirm('confirm the morning report weekly schedule')).ok, true);
  assert.deepEqual(missions.map((m) => [m.id, m.enabled]), [['m-morning', true], ['m-invoice', true], ['m-weekly', false]]);
  // A schedule whose name is only confirm words never cancels a confirm.
  missions = [mission('m-morning', 'Morning report'), mission('m-odd', 'Schedule'), mission('m-odd2', 'Confirm it')];
  await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
  assert.equal((await confirm('confirm schedule')).ok, true);
  assert.deepEqual(missions.map((m) => m.id), ['m-odd', 'm-odd2']);
});

test('a new schedule\'s confirm that names an existing one creates nothing; naming its own still creates it', async () => {
  // Value: protects=create_schedule carries its own name too; fails_when="confirm the Invoice check schedule" creates a different new schedule, or the new schedule sharing a name with an old one is cancelled; why_new=TODOS P2; seam=the real ipc handlers
  office();
  assert.equal((await act({ verb: 'create_schedule', label: 'Lead follow up', focus: 'New leads.', to: 'jim' })).needsConfirm, true);
  const res = await confirm('confirm the invoice check schedule');
  assert.equal(res.ok, false);
  assert.match(res.spoken, /^That named a different schedule than the "Lead follow up" schedule, so I cancelled the create schedule\./);
  await nothingLeft('nothing is left staged');
  assert.equal(missions.length, 3, 'no schedule was created');
  await act({ verb: 'create_schedule', label: 'Invoice check', focus: 'Open invoices past due.', to: 'jim' });
  assert.equal((await confirm('confirm the invoice check schedule')).ok, true, 'its own name, though an old one shares it');
  assert.equal(missions.length, 4);
});

test('a setting confirm that names another setting cancels the staged change and patches nothing', async () => {
  // Value: protects=a voice setting change applies only the key it was staged for; fails_when=a confirm naming another setting key (spoken or run together) applies the staged one, or leaves it staged; why_new=TODOS P2; seam=the real ipc handlers
  for (const phrase of ['confirm, change the max turns setting', 'confirm setting maxTurns', 'confirm slack enabled', 'confirm, turn on auto mode']) {
    config = { maxConcurrentWorkers: 4, maxTurns: 100, autoMode: false };
    patched.length = 0;
    assert.equal((await act({ verb: 'update_setting', key: 'maxConcurrentWorkers', value: 8 })).needsConfirm, true);
    const res = await confirm(phrase);
    assert.deepEqual([res.ok, res.spoken], [false, 'That named a different setting than the maxConcurrentWorkers setting, so I cancelled the update setting. Ask again for the one you mean.'], phrase);
    await nothingLeft(`${phrase}: nothing is left staged`);
    assert.deepEqual(patched, [], phrase);
  }
});

test('a setting confirm naming the staged key, or none, still applies it', async () => {
  // Value: protects=the check never blocks a valid setting confirm; fails_when=the staged key, spoken or run together, cancels; why_new=TODOS P2; seam=the real ipc handlers
  for (const phrase of ['confirm', 'setting', 'confirm max concurrent workers', 'confirm, maxConcurrentWorkers to 8']) {
    config = { maxConcurrentWorkers: 4 };
    patched.length = 0;
    await act({ verb: 'update_setting', key: 'maxConcurrentWorkers', value: 8 });
    assert.equal((await confirm(phrase)).ok, true, phrase);
    assert.deepEqual(patched, [{ maxConcurrentWorkers: 8 }], phrase);
  }
  // godModel and defaultModel share "model": the shared word decides nothing,
  // only the whole key does. "god model" applies it, "default model" cancels.
  config = { godModel: 'a' };
  patched.length = 0;
  await act({ verb: 'update_setting', key: 'godModel', value: 'b' });
  assert.equal((await confirm('confirm god model')).ok, true);
  assert.deepEqual(patched, [{ godModel: 'b' }]);
  await act({ verb: 'update_setting', key: 'godModel', value: 'c' });
  assert.equal((await confirm('confirm the default model')).ok, false);
  assert.deepEqual(patched, [{ godModel: 'b' }]);
});

test('a shorter schedule name cancels when the longer one is staged, unless the longer one is said in full', async () => {
  // Value: protects=a shorter name inside the staged one still names the other schedule; fails_when="confirm, delete morning report" runs Morning report weekly; why_new=PR 693 review; seam=the real ipc handlers
  office();
  await act({ verb: 'edit_schedule', missionId: 'm-weekly', action: 'delete' });
  const res = await confirm('confirm, delete morning report');
  assert.equal(res.ok, false);
  assert.match(res.spoken, /^That named a different schedule than the "Morning report weekly" schedule/);
  assert.deepEqual(missions.map((m) => m.id), ['m-morning', 'm-invoice', 'm-weekly']);
  await act({ verb: 'edit_schedule', missionId: 'm-weekly', action: 'delete' });
  assert.equal((await confirm('confirm, delete morning report weekly')).ok, true);
  assert.deepEqual(missions.map((m) => m.id), ['m-morning', 'm-invoice']);
});

test('a schedule\'s id never counts as its name, so a renamed voice schedule still cancels on the old name', async () => {
  // Value: protects=an id holding an old name never hides another schedule's name; fails_when=with renamed "Morning report" (id voice-invoice-check-*) staged, "confirm, delete the Invoice check schedule" deletes it; why_new=PR 693 review; seam=the real ipc handlers
  missions = [mission('voice-invoice-check-ab12cd', 'Morning report'), mission('m-invoice', 'Invoice check')];
  await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
  assert.equal((await confirm('confirm, delete the Invoice check schedule')).ok, false);
  assert.equal(missions.length, 2, 'nothing deleted');
  await nothingLeft('nothing is left staged');
  await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
  assert.equal((await confirm('confirm, delete the Morning report schedule')).ok, true);
  assert.deepEqual(missions.map((m) => m.id), ['m-invoice']);
});

test('a non-Latin schedule name cancels too', async () => {
  // Value: protects=the other-name check works for every script the app ships; fails_when="confirm, delete 日报" or an Arabic name runs the staged schedule; why_new=PR 693 review; seam=the real ipc handlers
  for (const [name, phrase] of [['日报', 'confirm, delete 日报'], ['تقرير الصباح', 'confirm, delete تقرير الصباح']]) {
    missions = [mission('m-morning', 'Morning report'), mission('m-other', name)];
    await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
    assert.equal((await confirm(phrase)).ok, false, phrase);
    assert.equal(missions.length, 2, `${phrase}: nothing deleted`);
  }
  // And a staged non-Latin name said in full runs.
  missions = [mission('m-morning', 'Morning report'), mission('m-other', '日报')];
  await act({ verb: 'edit_schedule', missionId: 'm-other', action: 'delete' });
  assert.equal((await confirm('confirm, delete 日报')).ok, true);
  assert.deepEqual(missions.map((m) => m.id), ['m-morning']);
});

test('a schedule with a label that is not a string does not break the confirm', async () => {
  // Value: protects=a stored number label never throws in the confirm and leaves the change staged; fails_when=the confirm rejects on .toLowerCase; why_new=PR 693 review; seam=the real ipc handlers
  missions = [mission('m-morning', 'Morning report'), mission('m-num', 2026)];
  await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
  assert.equal((await confirm('confirm, delete 2026')).ok, false);
  await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
  assert.equal((await confirm('confirm')).ok, true);
  assert.deepEqual(missions.map((m) => m.id), ['m-num']);
});

test('a no still cancels a schedule or a setting first', async () => {
  // Value: protects=a spoken no answers as a cancel before the other-name check; fails_when="no, not the Invoice check" answers as a different schedule or runs; why_new=TODOS P2; seam=the real ipc handlers
  office();
  await act({ verb: 'edit_schedule', label: 'Morning report', action: 'delete' });
  assert.deepEqual(await confirm('no, not invoice check'), { ok: false, spoken: 'Cancelled the edit_schedule.' });
  assert.equal(missions.length, 3);
});
