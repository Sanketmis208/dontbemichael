/**
 * Business hours as a week (owner, 2026-11-19: typing them freely was hard).
 * The company profile keeps one line of text, `hours`, that every agent reads
 * and Company foundations may write; the hours picker writes it in one fixed
 * English form and reads that form back:
 *
 *   "Mon to Fri 9:00 AM to 5:00 PM; Sat 10:00 AM to 2:00 PM; Sun closed"
 *   "Every day 8:00 AM to 8:00 PM"
 *
 * Text in any other form (typed by hand, written by an agent) is not this form:
 * the picker shows it as text and never rewrites it unless the owner sets the
 * hours by day. Pure, so it tests as a node module.
 */

/** "HH:MM", 24 hour. */
export interface DayHours { open: string; close: string }
/** Monday first; null is closed. */
export type WeekHours = Array<DayHours | null>;

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const WEEKDAYS_9_TO_5: WeekHours = [0, 1, 2, 3, 4, 5, 6].map((d) => (d < 5 ? { open: '09:00', close: '17:00' } : null));
export const EVERY_DAY_9_TO_5: WeekHours = [0, 1, 2, 3, 4, 5, 6].map(() => ({ open: '09:00', close: '17:00' }));
/** No day open: what the picker shows for hours not set yet, the same as what
 *  is saved (nothing), never a preset nobody chose. */
export const NOT_SET: WeekHours = [0, 1, 2, 3, 4, 5, 6].map(() => null);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "17:30" as "5:30 PM". */
export function time12(hhmm: string): string {
  const m = HHMM.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "5:30 PM" (or "5:30pm", "17:30") as "17:30", or null. */
export function time24(text: string): string | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  const ap = m[3]?.toLowerCase();
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'pm' ? 12 : 0); } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const same = (a: DayHours | null, b: DayHours | null): boolean =>
  a === b || (!!a && !!b && a.open === b.open && a.close === b.close);

/** The week as the one line agents read, or undefined when closed every day. */
export function formatHours(week: WeekHours): string | undefined {
  const days = DAY_SHORT.map((_, i) => week[i] ?? null);
  if (days.every((d) => d === null)) return undefined;
  const span = (d: DayHours | null): string => (d ? `${time12(d.open)} to ${time12(d.close)}` : 'closed');
  if (days.every((d) => same(d, days[0]))) return `Every day ${span(days[0])}`;
  const parts: string[] = [];
  for (let i = 0; i < 7;) {
    let j = i;
    while (j + 1 < 7 && same(days[j + 1], days[i])) j += 1;
    const name = i === j ? DAY_SHORT[i] : j === i + 1 ? `${DAY_SHORT[i]} and ${DAY_SHORT[j]}` : `${DAY_SHORT[i]} to ${DAY_SHORT[j]}`;
    parts.push(`${name} ${span(days[i])}`);
    i = j + 1;
  }
  return parts.join('; ');
}

/** The week back from text in that one form, or null for any other text. */
export function parseHours(text: string | undefined): WeekHours | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const week: Array<DayHours | null | undefined> = Array(7).fill(undefined);
  const dayAt = (s: string): number => DAY_SHORT.findIndex((d) => d.toLowerCase() === s.toLowerCase());
  for (const part of t.split(';')) {
    const m = /^\s*(every day|[a-z]{3}(?:\s+(?:to|and)\s+[a-z]{3})?)\s+(closed|(.+?)\s+to\s+(.+?))\s*$/i.exec(part);
    if (!m) return null;
    let from: number, to: number;
    if (m[1].toLowerCase() === 'every day') { from = 0; to = 6; } else {
      const words = m[1].split(/\s+/);
      from = dayAt(words[0]);
      to = words.length === 3 ? dayAt(words[2]) : from;
      if (from < 0 || to < from) return null;
      if (words.length === 3 && words[1].toLowerCase() === 'and' && to !== from + 1) return null;
    }
    let hours: DayHours | null = null;
    if (m[2].toLowerCase() !== 'closed') {
      const open = time24(m[3]);
      const close = time24(m[4]);
      if (!open || !close) return null;
      hours = { open, close };
    }
    for (let d = from; d <= to; d++) { if (week[d] !== undefined) return null; week[d] = hours; }
  }
  // A day the text does not name is closed (the form names them all, but an
  // owner's "Mon to Fri ..." alone still reads as the week it means).
  return week.map((d) => (d === undefined ? null : d));
}

const DAY_WORDS: Array<[RegExp, number]> = [
  [/^mon(day)?$/, 0], [/^tue(s|sday)?$/, 1], [/^wed(nesday)?$/, 2], [/^thu(r|rs|rsday)?$/, 3],
  [/^fri(day)?$/, 4], [/^sat(urday)?$/, 5], [/^sun(day)?$/, 6]
];
const dayOf = (w: string): number => DAY_WORDS.find(([re]) => re.test(w))?.[1] ?? -1;

/** "8am", "8 am", "8:30pm", "17:00" as "08:00" style, or null. A bare hour
 *  ("9", "5") reads as 9 AM, and as 5 PM for a closing time from 1 to 7. */
function looseTime(s: string, closing: boolean): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/.exec(s.trim());
  if (!m) return null;
  const ap = m[3]?.replace(/\./g, '');
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if (min > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === 'pm' ? 12 : 0); }
  else if (!m[2] && h >= 1 && h <= 7 && closing) h += 12;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * A best guess at hours typed in the usual ways ("Mon to Fri: 8am to 5 pm",
 * "Mon-Fri 9am-5pm; Sat 10-2", "Monday to Friday, 8:00 AM to 5:00 PM"), to
 * start "Set by day" from what the owner already wrote. Never saved by itself:
 * the owner sees the week and changes a day to save it. Null when it cannot
 * tell.
 */
export function guessHours(text: string | undefined): WeekHours | null {
  const exact = parseHours(text);
  if (exact) return exact;
  const t = (text ?? '').toLowerCase().replace(/[–—]/g, '-').trim();
  if (!t) return null;
  const week: Array<DayHours | null> = Array(7).fill(null);
  let found = false;
  for (const raw of t.split(/[;\n]/)) {
    const seg = raw.replace(/[,:](?=\s)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!seg) continue;
    const m = /^(every day|daily|[a-z]+)(?:\s*(?:to|-|through|thru)\s*([a-z]+))?\s+(closed|(.+?)\s*(?:to|-)\s*(.+))$/.exec(seg);
    if (!m) return null;
    let from: number, to: number;
    if (m[1] === 'every day' || m[1] === 'daily') { from = 0; to = 6; } else {
      from = dayOf(m[1]);
      to = m[2] ? dayOf(m[2]) : from;
      if (from < 0 || to < 0 || to < from) return null;
    }
    let hours: DayHours | null = null;
    if (m[3] !== 'closed') {
      const open = looseTime(m[4], false);
      const close = looseTime(m[5], true);
      if (!open || !close) return null;
      hours = { open, close };
    }
    for (let d = from; d <= to; d++) week[d] = hours;
    found = true;
  }
  return found ? week : null;
}
