/**
 * What an Ask me card rests on (docs/designs/ask-me-source-links.md; owner,
 * 2026-11-08: "when agent is talking about changes from a page, email etc.
 * they should show the link always").
 *
 * An ask or report entry, and a member's triage filing, may carry
 * `"sources"`: the pages, records, emails and files the work read, and the
 * places the team looked when it found nothing. One reader here serves the
 * card (SourceRow) and Michael's tidy checks (ownerRequests.ts), so both see
 * the same list.
 *
 *   {"label": "...", "url": "https://..."}    Link: opens it
 *   {"label": "...", "id": "HubSpot company 1234"}   Named: a record with no link
 *   {"label": "...", "searched": true}         Searched: where the team looked
 *
 * The reader never throws. What it can't use it skips; a link it won't open
 * keeps its label as plain text, marked rejected, so the owner still sees
 * what it named and Michael is still told the card has no usable source.
 */
import { cardText } from './askMeRouting';
import { isAbsolutePathText } from './askFiles';
import { parseEmailHref } from './emailLink';

/** Units a label keeps (cardText's units, with its "…"). */
export const SOURCE_LABEL_MAX = 60;
/** A longer address is not one a member copied from a page. */
export const SOURCE_URL_MAX = 2048;
/** Links and named records shown on one entry; searched places, apart. */
export const SOURCE_LINKS_MAX = 6;
export const SOURCE_SEARCHED_MAX = 6;

export type Source =
  | { kind: 'web'; label: string; url: string }
  | { kind: 'email'; label: string; url: string }
  | { kind: 'file'; label: string; url: string }
  | { kind: 'named'; label: string; id: string }
  | { kind: 'rejected'; label: string }
  | { kind: 'searched'; label: string };

export interface EntrySources {
  /** Links, named records and rejected links, in the order given. */
  items: Source[];
  /** Places the team looked and found nothing. */
  searched: Source[];
}

/** What kind of link `url` is, or null when the card must not open it. */
function linkKind(url: string): 'web' | 'email' | 'file' | null {
  if (url.length > SOURCE_URL_MAX) return null;
  if (/^https?:\/\//i.test(url)) {
    try { return new URL(url).hostname ? 'web' : null; } catch { return null; }
  }
  if (/^email:/i.test(url)) return parseEmailHref(url) ? 'email' : null;
  if (isAbsolutePathText(url) && !/[\r\n]/.test(url)) return 'file';
  return null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The sources an ask, report or filing carries, ready to show and check. */
export function sourcesOf(entry: unknown): EntrySources {
  const out: EntrySources = { items: [], searched: [] };
  const raw = entry && typeof entry === 'object' ? (entry as { sources?: unknown }).sources : undefined;
  if (!Array.isArray(raw)) return out;
  const seen = new Set<string>();
  for (const s of raw) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const o = s as { label?: unknown; url?: unknown; id?: unknown; searched?: unknown };
    const label = cardText(text(o.label), SOURCE_LABEL_MAX);
    if (!label) continue;
    const url = text(o.url);
    if (url) {
      // A link wins over "searched": a place given with its address opens.
      const kind = linkKind(url);
      const key = kind ? `u:${url}` : `l:${label.toLowerCase()}`;
      if (seen.has(key) || out.items.length >= SOURCE_LINKS_MAX) continue;
      seen.add(key);
      out.items.push(kind ? { kind, label, url } : { kind: 'rejected', label });
      continue;
    }
    if (o.searched === true) {
      const key = `s:${label.toLowerCase()}`;
      if (seen.has(key) || out.searched.length >= SOURCE_SEARCHED_MAX) continue;
      seen.add(key);
      out.searched.push({ kind: 'searched', label });
      continue;
    }
    const key = `l:${label.toLowerCase()}`;
    if (seen.has(key) || out.items.length >= SOURCE_LINKS_MAX) continue;
    seen.add(key);
    const id = cardText(text(o.id), SOURCE_LABEL_MAX);
    // A label alone names nothing the owner can find: it shows, but counts
    // for nothing (a rejected link reads the same way).
    out.items.push(id ? { kind: 'named', label, id } : { kind: 'rejected', label });
  }
  return out;
}

/** Whether the entry gives the owner a way to the thing itself: a link the
 *  card opens, or a record named with its id. */
export function hasUsableSource(s: EntrySources): boolean {
  return s.items.some((x) => x.kind !== 'rejected');
}
