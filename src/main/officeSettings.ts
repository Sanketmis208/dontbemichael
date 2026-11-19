/**
 * Each business's own settings (docs/designs/separate-businesses.md, step one).
 *
 * Today every office on a Mac reads one config.json, so a business's name,
 * team, mailboxes, schedules and connectors are the same for every office.
 * Step one files a business's settings under its office's lasting id, in
 * `config.json` `offices[<id>]`, and keeps only how the app itself behaves at
 * the top level. Every field has exactly one home, decided field by field in
 * the plan (T3), and the build fails if a field is added without one.
 *
 *   config.json
 *   ├─ install keys (INSTALL_KEYS)      installConfig()
 *   └─ offices
 *      └─ <office id>                   currentOfficeId(): office.json id, else
 *         ├─ home                         the entry whose home is the open folder
 *         └─ settings (BUSINESS_KEYS)   officeSettings() / updateOfficeSettings()
 *
 * Nothing reads through here yet: the launch migration (E2) fills `offices`,
 * and the readers move over in E3, when readConfig() stops returning business
 * fields.
 */
import { configDefaults, keepConfigCopy, readStoredConfig, replaceConfig, writeConfig, type HarnessConfig } from './config';
import { describesBusiness, type OfficeRecord } from '../shared/officeRecord';
import {
  BUSINESS_KEYS, businessKeySet, installKeySet, officeIdIn, officesWith, pick, samePath, settingsIn,
  type InstallConfig, type OfficeEntry, type OfficeSettings
} from './officeKeys';
import { randomUUID } from 'node:crypto';
import { ensureOfficeId, officeSwitchGuard, readOfficeId, readOfficeRecord, setOfficeId } from './officeFile';
import { homeFolderStatus } from './homeFolder';

/** A business's settings before anything was saved for it: the app defaults,
 *  so a new business has no mailboxes, runs the built in schedules and starts
 *  setup (onboardingComplete false). */
export function businessDefaults(): OfficeSettings {
  return pick(configDefaults(), businessKeySet) as OfficeSettings;
}

export {
  BUSINESS_KEYS, INSTALL_KEYS, splitPatch, officeIdIn, officesWith,
  type BusinessKey, type InstallKey, type OfficeSettings, type InstallConfig, type OfficeEntry
} from './officeKeys';

/** The open office's id, or null when no office is open or it has no id yet. */
export function currentOfficeId(): string | null {
  const cfg = readStoredConfig();
  return officeIdIn(cfg, readOfficeId(cfg.harnessHome));
}

/** The open business's settings (the defaults when it has none saved). */
export function officeSettings(): OfficeSettings {
  const cfg = readStoredConfig();
  return settingsIn(cfg, officeIdIn(cfg, readOfficeId(cfg.harnessHome)), businessDefaults());
}

/**
 * Save business settings for the open office. Only business keys are saved;
 * anything else in the patch is left out. False, with nothing saved, when no
 * office is open or it has no id: settings with nowhere to go must not land in
 * another business's entry or at the top level.
 */
export function updateOfficeSettings(patch: Partial<OfficeSettings>): boolean {
  const cfg = readStoredConfig();
  const home = cfg.harnessHome;
  const id = officeIdIn(cfg, readOfficeId(home));
  if (!home || !id) return false;
  writeConfig({ offices: officesWith(cfg, id, home, patch) });
  return true;
}

/**
 * At launch, after the move: make sure the open office has its id and its
 * entry, and that the entry knows where the office is now.
 *
 * - Its id's entry names another folder that no longer holds this office: the
 *   office was moved (in Finder, or found again from the missing office
 *   screen). The entry follows it.
 * - That other folder still holds the same id: this folder is a copy. It gets
 *   its own id and a copy of the settings, so the two never write each other's.
 * - No id yet: the entry last opened from this folder gives it one, else a new
 *   one; an office with no entry starts from the defaults (setup).
 *
 * Returns the open office's id, or null when there is none to give.
 */
export function adoptOpenOffice(): string | null {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return null;
  const home = cfg.harnessHome;
  if (!home || !homeFolderStatus(home).hasOffice) return null;
  const offices: Record<string, OfficeEntry> = { ...(cfg.offices ?? {}) };
  let changed = false;
  let id = readOfficeId(home);
  if (id && offices[id] && !samePath(offices[id].home, home)) {
    const elsewhere = offices[id].home;
    if (readOfficeId(elsewhere) === id) {
      const copyId = setOfficeId(home, randomUUID());
      if (!copyId) return null;
      offices[copyId] = { home, settings: structuredClone(offices[id].settings) };
      id = copyId;
    } else {
      offices[id] = { ...offices[id], home };
    }
    changed = true;
  }
  if (!id) id = ensureOfficeId(home, officeIdIn({ harnessHome: home, offices }, null) ?? undefined);
  if (!id) return null;
  if (!offices[id]) { offices[id] = { home, settings: {} }; changed = true; }
  if (changed) writeConfig({ offices });
  return id;
}

/**
 * The office in `oldHome` is being moved to `newHome` (Settings, Change office
 * folder, Move): its entry goes with it, so it reopens with its settings. The
 * offices map to save with the switch, or null when there is nothing to move.
 */
export function officesAfterMove(oldHome: string, newHome: string): Record<string, OfficeEntry> | null {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return null;
  const id = officeIdIn({ harnessHome: oldHome, offices: cfg.offices }, readOfficeId(oldHome));
  if (!id || !cfg.offices?.[id]) return null;
  return { ...cfg.offices, [id]: { ...cfg.offices[id], home: newHome } };
}

