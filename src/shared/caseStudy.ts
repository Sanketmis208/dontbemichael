/**
 * The case study (docs/designs/case-study.md): a customer story landing page
 * (D28) an owner can send us, built only from the office's own facts and Pulse
 * figures. We receive it as a web page to publish, with a PDF copy.
 *
 *   main gathers CaseStudyFacts ─► draftPrompt(facts) ─► runHiddenModel ─► parseDraft(reply)
 *                    │                                                        │
 *                    └──────────────► pageHtml(facts, edits) ◄────────────────┘
 *                                        │            │            │
 *                       screen preview (iframe)   HTML file   PDF window (main)
 *
 * One renderer for the preview and the PDF (eng red flag 6), and one facts
 * type for both the page and the prompt (red flag 8): the customers answer,
 * mail and memory are never in CaseStudyFacts, so neither can reach them.
 * Every number on the page is a Pulse figure (D4): the headline's number is
 * filled from the facts, never from text (D16), and drafted parts with a
 * number in them are refused (eng pass).
 */
import { cutText } from './cutText';
import { APP_NAME } from './appName';
import { formatTimes, normalizeTimes, type ScheduleLine, type WhenWords } from './scheduleTimes';
import { normalizeWeekly } from './weeklySchedule';

/** Where case studies go (D9). Main fixes the recipient; nothing else can set it. */
export const CASE_STUDY_TO = 'hello@dontbemichael.com';

export type Paper = 'letter' | 'a4';

/** The figures a headline or the band can be built from. */
export type HeadlineFigure = 'email' | 'task' | 'away' | 'sent' | 'check';
export const HEADLINE_FIGURES: readonly HeadlineFigure[] = ['email', 'task', 'away', 'sent', 'check'];

/** What a team row's number counts. */
export type MemberFigureKind = 'email' | 'sent' | 'task' | 'check' | 'routed';

export interface CaseMember {
  id: string;
  name: string;
  /** The role title ("Front desk"). */
  role: string;
  /** The stored role description, a team line's starting point (D13). */
  roleDescription?: string;
  /** Names of the member's scheduled jobs, for the draft. */
  jobs: string[];
  /** The member's running jobs and when they run, for the team chart (D28). */
  schedules?: Array<{ label: string; when: string }>;
  /** What the member is connected to ("Email", "QuickBooks"), by the Access
   *  tab's own rules (agentAccessSummary); never an address (D28). */
  tools?: string[];
  figure: { kind: MemberFigureKind; count: number } | null;
  isMichael: boolean;
}

export interface CaseFigures {
  email: number;
  sent: number;
  task: number;
  check: number;
  routed: number;
  ranMs: number;
  awayMs: number;
  /** What the team cost in the period, as Pulse shows it (D14). */
  spendUsd: number;
}

export interface HeroPalette { hero: string; tint: string; line: string; away: string; /** The headline's number (D23). */ highlight: string }

export interface CaseStudyFacts {
  paper: Paper;
  /** D8: off hides the name, logo and website and shows the type and city. */
  showName: boolean;
  businessName?: string;
  website?: string;
  businessType?: string;
  city?: string;
  industry?: string;
  serviceArea?: string;
  hours?: string;
  languages?: string;
  /** The foundations offer answer (never the customers answer). */
  offer?: string;
  /** Signs the quote only; never in the prompt. */
  ceoName?: string;
  members: CaseMember[];
  figures: CaseFigures;
  /** Hours each local day of the period, from Pulse's running records (D18). */
  days: Array<{ day: string; ms: number; awayMs: number }>;
  range: { from: string; to: string; days: number };
  appVersion: string;
  /** A PNG data URL of the kept logo, and its colors (D17). */
  logo?: string;
  palette?: HeroPalette | null;
}

export interface CaseStudyEdits {
  headline: { figure: HeadlineFigure; before: string; after: string } | null;
  subtitle: string;
  /** The Before paragraph (D28): what the office work was like before the team. */
  about: string;
  quote: string;
  team: Record<string, string>;
  why: string;
  /** The owner's own brand colour (#RRGGBB), over the logo's (owner, 2026-11-03). */
  brand?: string;
}

/** What the draft gave back; a part it couldn't give is left out. */
export interface CaseDraft {
  subtitle?: string;
  about?: string;
  why?: string;
  headlines: Partial<Record<HeadlineFigure, { before: string; after: string }>>;
  team: Record<string, string>;
}

// ---------------------------------------------------------------- the screen's calls

export type CasePeriod = 'last-30' | 'this-month';
export interface CaseInput { period: CasePeriod; showName: boolean }
export interface CaseSender { id: string; address: string; canSend: boolean; reason?: string }
/** A bundled face as bytes: the PDF window loads it as @font-face; the screen's
 *  preview adds it with FontFace, which the renderer's font-src 'self' allows. */
export interface CaseFont { family: string; weight: string; base64: string }
export interface CaseOpen { facts: CaseStudyFacts; fonts: CaseFont[]; senders: CaseSender[]; hasWork: boolean; to: string }

/** @font-face rules for the PDF window. */
export function fontFaceCss(fonts: CaseFont[]): string {
  return fonts.map((f) => `@font-face{font-family:'${f.family}';src:url(data:font/woff2;base64,${f.base64}) format('woff2');font-weight:${f.weight};font-style:normal}`).join('\n');
}
export type CaseLogo = { ok: true; logo: string; palette: HeroPalette } | { ok: false; reason: string };
export type CaseDraftResult = { ok: true; draft: CaseDraft } | { ok: false; reason: 'no-work' | 'failed' };
export type CaseSendOutcome =
  | { ok: true }
  | { ok: false; kind: 'failed'; reason: string }
  | { ok: false; kind: 'maybe-sent' }
  | { ok: false; kind: 'no-work' | 'no-permission' | 'no-mailbox' };
/** The case study being prepared in main (owner, 2026-11-03: the owner never
 *  waits on an empty frame). `ready` carries what the screen opens with. */
export type CasePrep =
  | { state: 'idle' }
  | { state: 'preparing'; input: CaseInput }
  | { state: 'ready'; input: CaseInput; draft: CaseDraft | null; logo: CaseLogo | null; hasWork: boolean;
      /** Prepared in the background and not yet opened or put off with Later:
       *  Michael's card on Ask me says it is ready (owner, 2026-11-04). */
      waiting?: boolean };
export type CaseSaveResult = { ok: true; path: string } | { ok: false; kind: 'no-work' | 'failed' | 'cancelled' };

/** Every member is on the page (owner, D27: the page may run past one).
 *  A bound only so a very large roster can't swamp the draft prompt. */
export const TEAM_ROWS = 60;

/** A continued page's top and bottom margin in the PDF copy (the first page is full bleed). */
export const CONTINUED_MARGIN_IN = 0.45;

