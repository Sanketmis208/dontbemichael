'use strict';

/**
 * Business hours set by day (owner, 2026-11-19: typing them freely was hard;
 * src/shared/businessHours.ts, src/renderer/src/components/HoursPicker.tsx).
 *
 * Protects: the week is saved as one plain English line every agent reads,
 * and read back exactly; hours typed in the usual ways start the picker where
 * the owner left them; hours in any other form are kept as text, never
 * rewritten until the owner changes a day.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const h = loadTs('src/shared/businessHours.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the week as one line, grouped, and read back exactly', () => {
  const week = h.WEEKDAYS_9_TO_5.map((d) => d && { ...d });
  week[5] = { open: '10:00', close: '14:00' };
  const line = h.formatHours(week);
  assert.equal(line, 'Mon to Fri 9:00 AM to 5:00 PM; Sat 10:00 AM to 2:00 PM; Sun closed');
  assert.deepEqual(h.parseHours(line), week);
  assert.equal(h.formatHours(h.WEEKDAYS_9_TO_5), 'Mon to Fri 9:00 AM to 5:00 PM; Sat and Sun closed');
  assert.equal(h.formatHours(h.EVERY_DAY_9_TO_5), 'Every day 9:00 AM to 5:00 PM');
  assert.deepEqual(h.parseHours('Every day 9:00 AM to 5:00 PM'), h.EVERY_DAY_9_TO_5);
  assert.equal(h.formatHours(Array(7).fill(null)), undefined, 'closed every day: no hours');
  const late = Array(7).fill(null); late[4] = { open: '18:00', close: '02:00' };
  assert.deepEqual(h.parseHours(h.formatHours(late)), late, 'past midnight');
});

test('times: 12 hour for people, 24 hour inside', () => {
  assert.equal(h.time12('00:30'), '12:30 AM');
  assert.equal(h.time12('12:00'), '12:00 PM');
  assert.equal(h.time24('5:30 pm'), '17:30');
  assert.equal(h.time24('12:00 AM'), '00:00');
  assert.equal(h.time24('13:00 pm'), null);
});

test('only that exact form is read back; anything else is not rewritten', () => {
  for (const other of ['Mon to Fri, 9am to 5pm', 'By appointment', 'Mon to Fri 9:00 AM to 5:00 PM; Mon closed', '']) {
    assert.equal(h.parseHours(other), null, other);
  }
});

test('hours typed the usual ways start the picker where the owner left them', () => {
  const cases = {
    'Mon to Fri: 8am to 5 pm': 'Mon to Fri 8:00 AM to 5:00 PM; Sat and Sun closed',
    'Mon-Fri 9am-5pm; Sat 10-2': 'Mon to Fri 9:00 AM to 5:00 PM; Sat 10:00 AM to 2:00 PM; Sun closed',
    'Monday to Friday, 8:00 AM to 5:00 PM': 'Mon to Fri 8:00 AM to 5:00 PM; Sat and Sun closed',
    'Daily 7am to 9pm': 'Every day 7:00 AM to 9:00 PM',
    'Mon–Thu 9-6\nFri 9-3': 'Mon to Thu 9:00 AM to 6:00 PM; Fri 9:00 AM to 3:00 PM; Sat and Sun closed'
  };
  for (const [typed, line] of Object.entries(cases)) assert.equal(h.formatHours(h.guessHours(typed)), line, typed);
  for (const unclear of ['By appointment', 'Weekends only', 'Open late']) assert.equal(h.guessHours(unclear), null, unclear);
});

test('the picker: in the profile, saves only on a change, keeps other text, and the copy', () => {
  const picker = read('src/renderer/src/components/HoursPicker.tsx');
  assert.match(picker, /const save = \(next: WeekHours\): void => \{ setWeek\(next\); onChange\(formatHours\(next\)\); \};/);
  assert.match(picker, /useState<'week' \| 'text'>\(\(\) => \(!value\?\.trim\(\) \|\| parsed \? 'week' : 'text'\)\)/, 'other text opens as text');
  assert.match(picker, /onClick=\{\(\) => \{ setWeek\(parsed \?\? guessHours\(value\) \?\? WEEKDAYS_9_TO_5\); setMode\('week'\); \}\}/, 'Set by day saves nothing by itself');
  assert.match(picker, /type="time" step=\{900\}/);
  const fields = read('src/renderer/src/components/CompanyProfileFields.tsx');
  assert.match(fields, /<Field label=\{t\('companyProfile\.hours'\)\} group>\s*<HoursPicker value=\{value\.hours\} onChange=\{\(hours\) => set\(\{ hours \}\)\}/);
  // Live, 2026-11-19: inside a <label>, Set by day (gone once clicked) passed
  // its click on to the label's first button, the 9 to 5 preset, and changed
  // the hours. The week and the links are named groups instead.
  assert.match(fields, /<Field label=\{t\('companyProfile\.social'\)\} group>/);
  assert.match(fields, /read=\{group\}/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).companyProfile;
  for (const k of ['hoursWeekdays', 'hoursEveryDay', 'hoursOpen', 'hoursClosed', 'hoursTypeInstead', 'hoursByDay', 'hoursKept']) {
    assert.ok(en[k], k);
    assert.doesNotMatch(en[k], /[–—]| - /, k);
  }
});