/** How the app behaves, without any business's settings. */
export function installConfig(): InstallConfig {
  return pick(readStoredConfig(), installKeySet) as InstallConfig;
}

// ─── The move to per office settings (E2, decision D11) ─────────────────────
//
//   launch, before any service starts
//     │ officesMigrated set ─────────────────────────────► 'already'
//     │ no office open yet, or its folder is missing ────► 'waiting' (nothing changed;
//     │                                                      runs once it is there)
//     ├─ each known office (open one + recent ones) gets its id in office.json
//     ├─ 1. config.json copied as config.before-offices.json (kept, never overwritten)
//     ├─ 2. offices[<id>] written for every office not already there:
//     │       this business (team or business folder matches) ── all its settings
//     │       another business with an office.json ──────────── its identity and team,
//     │                                                          setupNoticePending
//     │       nothing to tell ──────────────────────────────── nothing: setup runs
//     ├─ 3. read back; anything missing ───────────────────► 'failed' (top level kept)
//     └─ 4. one write: business fields removed from the top level, officesMigrated 1
//
// A crash anywhere before 4 leaves the top level as it was, and the next
// launch runs again: entries already written are kept as they are.

/** The name of the copy kept of config.json from before the move, so a build
 *  from before it can be pointed back at it. */
export const CONFIG_BEFORE_OFFICES = 'config.before-offices.json';

export type MigrationOutcome = 'business' | 'identity' | 'setup';

export interface KnownOffice {
  home: string;
  id: string;
  /** This office is the business the top level settings describe. */
  isThisBusiness: boolean;
  /** Its office.json, when it describes a business. */
  record: OfficeRecord | null;
}

/** The settings each office starts with after the move (pure). */
export function settingsForMigration(cfg: Partial<HarnessConfig>, office: KnownOffice): { outcome: MigrationOutcome; settings: Partial<OfficeSettings> } {
  if (office.isThisBusiness) {
    return { outcome: 'business', settings: pick(cfg, businessKeySet) as Partial<OfficeSettings> };
  }
  const rec = office.record;
  if (describesBusiness(rec)) {
    const settings: Partial<OfficeSettings> = {
      onboardingComplete: true,
      businessTeam: rec.team,
      businessTeamStarted: true,
      setupNoticePending: true
    };
    if (rec.businessName) settings.businessName = rec.businessName;
    if (rec.businessCity) settings.businessCity = rec.businessCity;
    if (rec.businessType) settings.businessType = rec.businessType;
    if (rec.businessFolder) settings.businessFolder = rec.businessFolder;
    if (rec.companyProfile) settings.companyProfile = rec.companyProfile;
    return { outcome: 'identity', settings };
  }
  return { outcome: 'setup', settings: {} };
}

/** The open office and the recent ones that still hold an office, once each. */
export function knownOfficeHomes(cfg: Pick<HarnessConfig, 'harnessHome' | 'recentHives'>): string[] {
  const out: string[] = [];
  for (const h of [cfg.harnessHome, ...(cfg.recentHives ?? [])]) {
    if (typeof h !== 'string' || !h.trim()) continue;
    if (out.some((o) => samePath(o, h))) continue;
    if (homeFolderStatus(h).hasOffice) out.push(h);
  }
  return out;
}

export type MigrationResult = 'already' | 'waiting' | 'done' | 'failed';

/**
 * Move the business settings at the top of config.json into `offices`, once.
 * See the diagram above for the order. The open office is this business when
 * setup is unfinished (its settings are the ones being typed); otherwise each
 * office is this business when the T2 guard would open it with these settings.
 */
export function migrateToOfficeSettings(log: (line: string) => void = (l) => console.log(l)): MigrationResult {
  const cfg = readStoredConfig();
  if (cfg.officesMigrated) return 'already';
  // The settings at the top belong to the open office. With none open yet
  // (setup not that far), or its folder missing, they would have nowhere to
  // go: wait, changing nothing, until it is there.
  const open = cfg.harnessHome;
  if (!open || !homeFolderStatus(open).hasOffice) return 'waiting';

  const known: KnownOffice[] = [];
  for (const home of knownOfficeHomes(cfg)) {
    const id = ensureOfficeId(home);
    const isOpen = samePath(home, open);
    if (!id) {
      // The open office's settings need its id; another office can wait.
      if (isOpen) { log(`[offices] migration: no id for the open office, kept as it was`); return 'failed'; }
      continue;
    }
    const isThisBusiness = cfg.onboardingComplete ? officeSwitchGuard(cfg, home) === 'ok' : isOpen;
    const rec = readOfficeRecord(home);
    known.push({ home, id, isThisBusiness, record: describesBusiness(rec) ? rec : null });
  }

  if (!keepConfigCopy(CONFIG_BEFORE_OFFICES)) { log('[offices] migration: could not keep the copy, kept as it was'); return 'failed'; }

  const offices: Record<string, OfficeEntry> = { ...(cfg.offices ?? {}) };
  for (const office of known) {
    if (offices[office.id]) continue; // written by a run that stopped before the end
    const { outcome, settings } = settingsForMigration(cfg, office);
    offices[office.id] = { home: office.home, settings };
    log(`[offices] migration: office ${office.id} gets ${outcome}`);
  }
  writeConfig({ offices });

  const saved = readStoredConfig();
  if (known.some((o) => !saved.offices?.[o.id])) { log('[offices] migration: settings did not read back, kept as it was'); return 'failed'; }

  const next: Record<string, unknown> = { ...saved };
  for (const k of BUSINESS_KEYS) delete next[k];
  next.officesMigrated = 1;
  replaceConfig(next as unknown as HarnessConfig);
  log(`[offices] migration: done, ${known.length} office(s)`);
  return 'done';
}
