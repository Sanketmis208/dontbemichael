/**
 * The languages a business serves customers in (owner, 2026-11-19: picked
 * from a list, not typed). The company profile keeps one line of text,
 * `languages`, that every agent reads and Company foundations may write
 * ("English, Spanish"); the picker shows it as one chip per language and
 * writes it back the same way. Pure, so it tests as a node module.
 */

/** Most a profile lists; more is rarely meant and crowds the field. */
export const MAX_LANGUAGES = 12;

/** The languages to pick from (BCP 47), named in the app's language. */
export const LANGUAGE_CODES = [
  'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'fi', 'is', 'pl', 'cs', 'sk', 'hu', 'ro', 'bg', 'el',
  'ru', 'uk', 'sr', 'hr', 'sl', 'lt', 'lv', 'et', 'ga', 'cy', 'ca', 'eu', 'gl', 'tr', 'ar', 'he', 'fa', 'ur', 'hi',
  'bn', 'pa', 'gu', 'mr', 'ta', 'te', 'kn', 'ml', 'si', 'ne', 'zh', 'yue', 'ja', 'ko', 'vi', 'th', 'id', 'ms', 'tl',
  'km', 'lo', 'my', 'mn', 'hy', 'ka', 'az', 'kk', 'uz', 'sw', 'am', 'so', 'yo', 'ig', 'ha', 'zu', 'xh', 'af', 'ht',
  'sq', 'mk', 'ps', 'ku', 'sm', 'to', 'haw', 'mi', 'ase'
] as const;

/** The line as a list: split on commas, semicolons, new lines and " and ";
 *  blanks and repeats (any case) dropped, first spelling kept. */
export function splitLanguages(text: string | undefined): string[] {
  const out: string[] = [];
  for (const raw of (text ?? '').split(/[,;\n]|\s+and\s+|\s*&\s*/i)) {
    const name = raw.trim().replace(/\.$/, '').trim();
    if (name && !out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/** The list as the one line agents read, or undefined when empty. */
export function joinLanguages(list: string[]): string | undefined {
  const clean = splitLanguages(list.join(',')).slice(0, MAX_LANGUAGES);
  return clean.length ? clean.join(', ') : undefined;
}

/** The names to pick from in `locale`, sorted, each once. English names when
 *  the runtime cannot name languages. */
export function languageNames(locale: string): string[] {
  let names: string[];
  try {
    const dn = new Intl.DisplayNames([locale, 'en'], { type: 'language' });
    names = LANGUAGE_CODES.map((c) => dn.of(c) ?? c);
  } catch {
    names = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Russian', 'Vietnamese', 'Tagalog'];
  }
  const seen = new Set<string>();
  const out = names
    .map((n) => n.charAt(0).toLocaleUpperCase(locale) + n.slice(1))
    .filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true)));
  try { return out.sort(new Intl.Collator(locale).compare); } catch { return out.sort(); }
}