/** The landing page's layout width (D28): the preview draws it at this width,
 *  the PDF copy zooms it to the paper, and the web page goes narrower on a phone. */
export const PAGE_W = 1040;

/** Where the page's call to action goes. */
export const SITE_URL = 'https://dontbemichael.com';

/** At most this many jobs on a member's card. */
export const CARD_JOBS = 3;

/** Length caps (eng pass): they keep each part short enough to read at a glance. */
export const CAPS = { subtitle: 140, about: 320, quote: 180, teamLine: 105, why: 200, headlineWords: 80 };

// ---------------------------------------------------------------- numbers (D4)

const DIGITS = /[0-9٠-٩۰-۹０-９]/;
const EN_WORDS = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|half|halves|quarters?|double|twice|triple|percent)\b/i;

/** A digit in any script, or an English number word. Quantity words count
 *  ("dozens", "half"): they are claims too (eng pass, EP-O5). */
export function hasNumber(text: string): boolean {
  if (DIGITS.test(text)) return true;
  return EN_WORDS.test(text);
}

const groupFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
/** Numbers in Latin digits, as in the app. */
export function fmtCount(n: number): string { return groupFmt.format(Math.round(n)); }
export function fmtUsd(n: number): string {
  const v = Math.max(0, n);
  return '$' + (v >= 10 ? groupFmt.format(Math.round(v)) : v.toFixed(2));
}
export const hoursOf = (ms: number): number => Math.round(ms / 3_600_000);

// ---------------------------------------------------------------- figures

/** The value a headline or band figure shows. */
export function figureValue(f: CaseFigures, k: HeadlineFigure): number {
  if (k === 'away') return hoursOf(f.awayMs);
  return f[k];
}

/** Any counted work in the period (D19). */
export function hasWork(f: CaseFigures): boolean {
  return f.email + f.sent + f.task + f.check > 0;
}

/** Up to three headline choices, one per nonzero figure (D16). */
export function headlineChoices(f: CaseFigures): HeadlineFigure[] {
  return HEADLINE_FIGURES.filter((k) => figureValue(f, k) > 0).slice(0, 3);
}

/** The band's numbers: the three strongest nonzero figures, then spend, always (D14). */
export function bandFigures(f: CaseFigures): HeadlineFigure[] {
  return HEADLINE_FIGURES.filter((k) => figureValue(f, k) > 0).slice(0, 3);
}

/** A team row's number (eng pass): the member's largest kind; Michael's is
 *  requests routed; none when the member did nothing countable. */
export function memberFigure(counts: { email: number; sent: number; task: number; check: number }, routed: number | null): CaseMember['figure'] {
  if (routed !== null) return routed > 0 ? { kind: 'routed', count: routed } : null;
  const kinds: Array<'email' | 'sent' | 'task' | 'check'> = ['email', 'sent', 'task', 'check'];
  const best = kinds.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  return counts[best] > 0 ? { kind: best, count: counts[best] } : null;
}

// ---------------------------------------------------------------- colour (D17)

