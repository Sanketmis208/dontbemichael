/**
 * Always allowed (owner, 2026-11-20): what the owner says is the business's
 * own and public, which the privacy check keeps as written when the team asks
 * Research something. The check treats any named person, company or brand as
 * private, so the owner's own name in a public web address (a releases page
 * under the owner's handle) was taken out of a question and Research had
 * nothing to read.
 *
 * Only the owner adds to it, in Settings, Research & privacy: no agent writes
 * settings. Company profile entries are offered as one click suggestions, never
 * added by themselves (an agent can fill some profile fields). Passwords and
 * keys are never let through, whatever the list says. Pure, so it tests as a
 * module.
 */

export const MAX_PUBLIC_TERMS = 30;
export const PUBLIC_TERM_MAX = 120;

/** One entry as kept: one line, at most PUBLIC_TERM_MAX characters, or null. */
export function cleanPublicTerm(v: unknown): string | null {
  if (typeof v !== 'string' || /[\r\n\t\v\f\u2028\u2029\u0000-\u001f\u007f]/.test(v)) return null;
  const t = v.normalize('NFKC').replace(/ +/g, ' ').trim();
  return t && t.length <= PUBLIC_TERM_MAX ? t : null;
}

/** The saved list: entries kept, repeats (any case) dropped, at most MAX. */
export function cleanPublicTerms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const t = cleanPublicTerm(v);
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= MAX_PUBLIC_TERMS) break;
  }
  return out;
}

/** What Company profile already says in public, offered as suggestions: the
 *  business and legal names, the owner, the website, the public email and the
 *  social links. Those already on the list are left out. */
export function publicSuggestions(
  p: { businessName?: string; legalName?: string; ceo?: string; website?: string; email?: string; social?: string[] },
  have: readonly string[]
): string[] {
  const out: string[] = [];
  for (const v of [p.businessName, p.legalName, p.ceo, p.website, p.email, ...(p.social ?? [])]) {
    const t = cleanPublicTerm(v);
    if (t && ![...have, ...out].some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text with every always allowed entry taken out (any case), for the
 *  shape checks: the business's own public email is not a contact detail. */
export function withoutPublicTerms(text: string, terms: readonly string[]): string {
  let out = text;
  for (const t of [...terms].sort((a, b) => b.length - a.length)) {
    if (t) out = out.replace(new RegExp(escape(t), 'giu'), ' ');
  }
  return out;
}
