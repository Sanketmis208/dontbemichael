/**
 * Where a business's office folder goes (owner, 2026-11-19: "HarnessAgents 2"
 * says nothing once there are several businesses, and names carry no spaces
 * or special characters, like the backup file's). The first office is
 * `~/HarnessAgents`; one added later is named after its business, beside it,
 * so the folders read as the app's and say whose they are:
 *
 *   ~/HarnessAgents_Northgate_Realty
 *   ~/HarnessAgents_Northgate_Realty_2   (that name already taken)
 *   ~/HarnessAgents_2                    (no usable name)
 *
 * Pure, so it tests as a node module.
 */

export const DEFAULT_HOME = '~/HarnessAgents';

/** The most of a business name a folder keeps. */
const NAME_MAX = 48;

/** A business name as folder words: letters and digits only, joined by
 *  underscores ("Don't Be Michael" → "Dont_Be_Michael"). '' when none. */
export function folderWords(businessName: string): string {
  const words = String(businessName ?? '')
    .normalize('NFKC')
    .replace(/['’`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  let out = '';
  for (const w of words) {
    const next = out ? `${out}_${w}` : w;
    if (next.length > NAME_MAX) break;
    out = next;
  }
  return out || (words[0] ?? '').slice(0, NAME_MAX);
}

/** The folders to try for a business named `businessName`, in order: its name,
 *  then its name with 2, 3 and so on. Empty when the name makes no folder. */
export function businessHomeCandidates(businessName: string, count = 20): string[] {
  const name = folderWords(businessName);
  if (!name) return [];
  const base = `${DEFAULT_HOME}_${name}`;
  return [base, ...Array.from({ length: Math.max(0, count - 1) }, (_, i) => `${base}_${i + 2}`)];
}

/** "~/HarnessAgents_2" onwards: a new office with no name to go by. */
export function numberedHomes(count = 20): string[] {
  return Array.from({ length: Math.max(0, count - 1) }, (_, i) => `${DEFAULT_HOME}_${i + 2}`);
}
