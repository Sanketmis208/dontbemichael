/**
 * Where a business's office folder goes (owner, 2026-11-19: "HarnessAgents 2"
 * says nothing once there are several businesses). The first office is
 * `~/HarnessAgents`; one added later is named after its business, beside it,
 * so the folders read as the app's and say whose they are:
 *
 *   ~/HarnessAgents Northgate Realty
 *   ~/HarnessAgents Northgate Realty 2   (that name already taken)
 *
 * Pure, so it tests as a node module.
 */
import { cleanFolderName } from './folderName';

export const DEFAULT_HOME = '~/HarnessAgents';

/** The folders to try for a business named `businessName`, in order: its name,
 *  then its name with 2, 3 and so on. Empty when the name makes no folder. */
export function businessHomeCandidates(businessName: string, count = 20): string[] {
  const name = cleanFolderName(businessName, '');
  if (!name) return [];
  const base = `${DEFAULT_HOME} ${name}`;
  return [base, ...Array.from({ length: Math.max(0, count - 1) }, (_, i) => `${base} ${i + 2}`)];
}
