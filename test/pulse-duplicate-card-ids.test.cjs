'use strict';

/**
 * A board that lists one card id twice (Michael edits tasks.json with his own
 * tools) is read as one card: its last entry wins, and it is compared with the
 * last read once. Before, each entry was compared on its own, so a card listed
 * as done and again as todo recorded a finish on every 8 s tick, inflating
 * Tasks done (PR 737 review, 2026-11-27).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { TelemetryStore } = loadTs('src/main/telemetryStore.ts');

/** A store over a fake database that keeps the card-status points it is given. */
function setup() {
  const points = [];
  const db = {
    prepare: (sql) => ({ run: (...a) => { if (/telemetry_events/.test(sql) && a[2] === 'card-status') points.push(JSON.parse(a[5])); } }),
    transaction: (fn) => () => fn()
  };
  let now = Date.UTC(2026, 10, 27, 9);
  const store = new TelemetryStore(() => db, () => '/office', () => now);
  const read = (cards) => { now += 8000; store.tasks(cards, now); store.flush(); };
  return { points, read };
}

const card = (id, status) => ({ id, status, assignee: 'nick' });

test('a card listed twice is one card: no point on every tick, and a real change counts once', () => {
  // Value: protects=Tasks done counts a duplicated card's finish once; fails_when=each entry of a duplicated id is diffed on its own, so the board records a change on every tick; why_new=PR 737 adversarial review 2026-11-27; seam=TelemetryStore over a fake database; no_claim=how the processor folds the points
  const { points, read } = setup();
  const board = [card('x', 'done'), card('y', 'doing'), card('x', 'todo')];
  read(board);                                   // the first read only remembers
  read(board);
  read(board);
  assert.deepEqual(points, [], 'an unchanged board with a repeated id records nothing');
  read([card('x', 'done'), card('y', 'doing'), card('x', 'done')]);
  assert.deepEqual(points.map((p) => [p.id, p.from, p.to]), [['x', 'todo', 'done']], 'the change is recorded once, from the status last read');
  read([card('x', 'done'), card('y', 'doing'), card('x', 'done')]);
  assert.equal(points.length, 1, 'and not again');
});
