/**
 * Address suggestions while the owner types the street (setup and Settings,
 * company profile; owner, 2026-11-19): Photon, the free OpenStreetMap search
 * by komoot (https://photon.komoot.io). No key, so nothing secret ships in an
 * open source app. Address typing is a one time thing for a business, and the
 * fields stay editable, so a weaker match is fixed by hand.
 *
 * OpenStreetMap data is under the ODbL: anywhere suggestions show, they say
 * they come from OpenStreetMap.
 *
 * Pure: the request URL and reading the answer. main/index.ts makes the call.
 */
import type { CompanyAddress } from './companyProfile';

export const PHOTON_URL = 'https://photon.komoot.io/api/';
/** Fewer characters than this ask nothing: too many places match. */
export const MIN_ADDRESS_QUERY = 4;
const MAX_QUERY = 200;
/** The languages Photon answers in; any other gets its default. */
const PHOTON_LANGS = new Set(['en', 'de', 'fr']);

export interface AddressSuggestion {
  /** One line to show: "1600 Pennsylvania Ave NW, Washington, DC 20500, United States". */
  label: string;
  address: CompanyAddress;
}

/** The request for what was typed, or null when there is nothing to ask. */
export function photonQueryUrl(typed: string, lang?: string): string | null {
  const q = typed.trim().replace(/\s+/g, ' ');
  if (q.length < MIN_ADDRESS_QUERY || q.length > MAX_QUERY) return null;
  const u = new URL(PHOTON_URL);
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '6');
  const l = (lang ?? '').slice(0, 2).toLowerCase();
  if (PHOTON_LANGS.has(l)) u.searchParams.set('lang', l);
  return u.toString();
}

/** Countries that write the house number before the street. */
const NUMBER_FIRST = new Set(['US', 'CA', 'AU', 'NZ', 'GB', 'IE', 'IN', 'PH', 'ZA', 'SG', 'MY', 'HK', 'NG', 'KE', 'PK']);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Photon's answer as suggestions with a street; places that are only a
 *  city, a region or a country are left out (the street is what is typed). */
export function readPhoton(body: unknown): AddressSuggestion[] {
  const features = (body as { features?: unknown })?.features;
  if (!Array.isArray(features)) return [];
  const out: AddressSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> })?.properties ?? {};
    const cc = str(p.countrycode)?.toUpperCase();
    const number = str(p.housenumber);
    // A street segment is named in `name`; an address point in `street`.
    const streetName = str(p.street) ?? (p.osm_key === 'highway' ? str(p.name) : undefined);
    if (!streetName) continue;
    const street = number ? (cc && NUMBER_FIRST.has(cc) ? `${number} ${streetName}` : `${streetName} ${number}`) : streetName;
    const address: CompanyAddress = {
      street,
      // A city, town, village or hamlet only. Never the county or a district:
      // an address outside a city's limits (an unincorporated part of the
      // county) has no city in OpenStreetMap though its mail goes to one, and a
      // county name there was wrong (owner, 2026-11-19). Left empty, the owner
      // types the city the mail uses.
      city: str(p.city) ?? str(p.town) ?? str(p.village) ?? str(p.hamlet),
      region: str(p.state),
      postalCode: str(p.postcode),
      country: str(p.country)
    };
    for (const k of Object.keys(address) as Array<keyof CompanyAddress>) if (address[k] === undefined) delete address[k];
    const label = [address.street, address.city, [address.region, address.postalCode].filter(Boolean).join(' '), address.country]
      .filter((x) => x && String(x).trim()).join(', ');
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, address });
    if (out.length >= 5) break;
  }
  return out;
}
