/**
 * Always allowed (owner, 2026-11-20): what the owner says is the business's
 * own and public, which the privacy check keeps as written when the team asks
 * Research something. The check treats any named person, company or brand as
 * private, so the owner's own name in a public web address (a releases page
 * under the owner's handle) was taken out of a question and Research had
 * nothing to read.
 *
 * Only the owner adds to it, in Settings, Research & privacy: no agent writes
 * settings. Company profile's public details count as allowed too (owner,
 * 2026-11-26: "dontbemichael.com is already part of business owners company
 * profile"): the business and legal names, the owner, the website, the public
 * email and the social links. Agents fill only opening hours and the fiscal
 * year there (main/foundations.ts PROFILE_LINKS), never these. Passwords and
 * keys are never let through, whatever the list says. Pure, so it tests as a
 * module.
 */

import { MAX_SOCIAL, cleanCompanyProfile } from './companyProfile';

export const MAX_PUBLIC_TERMS = 30;
export const PUBLIC_TERM_MAX = 120;
/** Everything the check may read: the owner's full list and every public
 *  Company profile detail (five fields and the social links). */
export const MAX_ALLOWED_TERMS = MAX_PUBLIC_TERMS + 5 + MAX_SOCIAL;

/** One entry as kept: one line, at most PUBLIC_TERM_MAX characters, or null. */
export function cleanPublicTerm(v: unknown): string | null {
  if (typeof v !== 'string' || /[\r\n\t\v\f\u2028\u2029\u0000-\u001f\u007f]/.test(v)) return null;
  const t = v.normalize('NFKC').replace(/ +/g, ' ').trim();
  return t && t.length <= PUBLIC_TERM_MAX ? t : null;
}

/** The saved list: entries kept, repeats (any case) dropped, at most `max`
 *  (the list's cap; the check reads the list and Company profile together). */
export function cleanPublicTerms(value: unknown, max = MAX_PUBLIC_TERMS): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const t = cleanPublicTerm(v);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export type PublicProfile = { businessName?: string; legalName?: string; ceo?: string; website?: string; email?: string; social?: string[] };

/** What Company profile already says in public: the business and legal names,
 *  the owner, the website, the public email and the social links. Those
 *  already on the list are left out. */