type RGB = [number, number, number];
const hex = (c: RGB): string => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
function rgbOf(h: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lin(v: number): number { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
/** WCAG relative luminance. */
export function luminance(h: string): number { const [r, g, b] = rgbOf(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
/** WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function hsl([r, g, b]: RGB): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

function fromHsl(h: number, s: number, l: number): RGB {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** Our ink: the hero when a logo has no usable colour (D17). */
export const INK_PALETTE: HeroPalette = { hero: '#1E1B2E', tint: '#F0EFF5', line: '#DAD7EA', away: '#6C5CE7', highlight: '#C9C1FF' };

/**
 * The logo's main colour from RGBA pixels (main samples the logo at 32 px):
 * transparent, near white, near black and grey pixels are skipped, the most
 * common hue wins, and it must cover a twentieth of the solid pixels, so a
 * thin antialiased edge never decides. Null when no colour qualifies.
 */
export function logoColour(rgba: Uint8Array | number[]): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let solid = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    solid++;
    const c: RGB = [rgba[i], rgba[i + 1], rgba[i + 2]];
    const { h, s, l } = hsl(c);
    if (l > 0.92 || l < 0.08 || s < 0.15) continue;
    const k = Math.floor(h / 15) % 24;
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2];
    buckets.set(k, e);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || !solid || best.n < solid / 20) return null;
  return hex([best.r / best.n, best.g / best.n, best.b / best.n]);
}

/** The hero and its shades: darkened until white text passes 4.5:1 (D17),
 *  the tint and line light enough for ink-2 labels at 4.5:1, and the
 *  headline number's light tint of the hero's hue, at 3:1 on it (large
 *  bold text, D23). */
export function heroPalette(colour: string | null): HeroPalette {
  if (!colour) return INK_PALETTE;
  let c = rgbOf(colour);
  for (let i = 0; i < 60 && contrast(hex(c), '#FFFFFF') < 4.5; i++) c = mix(c, [0, 0, 0], 0.06);
  const white: RGB = [255, 255, 255];
  // The number's tint: the logo's own hue, light and kept saturated so it
  // still reads as the brand, lifted until it reads at 3:1 on the hero, the
  // WCAG bar for large bold text such as the headline; a light logo colour
  // needs the hero a little darker still (D23).
  const { h: hue, s: sat } = hsl(c);
  const tintFor = (h: RGB): RGB | null => {
    for (let l = 0.66; l <= 0.94; l += 0.02) {
      const cand = fromHsl(hue, Math.max(0.55, sat), l);
      if (contrast(hex(cand), hex(h)) >= 3) return cand;
    }
    return null;
  };
  let hl = tintFor(c);
  for (let i = 0; i < 40 && hl === null; i++) { c = mix(c, [0, 0, 0], 0.06); hl = tintFor(c); }
  return { hero: hex(c), tint: hex(mix(c, white, 0.9)), line: hex(mix(c, white, 0.78)), away: hex(mix(c, white, 0.35)), highlight: hex(hl ?? mix(c, white, 0.9)) };
}

// ---------------------------------------------------------------- page words

interface Words {
  caseStudy: string; before: string; theTeam: string; away: string; worked: string; result: string;
  awayLegend: string; aroundLegend: string; ofHours: (a: string, b: string) => string;
  source: (from: string, to: string) => string; made: string; version: string; more: (n: number) => string;
  band: Record<HeadlineFigure, string>; spend: (days: number) => string;
  member: Record<MemberFigureKind, string>;
  typeIn: (type: string, city: string) => string; aBusiness: string; theOwner: string; ownerOf: (b: string) => string;
  headline: Record<HeadlineFigure, (who: string) => { before: string; after: string }>;
  /** Built in subtitle and closing, both naming the product (D25). */
  subtitle: (who: string) => string; whyText: string;
  stripLabel: (a: string, b: string, from: string, to: string) => string;
  locked: string;
  /** The landing page's own words (D28). */
  stories: string; cta: string; platforms: string; closeTitle: (who: string) => string;
  industry: string; location: string; aiTeam: string; members: (n: number) => string; period: string;
  connected: string; span: (from: string, to: string) => string; runsTheOffice: string;
  /** The schedule words a member card's times are written in. */
  when: WhenWords;
}

const DAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const WORDS: Words = {
  caseStudy: `${APP_NAME} case study`, before: 'Before', theTeam: 'The team they built', away: 'While the owner was away', worked: 'Hours the office worked',
  result: 'The result', awayLegend: 'while the owner was away', aroundLegend: 'with the owner around',
  ofHours: (a, b) => `<b>${a}</b> of <b>${b}</b> hours`,
  source: (f, t) => `Counted by the app, ${f} to ${t}. Spend is everything the team cost in that period.`,
  made: "Made with Don't Be Michael", version: 'version', more: (n) => `and ${n} more`,
  band: { email: 'emails organized', task: 'tasks finished', away: 'hours of work while the owner was away', sent: 'emails sent', check: 'scheduled checks' },
  spend: (d) => `for the whole team, all ${d} days`,
  member: { email: 'emails', sent: 'sent', task: 'tasks', check: 'checks', routed: 'routed' },
  typeIn: (t, c) => (t && c ? `${t} in ${c}` : t || c), aBusiness: 'A small business', theOwner: 'The owner', ownerOf: (b) => `The owner, ${b}`,
  headline: {
    email: (w) => ({ before: `The ${APP_NAME} team at ${w} handled`, after: 'emails' }),
    task: (w) => ({ before: `The ${APP_NAME} team at ${w} finished`, after: 'tasks' }),
    away: (w) => ({ before: `The ${APP_NAME} team at ${w} worked`, after: 'hours while the owner was away' }),
    sent: (w) => ({ before: `The ${APP_NAME} team at ${w} sent`, after: 'emails' }),
    check: (w) => ({ before: `The ${APP_NAME} team at ${w} ran`, after: 'scheduled checks' })
  },
  subtitle: (w) => `${w} runs its office with ${APP_NAME}.`,
  whyText: `With ${APP_NAME}, a small business gets an office team that keeps the work moving.`,
  stripLabel: (a, b, f, t) => `Hours the office worked each day, ${f} to ${t}; ${a} of ${b} hours while the owner was away`,
  locked: "from Pulse, can't be edited",
  stories: 'Customer stories', cta: 'Build your team', platforms: 'Free to start, on Mac and Windows', closeTitle: (w) => `Run your office like ${w}.`,
  industry: 'Industry', location: 'Location', aiTeam: `${APP_NAME} team`, members: (n) => (n === 1 ? '1 member' : `${n} members`), period: 'Period',
  connected: 'Connected', span: (f, t) => `${f} to ${t}`, runsTheOffice: 'Runs the office and checks every job is finished',
  when: { day: (d) => DAY_EN[d], everyDay: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends', list: (i) => i.join(', '),
    and: (i) => (i.length > 1 ? `${i.slice(0, -1).join(', ')} and ${i[i.length - 1]}` : i[0]), at: (d, t) => `${d} at ${t}`, every: (n) => `Every ${n}`, span: (f, t) => `${f} to ${t}` }
};

/** A job's times (D28): its times lines, else its weekly days and time, else
 *  its interval, as the Schedules list reads them. */
export function caseWhen(m: { intervalMs: number; weekly?: unknown; times?: unknown }): string {
  const w = WORDS.when;
  const times = normalizeTimes(m.times);
  if (times) return formatTimes(times, w);
  const weekly = normalizeWeekly(m.weekly);
  if (weekly) return formatTimes([{ kind: 'at', days: weekly.days, minute: weekly.minute } as ScheduleLine], w);
  // A daily interval reads as words, not "Every 1d".
  if (m.intervalMs === 86_400_000) return w.everyDay;
  return formatTimes([{ kind: 'every', everyMs: m.intervalMs } as ScheduleLine], w);
}

/** Who the page is about: the name, or the type and city with D8 off. */
export function subjectOf(facts: Pick<CaseStudyFacts, 'showName' | 'businessName' | 'businessType' | 'city'>): string {
  const w = WORDS;
  if (facts.showName && facts.businessName?.trim()) return facts.businessName.trim();
  return w.typeIn(facts.businessType?.trim() ?? '', facts.city?.trim() ?? '') || w.aBusiness;
}

/** The built in headline words for a figure, used when the draft gives none
 *  or gives one that breaks the one number rule. */
export function builtInHeadline(facts: CaseStudyFacts, k: HeadlineFigure): { before: string; after: string } {
  // Inside a sentence a type reads "a bakery in Austin".
  const named = facts.showName && !!facts.businessName?.trim();
  const who = !named ? lowerFirst(subjectOf(facts), true) : subjectOf(facts);
  return WORDS.headline[k](who);
}

/** The built in subtitle and closing, both naming the product (D25). */
export function builtInSubtitle(facts: CaseStudyFacts): string {
  const named = facts.showName && !!facts.businessName?.trim();
  const who = !named ? lowerFirst(subjectOf(facts), true) : subjectOf(facts);
  const text = WORDS.subtitle(who);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function builtInWhy(facts: CaseStudyFacts): string {
  return WORDS.whyText;
}

/** The product's name in a drafted part (any apostrophe). */
export function namesProduct(text: string): boolean {
  return /don['\u2019]?t be michael/i.test(text);
}

function lowerFirst(s: string, article: boolean): string {
  const t = s.charAt(0).toLowerCase() + s.slice(1);
  return article && !/^(a|an|the) /i.test(t) ? `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t}` : t;
}

/** The quote's signature (D6, D8). */
export function quoteSignature(facts: CaseStudyFacts): string {
  const w = WORDS;
  if (!facts.showName || !facts.businessName?.trim()) return w.theOwner;
  return facts.ceoName?.trim() ? `${facts.ceoName.trim()}, ${facts.businessName.trim()}` : w.ownerOf(facts.businessName.trim());
}

/** With D8 off, text that still names the business or its website (a warning, not a block). */
export function namesBusiness(text: string, facts: Pick<CaseStudyFacts, 'businessName' | 'website'>): boolean {
  const t = text.toLowerCase();
  const name = facts.businessName?.trim().toLowerCase();
  const host = (facts.website ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  return !!((name && name.length > 2 && t.includes(name)) || (host && host.length > 3 && t.includes(host)));
}

// ---------------------------------------------------------------- the draft (D5, D13, D16)

/** The draft prompt, from CaseStudyFacts only. The name and website are in it
 *  only with D8 on; the CEO's name never is. */
export function draftPrompt(facts: CaseStudyFacts): string {
  const c = CAPS;
  const lines: string[] = [];
  const add = (label: string, v: string | undefined) => { if (v && v.trim()) lines.push(`${label}: ${v.trim()}`); };
  if (facts.showName) { add('Business name', facts.businessName); add('Website', facts.website); }
  add('Business type', facts.businessType);
  add('City', facts.city);
  add('Industry', facts.industry);
  add('Service area', facts.serviceArea);
  add('Hours', facts.hours);
  add('Languages served', facts.languages);
  add('What the business offers', facts.offer);
  const team = facts.members.slice(0, TEAM_ROWS).map((m) => {
    const bits = [`id ${m.id}`, `role ${m.role || 'team member'}`];
    if (m.roleDescription) bits.push(`description: ${m.roleDescription}`);
    if (m.jobs.length) bits.push(`scheduled jobs: ${m.jobs.slice(0, 5).join('; ')}`);
    if (m.isMichael) bits.push('runs the office and routes the work');
    return `- ${bits.join(', ')}`;
  });
  const figs = headlineChoices(facts.figures);
  return [
    `You write short parts of a customer story page about a small business whose office runs on ${APP_NAME}, an app where an AI team led by Michael does the office work: email, books, orders, scheduling. The case study is published by ${APP_NAME}. A person will read and edit every word before anything is sent.`,
    'Write in English.',
    'Rules:',
    '- Use only the facts below. Name no customer, no supplier and no person.',
    '- Write no numbers at all: no digits, no number words, no amounts such as "dozens" or "half". The app adds the measured numbers itself.',
    '- Plain, concrete words. No hype, no exclamation marks.',
    `- Call the team its ${APP_NAME} team, never just "an AI team". The subtitle and the why must each name ${APP_NAME}, written exactly like that.`,
    '',
    'Facts:',
    ...lines,
    'Team:',
    ...team,
    '',
    'Reply with one JSON object and nothing else:',
    `{"subtitle": "one line about the business and its AI team, at most ${c.subtitle} characters",`,
    ` "about": "the Before part of the story: what the office work was like before the ${APP_NAME} team, what piled up and what it cost the owner or the customers, at most ${c.about} characters",`,
    ` "why": "why a small business like this should have an AI office team, at most ${c.why} characters",`,
    ` "headlines": {${figs.map((k) => `"${k}": "headline words with {n} where the measured ${k === 'away' ? 'hours while the owner was away' : `count of ${k === 'email' ? 'emails organized' : k === 'task' ? 'tasks finished' : k === 'sent' ? 'emails sent' : 'scheduled checks'}`} goes"`).join(', ')}},`,
    ` "team": {"<id>": "one punchy sentence on how that member drives this business: what they handle and what it gets the owner or the customers, at most ${c.teamLine} characters"}}`,
    'Each headline holds {n} exactly once and names the business as it appears in the facts (or its type and city when no name is given).'
  ].join('\n');
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** A drafted part: one line, capped, and refused when it holds a number (D4). */
function part(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = oneLine(v);
  if (!t || hasNumber(t)) return undefined;
  return cutText(t, max);
}

/**
 * The model's reply as draft parts. Each part is checked on its own, so one
 * bad part leaves the others; a headline must hold `{n}` exactly once and no
 * other number (eng pass). Unparsable replies give an empty draft.
 */
export function parseDraft(reply: string, facts: CaseStudyFacts): CaseDraft {
  const out: CaseDraft = { headlines: {}, team: {} };
  const a = reply.indexOf('{'), b = reply.lastIndexOf('}');
  if (a < 0 || b <= a) return out;
  let j: Record<string, unknown>;
  try { j = JSON.parse(reply.slice(a, b + 1)) as Record<string, unknown>; } catch { return out; }
  if (!j || typeof j !== 'object') return out;
  const c = CAPS;
  // The subtitle and the closing must name the product (D25).
  const subtitle = part(j.subtitle, c.subtitle); if (subtitle && namesProduct(subtitle)) out.subtitle = subtitle;
  const about = part(j.about, c.about); if (about) out.about = about;
  const why = part(j.why, c.why); if (why && namesProduct(why)) out.why = why;
  const hl = j.headlines && typeof j.headlines === 'object' ? j.headlines as Record<string, unknown> : {};
  for (const k of headlineChoices(facts.figures)) {
    const v = hl[k];
    if (typeof v !== 'string') continue;
    const pieces = oneLine(v).split('{n}');
    if (pieces.length !== 2) continue;
    const [before, after] = pieces.map((p) => p.trim());
    if (hasNumber(before) || hasNumber(after) || (before + after).length > c.headlineWords || !(before || after)) continue;
    out.headlines[k] = { before, after };
  }
  const team = j.team && typeof j.team === 'object' ? j.team as Record<string, unknown> : {};
  for (const m of facts.members.slice(0, TEAM_ROWS)) {
    const line = part(team[m.id], c.teamLine);
    if (line) out.team[m.id] = line;
  }
  return out;
}

/** Parts the draft left out, so main can redraft once (eng pass). */
export function missingParts(d: CaseDraft, facts: CaseStudyFacts): string[] {
  const miss: string[] = [];
  if (!d.subtitle) miss.push('subtitle');
  if (!d.about) miss.push('about');
  if (!d.why) miss.push('why');
  for (const k of headlineChoices(facts.figures)) if (!d.headlines[k]) miss.push(`headline:${k}`);
  for (const m of facts.members.slice(0, TEAM_ROWS)) if (!d.team[m.id]) miss.push(`team:${m.id}`);
  return miss;
}

/** A second draft fills what the first left out; nothing the first gave is replaced. */
export function mergeDrafts(first: CaseDraft, second: CaseDraft): CaseDraft {
  return {
    subtitle: first.subtitle ?? second.subtitle,
    about: first.about ?? second.about,
    why: first.why ?? second.why,
    headlines: { ...second.headlines, ...first.headlines },
    team: { ...second.team, ...first.team }
  };
}

/** The edits a fresh screen starts from: the draft, built in headline words
 *  where it gave none, and a member's stored role description where it gave
 *  no team line (design review, Pass 2). */
export function startingEdits(facts: CaseStudyFacts, draft: CaseDraft, figure?: HeadlineFigure): CaseStudyEdits {
  const choices = headlineChoices(facts.figures);
  const k = figure && choices.includes(figure) ? figure : choices[0];
  const team: Record<string, string> = {};
  for (const m of facts.members.slice(0, TEAM_ROWS)) {
    const t = draft.team[m.id] ?? (m.roleDescription ? cutText(oneLine(m.roleDescription), CAPS.teamLine) : '');
    team[m.id] = t;
  }
  return {
    headline: k ? { figure: k, ...(draft.headlines[k] ?? builtInHeadline(facts, k)) } : null,
    subtitle: draft.subtitle ?? builtInSubtitle(facts),
    about: draft.about ?? '',
    quote: '',
    team,
    why: draft.why ?? builtInWhy(facts)
  };
}

// ---------------------------------------------------------------- the page

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The paper at 96 px per inch: the PDF copy zooms the page to its width. */
const PAPER: Record<Paper, { w: number; css: string }> = {
  letter: { w: 816, css: 'letter' },
  a4: { w: 794, css: 'A4' }
};

/** The long date of a YYYY-MM-DD day. */
export function dayLabel(day: string, year = false): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), numberingSystem: 'latn' }).format(dt);
}

function initials(s: string): string {
  // Words that start with a letter only: "Cedar & Pine" is CP, not C&.
  const w = s.trim().split(/\s+/).filter((x) => /^\p{L}/u.test(x));
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || 'M';
}

/** The Struck M mark (branding/logo/mark/struck-m-light.svg), inline. */
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" aria-hidden="true" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="1" y="14" width="1" height="1" fill="#FF6B6B"/><rect x="1" y="15" width="1" height="1" fill="#FF6B6B"/><rect x="2" y="3" width="1" height="1" fill="#1A1320"/><rect x="2" y="4" width="1" height="1" fill="#1A1320"/><rect x="2" y="5" width="1" height="1" fill="#1A1320"/><rect x="2" y="6" width="1" height="1" fill="#1A1320"/><rect x="2" y="7" width="1" height="1" fill="#1A1320"/><rect x="2" y="8" width="1" height="1" fill="#1A1320"/><rect x="2" y="9" width="1" height="1" fill="#1A1320"/><rect x="2" y="10" width="1" height="1" fill="#1A1320"/><rect x="2" y="11" width="1" height="1" fill="#1A1320"/><rect x="2" y="12" width="1" height="1" fill="#1A1320"/><rect x="2" y="13" width="1" height="1" fill="#FF6B6B"/><rect x="2" y="14" width="1" height="1" fill="#FF6B6B"/><rect x="3" y="3" width="1" height="1" fill="#1A1320"/><rect x="3" y="4" width="1" height="1" fill="#1A1320"/><rect x="3" y="5" width="1" height="1" fill="#1A1320"/><rect x="3" y="6" width="1" height="1" fill="#1A1320"/><rect x="3" y="7" width="1" height="1" fill="#1A1320"/><rect x="3" y="8" width="1" height="1" fill="#1A1320"/><rect x="3" y="9" width="1" height="1" fill="#1A1320"/><rect x="3" y="10" width="1" height="1" fill="#1A1320"/><rect x="3" y="11" width="1" height="1" fill="#1A1320"/><rect x="3" y="12" width="1" height="1" fill="#FF6B6B"/><rect x="3" y="13" width="1" height="1" fill="#FF6B6B"/><rect x="4" y="3" width="1" height="1" fill="#1A1320"/><rect x="4" y="4" width="1" height="1" fill="#1A1320"/><rect x="4" y="11" width="1" height="1" fill="#FF6B6B"/><rect x="4" y="12" width="1" height="1" fill="#FF6B6B"/><rect x="5" y="4" width="1" height="1" fill="#1A1320"/><rect x="5" y="5" width="1" height="1" fill="#1A1320"/><rect x="5" y="10" width="1" height="1" fill="#FF6B6B"/><rect x="5" y="11" width="1" height="1" fill="#FF6B6B"/><rect x="6" y="5" width="1" height="1" fill="#1A1320"/><rect x="6" y="6" width="1" height="1" fill="#1A1320"/><rect x="6" y="9" width="1" height="1" fill="#FF6B6B"/><rect x="6" y="10" width="1" height="1" fill="#FF6B6B"/><rect x="7" y="6" width="1" height="1" fill="#1A1320"/><rect x="7" y="7" width="1" height="1" fill="#1A1320"/><rect x="7" y="8" width="1" height="1" fill="#FF6B6B"/><rect x="7" y="9" width="1" height="1" fill="#FF6B6B"/><rect x="8" y="6" width="1" height="1" fill="#1A1320"/><rect x="8" y="7" width="1" height="1" fill="#FF6B6B"/><rect x="8" y="8" width="1" height="1" fill="#FF6B6B"/><rect x="9" y="5" width="1" height="1" fill="#1A1320"/><rect x="9" y="6" width="1" height="1" fill="#FF6B6B"/><rect x="9" y="7" width="1" height="1" fill="#FF6B6B"/><rect x="10" y="4" width="1" height="1" fill="#1A1320"/><rect x="10" y="5" width="1" height="1" fill="#FF6B6B"/><rect x="10" y="6" width="1" height="1" fill="#FF6B6B"/><rect x="11" y="3" width="1" height="1" fill="#1A1320"/><rect x="11" y="4" width="1" height="1" fill="#FF6B6B"/><rect x="11" y="5" width="1" height="1" fill="#FF6B6B"/><rect x="12" y="3" width="1" height="1" fill="#FF6B6B"/><rect x="12" y="4" width="1" height="1" fill="#FF6B6B"/><rect x="12" y="5" width="1" height="1" fill="#1A1320"/><rect x="12" y="6" width="1" height="1" fill="#1A1320"/><rect x="12" y="7" width="1" height="1" fill="#1A1320"/><rect x="12" y="8" width="1" height="1" fill="#1A1320"/><rect x="12" y="9" width="1" height="1" fill="#1A1320"/><rect x="12" y="10" width="1" height="1" fill="#1A1320"/><rect x="12" y="11" width="1" height="1" fill="#1A1320"/><rect x="12" y="12" width="1" height="1" fill="#1A1320"/><rect x="12" y="13" width="1" height="1" fill="#1A1320"/><rect x="13" y="2" width="1" height="1" fill="#FF6B6B"/><rect x="13" y="3" width="1" height="1" fill="#FF6B6B"/><rect x="13" y="4" width="1" height="1" fill="#1A1320"/><rect x="13" y="5" width="1" height="1" fill="#1A1320"/><rect x="13" y="6" width="1" height="1" fill="#1A1320"/><rect x="13" y="7" width="1" height="1" fill="#1A1320"/><rect x="13" y="8" width="1" height="1" fill="#1A1320"/><rect x="13" y="9" width="1" height="1" fill="#1A1320"/><rect x="13" y="10" width="1" height="1" fill="#1A1320"/><rect x="13" y="11" width="1" height="1" fill="#1A1320"/><rect x="13" y="12" width="1" height="1" fill="#1A1320"/><rect x="13" y="13" width="1" height="1" fill="#1A1320"/><rect x="14" y="1" width="1" height="1" fill="#FF6B6B"/><rect x="14" y="2" width="1" height="1" fill="#FF6B6B"/></svg>';

export interface PageOptions {
  /** @font-face rules for Sora and IBM Plex Mono (main reads the bundled files). */
  fontCss: string;
  /** 'web' (the default) is the landing page we publish and the screen's
   *  preview; 'print' is the same page zoomed to the paper for the PDF copy. */
  mode?: 'web' | 'print';
}

/**
 * The case study as a customer story landing page (D28): the setup blueprint
 * (owner, Michael and every member, with their jobs, tools and numbers) told
 * inside the story (outcome headline, snapshot, numbers, Before, quote, the
 * result, a closing call to action). The preview, the HTML file and the PDF
 * copy all draw this, so they match, and all are read only: the owner changes
 * the words in the screen's panel (D22). The headline's number is always
 * filled from the figures, between its words (D16).
 */
export function pageHtml(facts: CaseStudyFacts, edits: CaseStudyEdits, opts: PageOptions): string {
  const w = WORDS;
  const f = facts.figures;
  const pal = facts.showName && facts.palette ? facts.palette : INK_PALETTE;
  const print = opts.mode === 'print';
  const paper = PAPER[facts.paper];
  const from = dayLabel(facts.range.from);
  const to = dayLabel(facts.range.to, true);
  const who = subjectOf(facts);
  // Inside a sentence a type reads "a bakery in Austin".
  const closeWho = !(facts.showName && facts.businessName?.trim()) ? lowerFirst(who, true) : who;

  const head = edits.headline;
  const headLen = head ? [...`${head.before} ${head.after}`].length : 0;
  const headSize = headLen > 72 ? ' longer' : headLen > 56 ? ' long' : '';
  const headline = head
    ? `<h1 class="headline${headSize}"><span>${esc(head.before)}</span> <span class="lock" aria-label="${esc(`${fmtCount(figureValue(f, head.figure))}, ${w.locked}`)}">${fmtCount(figureValue(f, head.figure))}</span> <span>${esc(head.after)}</span></h1>`
    : '';

  // The business's own brand leads the page (owner, 2026-11-03): its logo
  // large in the hero, its colour behind it; initials when it has no logo.
  const logoImg = facts.showName && facts.logo && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(facts.logo) ? facts.logo : null;
  const brandmark = logoImg ? `<div class="brandmark"><img src="${logoImg}" alt="${esc(facts.businessName ?? '')}"></div>` : '';
  const logo = facts.showName && !logoImg ? `<div class="logo">${esc(initials(facts.businessName ?? ''))}</div>` : '';
  const site = facts.showName ? facts.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') : undefined;

  // The snapshot: who they are and what the team is connected to.
  const tools = [...new Set(facts.members.flatMap((m) => m.tools ?? []))];
  const snapRows: Array<[string, string]> = [];
  if (facts.businessType?.trim()) snapRows.push([w.industry, esc(facts.businessType.trim())]);
  if (facts.city?.trim()) snapRows.push([w.location, esc(facts.city.trim())]);
  snapRows.push([w.aiTeam, esc(w.members(facts.members.length))]);
  snapRows.push([w.period, esc(w.span(from, to))]);
  if (tools.length) snapRows.push([w.connected, `<span class="pills">${tools.map((t) => `<i>${esc(t)}</i>`).join('')}</span>`]);
  const snapshot = `<aside class="snap">
    <div class="snap-top">${logo}<div><b>${esc(who)}</b>${site ? `<span>${esc(site)}</span>` : ''}</div></div>
    <dl>${snapRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
  </aside>`;

  const band = bandFigures(f).map((k) => `<div class="stat"><div class="n">${fmtCount(figureValue(f, k))}</div><div class="l">${esc(w.band[k])}</div></div>`);
  band.push(`<div class="stat"><div class="n">${fmtUsd(f.spendUsd)}</div><div class="l">${esc(w.spend(facts.range.days))}</div></div>`);

  // The team as the office is set up: the owner, Michael, then every member.
  const shown = facts.members.slice(0, TEAM_ROWS);
  const card = (m: CaseMember): string => {
    const jobs = (m.schedules ?? []).slice(0, CARD_JOBS);
    const extra = (m.schedules ?? []).length - jobs.length;
    const line = edits.team[m.id] ?? '';
    return `<div class="m-card${m.isMichael ? ' lead' : ''}">
      <div class="m-head"><div class="av">${esc(initials(m.name))}</div><div class="m-who"><b>${esc(m.name)}</b><span>${esc(m.role)}</span></div></div>
      ${line ? `<p class="m-line">${esc(line)}</p>` : m.isMichael ? `<p class="m-line">${esc(w.runsTheOffice)}</p>` : ''}
      ${jobs.length ? `<ul class="m-jobs">${jobs.map((j) => `<li><b>${esc(j.label)}</b><span>${esc(j.when)}</span></li>`).join('')}${extra > 0 ? `<li class="more">${esc(w.more(extra))}</li>` : ''}</ul>` : ''}
      ${(m.tools ?? []).length ? `<div class="pills">${(m.tools ?? []).map((t) => `<i>${esc(t)}</i>`).join('')}</div>` : ''}
      ${m.figure ? `<div class="m-fig"><span>${esc(w.member[m.figure.kind])}</span><b>${fmtCount(m.figure.count)}</b></div>` : ''}
    </div>`;
  };
  const lead = shown.find((m) => m.isMichael);
  const rest = shown.filter((m) => !m.isMichael);
  const owner = `<div class="owner"><div class="av">${esc(initials(facts.showName && facts.ceoName?.trim() ? facts.ceoName : w.theOwner))}</div><div class="m-who"><b>${esc(facts.showName && facts.ceoName?.trim() ? facts.ceoName.trim() : w.theOwner)}</b>${facts.showName && facts.ceoName?.trim() ? `<span>${esc(w.theOwner)}</span>` : ''}</div></div>`;
  const org = `<div class="org">${owner}<div class="vline"></div>${lead ? `${card(lead)}${rest.length ? '<div class="vline"></div>' : ''}` : ''}${rest.length ? `<div class="grid">${rest.map(card).join('')}</div>` : ''}</div>`;

  const awayH = hoursOf(f.awayMs), ranH = hoursOf(f.ranMs);
  const max = Math.max(1, ...facts.days.map((d) => d.ms));
  const bars = facts.days.map((d) => {
    const h = (d.ms / max) * 100;
    const a = d.ms > 0 ? (d.awayMs / d.ms) * 100 : 0;
    return `<div class="bar" style="height:${h.toFixed(1)}%"><div class="run" style="flex:${(100 - a).toFixed(1)}"></div><div class="aw" style="flex:${a.toFixed(1)}"></div></div>`;
  }).join('');
  const strip = ranH > 0 ? `<div class="awaybox">
      <div class="big">${awayH > 0 ? w.ofHours(fmtCount(awayH), fmtCount(ranH)) : `<b>${fmtCount(ranH)}</b>`}</div>
      <div class="big-l">${esc(awayH > 0 ? w.away : w.worked)}</div>
      <div class="strip" role="img" aria-label="${esc(w.stripLabel(fmtCount(awayH), fmtCount(ranH), from, to))}">${bars}</div>
      <div class="strip-x"><span>${esc(from)}</span><span>${esc(dayLabel(facts.range.to))}</span></div>
      ${awayH > 0 ? `<div class="legend"><span><i class="k-aw"></i>${esc(w.awayLegend)}</span><span><i class="k-run"></i>${esc(w.aroundLegend)}</span></div>` : ''}
    </div>` : '';

  // Numbered chapters, only the ones the page has.
  const chapters: Array<[string, string, string]> = [];
  if (edits.about.trim()) chapters.push(['before', w.before, `<p class="prose">${esc(edits.about)}</p>`]);
  chapters.push(['team', w.theTeam, org]);
  const chapter = ([id, title, body]: [string, string, string], i: number): string =>
    `<section class="ch ch-${id}"><div class="wrap"><div class="ch-label"><div class="num">${String(i + 1).padStart(2, '0')}</div><h2>${esc(title)}</h2></div><div class="ch-body">${body}</div></div></section>`;
  const quote = edits.quote
    ? `<section class="quote"><div class="wrap"><figure><blockquote>${esc(edits.quote)}</blockquote><figcaption><div class="av">${esc(initials(facts.showName && facts.ceoName?.trim() ? facts.ceoName : w.theOwner))}</div><span>${esc(quoteSignature(facts))}</span></figcaption></figure></div></section>`
    : '';
  const result = strip ? chapter(['result', w.result, strip], chapters.length) : '';

  const narrow = print ? '' : `@media (max-width:760px){
 .wrap{padding:0 16px}
 .hero{padding:32px 0 28px}.brandmark img{height:38px;max-width:200px}.hero .wrap,.ch .wrap,.close .wrap{grid-template-columns:1fr;gap:24px}
 .headline,.headline.long,.headline.longer{font-size:32px;line-height:38px}
 .sub,.prose{font-size:16px;line-height:26px}
 .band .wrap{grid-template-columns:1fr 1fr}.stat{padding:20px 0}.stat:nth-child(odd){padding-inline-start:0;border:none}
 .stat .n{font-size:30px;line-height:34px}
 .ch{padding:44px 0}.grid{grid-template-columns:1fr}.lead{width:100%}
 .quote{padding:48px 0}.quote blockquote{font-size:22px;line-height:31px}
 .close h2{font-size:26px;line-height:32px}
 nav .crumb{display:none}
}`;

  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(`${who} · ${w.caseStudy}`)}</title><style>
${opts.fontCss}
${print ? `@page{size:${paper.css};margin:${CONTINUED_MARGIN_IN}in 0}
@page :first{margin:0}` : ''}
:root{--hero:${pal.hero};--tint:${pal.tint};--hline:${pal.line};--aw:${pal.away};--hl:${pal.highlight};--ink:#1E1B2E;--ink2:#4A4660;--ink3:#5E5A76;--line:#E8E6F2}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff}
body{font-family:Sora,"PingFang SC","Noto Sans SC","SF Arabic","Noto Sans Arabic",system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:inherit}
.mono,.num,.strip-x,.src{font-family:"IBM Plex Mono",ui-monospace,monospace;letter-spacing:0}
.page{${print ? `width:${PAGE_W}px;zoom:${(paper.w / PAGE_W).toFixed(4)}` : 'width:100%'};background:#fff}
.wrap{max-width:${PAGE_W}px;margin:0 auto;padding:0 40px}
.m-card,.owner,.stat,.quote,.awaybox,.close,.snap,.ch-label,.prose{break-inside:avoid}
nav{border-bottom:1px solid var(--line)}
nav .wrap{display:flex;align-items:center;height:60px;gap:10px;font-size:13px}
nav .mark{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:#fff;border:1px solid var(--line)}
nav .mark svg{width:16px;height:16px}
nav .crumb{color:var(--ink3)}
/* The business's colour carries the page: hero, quote, buttons, tints (owner, 2026-11-03). */
.btn{display:inline-block;background:var(--hero);color:#fff;text-decoration:none;font-weight:600;border-radius:999px}
nav .btn{margin-inline-start:auto;padding:9px 16px;font-size:13px}
.hero{padding:56px 0 52px;background:var(--hero);color:#fff}
.hero .wrap{display:grid;grid-template-columns:1.5fr 1fr;gap:48px;align-items:end}
.brandmark{display:inline-flex;align-items:center;background:#fff;border-radius:14px;padding:10px 16px;margin-bottom:26px;box-shadow:0 10px 30px -18px rgba(0,0,0,.45)}
.brandmark img{display:block;height:48px;width:auto;max-width:260px;object-fit:contain}
.eyebrow{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.82)}
.headline{margin-top:14px;font-weight:600;font-size:44px;line-height:52px;letter-spacing:-.035em}
.headline.long{font-size:38px;line-height:46px}
.headline.longer{font-size:33px;line-height:40px}
/* The headline's number: a light tint of the hero, no box (D23). */
.lock{font-weight:700;color:var(--hl);white-space:nowrap}
.sub{margin-top:18px;font-size:18px;line-height:29px;color:rgba(255,255,255,.9);font-weight:300;max-width:600px}
.snap{background:#fff;color:var(--ink);border-radius:18px;padding:22px;box-shadow:0 24px 60px -30px rgba(0,0,0,.5)}
.snap-top{display:flex;gap:12px;align-items:center;padding-bottom:16px;border-bottom:1px solid var(--line)}
.snap-top b{display:block;font-size:15px;line-height:20px}
.snap-top span{display:block;font-size:12px;line-height:16px;color:var(--ink3)}
.logo{width:46px;height:46px;border-radius:12px;background:var(--hero);display:grid;place-items:center;font-weight:700;font-size:16px;color:#fff;flex:none;overflow:hidden}
.logo img{width:100%;height:100%;object-fit:contain;background:#fff}
.snap dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin-top:16px;font-size:13px;line-height:18px}
.snap dt{color:var(--ink3)}
.snap dd{font-weight:500;text-align:end}
.pills{display:flex;flex-wrap:wrap;gap:6px}
.snap .pills{justify-content:flex-end}
.pills i{font-style:normal;font-size:11px;line-height:16px;background:var(--tint);color:var(--hero);padding:2px 8px;border-radius:999px;font-weight:500}
.band{background:var(--tint);border-bottom:1px solid var(--hline)}
.band .wrap{display:grid;grid-template-columns:repeat(${band.length},1fr)}
.stat{padding:30px 0 22px}
.stat+.stat{padding-inline-start:24px;border-inline-start:1px solid var(--hline)}
/* The band's numbers in the page's Sora: a mono comma left a gap ("4, 874"). */
.stat .n{font-weight:600;font-size:40px;line-height:44px;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
.stat .l{margin-top:8px;font-size:14px;line-height:20px;color:var(--ink2);max-width:210px}
.src{grid-column:1/-1;font-size:11px;line-height:15px;color:var(--ink3);padding-bottom:14px}
.ch{padding:72px 0}
.ch+.ch{padding-top:8px}
.ch .wrap{display:grid;grid-template-columns:190px 1fr;gap:40px}
.ch-label .num{font-size:12px;color:var(--hero);font-weight:500}
.ch-label h2{margin-top:6px;font-size:21px;line-height:27px;font-weight:600;letter-spacing:-.02em}
.prose{font-size:19px;line-height:32px;color:var(--ink2);font-weight:300;max-width:640px}
.org{display:flex;flex-direction:column;align-items:center;background-color:var(--tint);background-image:radial-gradient(var(--hline) 1px,transparent 1px);background-size:18px 18px;border:1px solid var(--line);border-radius:20px;padding:28px 22px}
.vline{width:2px;height:22px;background:var(--hline)}
.owner{display:flex;gap:10px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px 16px}
.owner .av{background:var(--ink);color:#fff}
.av{width:36px;height:36px;border-radius:50%;background:var(--tint);color:var(--hero);display:grid;place-items:center;font-weight:600;font-size:13px;flex:none}
.m-who b{display:block;font-size:15px;line-height:20px;font-weight:600}
.m-who span{display:block;font-size:12px;line-height:16px;color:var(--ink3)}
.m-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 10px 30px -24px rgba(30,27,46,.4);display:flex;flex-direction:column;gap:10px}
.lead{width:440px;border:2px solid var(--hero)}
.lead .av{background:var(--hero);color:#fff}
.m-head{display:flex;gap:10px;align-items:center}
.m-line{font-size:13px;line-height:20px;color:var(--ink2)}
.m-jobs{list-style:none;display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:16px}
.m-jobs li{display:flex;flex-direction:column;padding-inline-start:10px;border-inline-start:2px solid var(--hline)}
.m-jobs b{font-weight:500}
.m-jobs span{color:var(--ink3)}
.m-jobs .more{color:var(--ink3);border:none;padding:0}
.m-fig{margin-top:auto;padding-top:10px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--ink3)}
.m-fig b{font-size:20px;line-height:24px;color:var(--ink);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.grid{width:100%;display:grid;grid-template-columns:repeat(${rest.length >= 3 ? 3 : Math.max(1, rest.length)},1fr);gap:12px;padding-top:22px;border-top:2px solid var(--hline);border-radius:12px 12px 0 0}
.quote{background:var(--hero);color:#fff;padding:80px 0}
.quote blockquote{font-size:32px;line-height:44px;letter-spacing:-.025em;font-weight:500;max-width:820px}
.quote blockquote::before{content:"\\201C";display:block;font-size:80px;line-height:56px;color:var(--hl)}
.quote figcaption{margin-top:24px;display:flex;gap:12px;align-items:center;font-size:14px;color:rgba(255,255,255,.82)}
.quote figcaption .av{background:rgba(255,255,255,.16);color:#fff}
.big{font-size:18px;line-height:28px;color:var(--ink2)}
.big b{font-size:34px;line-height:40px;font-weight:600;color:var(--ink);letter-spacing:-.03em}
.big-l{font-size:15px;line-height:22px;color:var(--ink2);font-weight:300}
.strip{display:flex;align-items:flex-end;gap:4px;height:130px;margin-top:22px;border-bottom:1px solid var(--line)}
.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;border-radius:3px 3px 0 0;overflow:hidden;min-height:1px}
.bar .run{background:#E4E1EC}
.bar .aw{background:var(--aw)}
.strip-x{display:flex;justify-content:space-between;font-size:11px;line-height:15px;color:var(--ink3);margin-top:6px}
.legend{display:flex;gap:16px;font-size:12px;line-height:16px;color:var(--ink2);margin-top:12px}
.legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-inline-end:6px}
.k-aw{background:var(--aw)}.k-run{background:#E4E1EC}
.close{padding:72px 0;background:var(--tint);border-top:1px solid var(--hline)}
.close .wrap{display:grid;grid-template-columns:1fr auto;gap:40px;align-items:center}
.close h2{font-size:34px;line-height:42px;letter-spacing:-.03em;font-weight:600}
.close p{margin-top:12px;font-size:17px;line-height:27px;color:var(--ink2);font-weight:300;max-width:600px}
.close .btn{padding:15px 26px;font-size:15px}
.close .go{text-align:center}
.close .go span{display:block;margin-top:10px;font-size:12px;color:var(--ink3)}
footer .wrap{display:flex;align-items:center;gap:8px;padding-block:20px;font-size:12px;color:var(--ink3)}
footer .url{margin-inline-start:auto;font-family:"IBM Plex Mono",monospace;font-weight:500;color:var(--ink)}
${narrow}
</style></head><body><article class="page" aria-label="${esc(w.caseStudy)}">
<nav><div class="wrap"><span class="mark">${MARK}</span><b>${esc(APP_NAME)}</b><span class="crumb">/ ${esc(w.stories)}</span><a class="btn" href="${SITE_URL}">${esc(w.cta)}</a></div></nav>
<header class="hero"><div class="wrap">
  <div>${brandmark}<div class="eyebrow">${esc([w.caseStudy, facts.businessType?.trim()].filter(Boolean).join(' · '))}</div>${headline}<p class="sub">${esc(edits.subtitle)}</p></div>
  ${snapshot}
</div></header>
<section class="band"><div class="wrap">${band.join('')}<div class="src">${esc(w.source(from, to))}</div></div></section>
${chapters.map(chapter).join('\n')}
${quote}
${result}
<section class="close"><div class="wrap">
  <div><h2>${esc(w.closeTitle(closeWho))}</h2><p>${esc(edits.why)}</p></div>
  <div class="go"><a class="btn" href="${SITE_URL}">${esc(w.cta)}</a><span>${esc(w.platforms)}</span></div>
</div></section>
<footer><div class="wrap">${MARK}<span>${esc(w.made)} · ${esc(w.version)} ${esc(facts.appVersion)}</span><span class="url">dontbemichael.com</span></div></footer>
</article></body></html>`;
}

/** The email that carries the page (D10, D11). */
export function caseStudyEmail(facts: CaseStudyFacts): { subject: string; body: string } {
  const who = subjectOf(facts);
  return {
    subject: `Case study: ${who}`,
    body: `Attached is the case study for ${who}, made with Don't Be Michael: the web page to publish (case-study.html) and a PDF copy.\n\nDon't Be Michael may publish this on its website, and will take it down if I ask. A reply to this email asking for removal is enough.`
  };
}
