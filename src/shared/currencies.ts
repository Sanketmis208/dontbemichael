/**
 * The currency list in the company profile (owner, 2026-11-19: a list of
 * bare codes was hard to pick from). Each currency is named in the app's
 * language with its code ("US Dollar (USD)"), sorted by name, and the common
 * ones come first. The profile still saves the code, which agents read.
 * Pure, so it tests as a node module.
 */

/** Shown first: the currencies most businesses use. */
export const COMMON_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'INR', 'JPY', 'CNY', 'HKD', 'SGD', 'CHF', 'MXN', 'BRL', 'ZAR', 'AED'
] as const;

export interface CurrencyOption { code: string; label: string }

/** "US Dollar (USD)", or the code alone when the runtime cannot name it. */
export function currencyLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale, 'en'], { type: 'currency' }).of(code);
    if (name && name !== code) return `${name.charAt(0).toLocaleUpperCase(locale)}${name.slice(1)} (${code})`;
  } catch { /* the code alone */ }
  return code;
}

/** The common currencies (those the runtime knows) in their fixed order, then
 *  every other one sorted by name. */
export function currencyOptions(codes: string[], locale: string): { common: CurrencyOption[]; rest: CurrencyOption[] } {
  const known = new Set(codes);
  const common = COMMON_CURRENCIES.filter((c) => known.has(c)).map((code) => ({ code, label: currencyLabel(code, locale) }));
  const top = new Set<string>(COMMON_CURRENCIES);
  const rest = codes.filter((c) => !top.has(c)).map((code) => ({ code, label: currencyLabel(code, locale) }));
  let compare: (a: string, b: string) => number;
  try { compare = new Intl.Collator(locale).compare; } catch { compare = (a, b) => a.localeCompare(b); }
  rest.sort((a, b) => compare(a.label, b.label));
  return { common, rest };
}