export function publicSuggestions(
  p: PublicProfile,
  have: readonly string[]
): string[] {
  const out: string[] = [];
  for (const v of [p.businessName, p.legalName, p.ceo, p.website, p.email, ...(p.social ?? [])]) {
    const t = cleanPublicTerm(v);
    if (t && ![...have, ...out].some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Company profile as the check reads it: cleaned (each field tidied, at most
 *  MAX_SOCIAL links), with the business name. The app, the card and Settings
 *  all read it through this, so they agree on what is allowed. */
export function publicProfile(companyProfile: unknown, businessName: string | undefined): PublicProfile {
  return { ...cleanCompanyProfile(companyProfile), businessName };
}

/** Everything the check lets through: the owner's list, then what Company
 *  profile says in public (not counted against the list's cap). */
export function allowedPublicTerms(list: unknown, profile: PublicProfile | undefined): string[] {
  const own = cleanPublicTerms(list);
  return [...own, ...publicSuggestions(profile ?? {}, own)];
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A bare domain: dotted labels, no scheme, path, port or address. */
const isDomain = (t: string): boolean => /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+\p{L}{2,}$/u.test(t);

/**
 * What an entry stands for (owner, 2026-11-26: "a domain can be entirely
 * whitelisted or not"): a site's own address with no page (https://acme.com,
 * www.acme.com) is the domain acme.com. A page on someone else's site
 * (https://github.com/acme) stays as written: it never becomes github.com.
 */
export function publicKey(term: string): string {
  const t = term.trim();
  const site = /^https?:\/\/([^/\s?#@:]+)\/?$/i.exec(t);
  const host = (site ? site[1] : t).replace(/\.$/, '');
  return isDomain(host) ? host.replace(/^www\./i, '') : t;
}

/**
 * The pattern for one entry. A domain covers every page, subdomain (D1) and
 * email address (D2) under it: acme.com covers https://acme.com/blog,
 * blog.acme.com and jane@acme.com, never acme.com.evil.io, notacme.com or
 * acme-com.io. Anything else counts only where it stands whole, so an allowed
 * address never hides a longer one.
 */
function publicPattern(term: string): RegExp {
  const k = publicKey(term);
  if (isDomain(k)) {
    return new RegExp(`(?<![\\p{L}\\p{N}._%+@-])(?:[\\p{L}\\p{N}._%+-]+@)?(?:[\\p{L}\\p{N}-]+\\.)*${escape(k)}(?![\\p{L}\\p{N}@_-]|\\.[\\p{L}\\p{N}])`, 'giu');
  }
  return new RegExp(`(?<![\\p{L}\\p{N}@._%+-])${escape(k)}(?![\\p{L}\\p{N}@_-]|\\.[\\p{L}\\p{N}])`, 'giu');
}

/**
 * Whether allowing `term` lets the whole of `part` through: the card, the
 * answered card and Keep private ask this of one piece the check took out. The
 * entry must be all of the piece (a domain: the piece is an address, page or
 * subdomain on it), never a word inside a longer piece: an allowed business
 * name does not cover "Acme Bakery payroll figures", nor acme.com the page
 * https://evil.io/acme.com.
 */
export function coversPart(term: string, part: string): boolean {
  if (!term.trim()) return false;
  const k = publicKey(term);
  // Quotes, brackets and end punctuation around the piece are not part of it.
  const p = part.trim().replace(/^["'“‘(<[]+/u, '').replace(/["'”’)>\].,;:!?]+$/u, '');
  if (!p) return false;
  if (isDomain(k)) {
    return new RegExp(`^(?:https?:\\/\\/|mailto:)?(?:[\\p{L}\\p{N}._%+-]+@)?(?:[\\p{L}\\p{N}-]+\\.)*${escape(k)}\\.?(?::\\d{1,5})?(?:[/?#]\\S*)?$`, 'iu').test(p);
  }
  // An address that is not a whole site covers the pages under it, and an
  // email address its mailto: link.
  const under = /:\/\//.test(k) ? `(?:[/?#]\\S*)?` : '';
  const mail = /^[^\s@]+@[^\s@]+$/.test(k) ? '(?:mailto:)?' : '';
  return new RegExp(`^${mail}${escape(k.replace(/\/+$/, ''))}${under}$`, 'iu').test(p);
}

/**
 * The owner's entries a rewrite left out: for each entry the original has and
 * the rewrite does not, its words as written in the original (to name on the
 * card). A rewrite that still has the entry in another form (the bare domain
 * for a page on it) keeps it.
 */
export function droppedPublic(terms: readonly string[], original: string, rewrite: string): string[] {
  const out: string[] = [];
  for (const t of terms) {
    // Anywhere in the rewrite: it is a whole message, not one piece.
    if (!t.trim() || publicPattern(t).test(rewrite)) continue;
    for (const m of original.match(publicPattern(t)) ?? []) {
      const w = m.trim();
      if (w && !out.some((o) => o.toLowerCase() === w.toLowerCase())) out.push(w);
    }
  }
  return out;
}

/**
 * What the privacy check took out, one row per thing to decide: variants of
 * one site (acme.com, https://acme.com, https://www.acme.com/download) are one
 * row, keyed by the shortest of them as the domain. A row's key is what
 * Always allow adds; it covers every piece in the row. Order follows the
 * pieces' first appearance.
 */
export function groupKept(parts: readonly string[]): Array<{ key: string; parts: string[] }> {
  const groups: Array<{ key: string; parts: string[]; first: number }> = [];
  const order = parts.map((p, i) => ({ p, i })).sort((a, b) => publicKey(a.p).length - publicKey(b.p).length || a.i - b.i);
  for (const { p, i } of order) {
    const g = groups.find((x) => coversPart(x.key, p));
    if (g) { g.parts.push(p); g.first = Math.min(g.first, i); } else groups.push({ key: publicKey(p), parts: [p], first: i });
  }
  return groups.sort((a, b) => a.first - b.first).map(({ key, parts: ps }) => ({ key, parts: ps.sort((a, b) => parts.indexOf(a) - parts.indexOf(b)) }));
}

/** The text with every always allowed entry taken out (any case), for the
 *  shape checks: the business's own public email is not a contact detail. An
 *  allowed domain takes out its pages, subdomains and addresses with it
 *  (owner, 2026-11-26, D1 and D2); anything else only where it stands whole,
 *  so an allowed address never hides a longer one (acme.com.evil). */
export function withoutPublicTerms(text: string, terms: readonly string[]): string {
  let out = text;
  for (const t of [...terms].sort((a, b) => publicKey(b).length - publicKey(a).length)) {
    if (t.trim()) out = out.replace(publicPattern(t), ' ');
  }
  return out;
}
