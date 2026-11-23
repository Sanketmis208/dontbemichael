/**
 * Which site a social media link is on, for the label beside it in the
 * company profile (CompanyProfileFields, SocialLinks). Plain names, no brand
 * logos. Pure, so it tests as a node module.
 */

const SITES: Array<[RegExp, string]> = [
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'X'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)threads\.(net|com)$/, 'Threads'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'Pinterest'],
  [/(^|\.)yelp\.[a-z.]+$/, 'Yelp'],
  [/(^|\.)nextdoor\.com$/, 'Nextdoor'],
  [/(^|\.)bsky\.app$/, 'Bluesky'],
  [/(^|\.)(g\.page|business\.google\.com|maps\.app\.goo\.gl)$/, 'Google'],
  [/(^|\.)tripadvisor\.[a-z.]+$/, 'Tripadvisor'],
  [/(^|\.)github\.com$/, 'GitHub']
];

/** The site's name, or null when it is not a link or not a site we name. */
export function socialSite(link: string): string | null {
  const raw = link.trim();
  if (!raw || /\s/.test(raw)) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  const bare = host.replace(/^(www|m|mobile)\./, '');
  for (const [re, name] of SITES) if (re.test(bare)) return name;
  return null;
}

/** Whether it reads as a link at all (a host with a dot), for a gentle hint. */
export function looksLikeLink(link: string): boolean {
  const raw = link.trim();
  if (!raw || /\s/.test(raw)) return false;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.includes('.');
  } catch {
    return false;
  }
}
