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
import { resolve } from 'node:path';
import { configDefaults, keepConfigCopy, readConfig, replaceConfig, writeConfig, type HarnessConfig } from './config';
import { describesBusiness, isOfficeId, type OfficeRecord } from '../shared/officeRecord';
import { ensureOfficeId, officeSwitchGuard, readOfficeId, readOfficeRecord } from './officeFile';
import { homeFolderStatus } from './homeFolder';

/** What belongs to a business: who it is, its team, mail and connectors, its
 *  Claude account, schedules, Research, knowledge, owner messages, integrations
 *  and budget (plan, T3). */
export const BUSINESS_KEYS = [
  // who the business is
  'businessType', 'businessName', 'businessCity', 'companyProfile', 'businessFolder', 'officeFolder', 'registeredRepos',
  // setup and team
  'onboardingComplete', 'businessTeam', 'businessTeamStarted', 'businessTeamRetry', 'instructionsRewritten',
  'firstTasksRemoved', 'workStyleUpdatesDecided', 'agentCapabilities', 'agentTokenCaps', 'autoDeliveryPausedAgents',
  // mail and connectors
  'mailboxes', 'quickbooksClaude', 'connectorsOn', 'connectorsSeen', 'connectorsMigrated', 'claudeConnectors', 'mcpDefaults',
  // its Claude account
  'claudeAuth', 'planPriceMonthly',
  // schedules
  'missions', 'scheduleRequests', 'missionsOwnersMigrated', 'opsStandupSeeded', 'foundationsCheckSeeded',
  'standupFocusSeeded', 'heartbeatSeeded',
  // Research and data
  'research', 'dataClasses',
  // knowledge and memory
  'knowledgeGraph', 'knowledgeOnSeeded', 'knowledgeOnNoticeSeen', 'embeddingModel',
  // owner messages
  'ownerAnswerKeys', 'ownerDockKeys',
  // integrations and budget
  'integrations', 'costCapTokens', 'costCapUsd',
  // the one time notice after the move (D11)
  'setupNoticePending'
] as const satisfies readonly (keyof HarnessConfig)[];

/** How the app itself behaves, the same for every business. The engine and
 *  model choices stay here until a login per office lands (plan, T4). */
export const INSTALL_KEYS = [
  'harnessHome', 'recentHives', 'offices', 'officesMigrated', 'audience', 'autoMode', 'maxTurns', 'circuitBreaker', 'notifications',
  'strongKeepalive', 'autoUpdate', 'terminalTheme', 'tvShowOffices',
  'godProvider', 'godModel', 'defaultModel', 'defaultCommand', 'providerDefaultModels'
] as const satisfies readonly (keyof HarnessConfig)[];

export type BusinessKey = (typeof BUSINESS_KEYS)[number];
export type InstallKey = (typeof INSTALL_KEYS)[number];

// Every config field has exactly one home. A new field in HarnessConfig that
// is in neither list, or in both, stops the build here.
type Unplaced = Exclude<keyof HarnessConfig, BusinessKey | InstallKey>;
type PlacedTwice = Extract<BusinessKey, InstallKey>;
const everyFieldPlacedOnce: [Unplaced, PlacedTwice] extends [never, never] ? true : never = true;
void everyFieldPlacedOnce;

export type OfficeSettings = Pick<HarnessConfig, BusinessKey>;
export type InstallConfig = Pick<HarnessConfig, InstallKey>;

/** One business in config.json: the folder its office was last opened from,
 *  and its own settings (only the ones that differ from the defaults need be
 *  there). */
export interface OfficeEntry {
  home: string;
  settings: Partial<OfficeSettings>;
}

const businessKeySet: ReadonlySet<string> = new Set(BUSINESS_KEYS);
const installKeySet: ReadonlySet<string> = new Set(INSTALL_KEYS);

function pick<K extends string>(from: object, keys: ReadonlySet<string>): Partial<Record<K, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(from)) if (keys.has(k) && v !== undefined) out[k] = v;
  return out as Partial<Record<K, unknown>>;
}

/** A patch split by home: business keys and install keys. Keys of neither
 *  (nothing a HarnessConfig holds) are dropped. */
export function splitPatch(patch: Partial<HarnessConfig>): { business: Partial<OfficeSettings>; install: Partial<InstallConfig> } {
  return {
    business: pick(patch, businessKeySet) as Partial<OfficeSettings>,
    install: pick(patch, installKeySet) as Partial<InstallConfig>
  };
}

/** A business's settings before anything was saved for it: the app defaults,
 *  so a new business has no mailboxes, runs the built in schedules and starts
 *  setup (onboardingComplete false). */
export function businessDefaults(): OfficeSettings {
  return pick(configDefaults(), businessKeySet) as OfficeSettings;
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    const t = resolve(p).replace(/[\\/]+$/, '');
    return process.platform === 'darwin' || process.platform === 'win32' ? t.toLowerCase() : t;
  };
  return norm(a) === norm(b);
}

/**
 * Which office is open, given its folder's own id (office.json) if it has
 * one. Without it (the file was deleted, or never saved), the entry last
 * opened from this folder: so a lost office.json never loses the settings.
 */
export function officeIdIn(cfg: Pick<HarnessConfig, 'harnessHome' | 'offices'>, recordId: string | null): string | null {
  if (isOfficeId(recordId)) return recordId;
  const home = cfg.harnessHome;
  if (!home) return null;
  for (const [id, entry] of Object.entries(cfg.offices ?? {})) {
    if (isOfficeId(id) && typeof entry?.home === 'string' && samePath(entry.home, home)) return id;
  }
  return null;
}

/** One business's settings in this config: its saved ones over the defaults. */
export function settingsIn(cfg: Pick<HarnessConfig, 'offices'>, id: string | null): OfficeSettings {
  const saved = id && isOfficeId(id) ? cfg.offices?.[id]?.settings : undefined;
  return { ...businessDefaults(), ...pick(saved ?? {}, businessKeySet) } as OfficeSettings;
}

/** The offices map with this business's patch saved and its folder noted. */
export function officesWith(
  cfg: Pick<HarnessConfig, 'offices'>,
  id: string,
  home: string,
  patch: Partial<OfficeSettings>
): Record<string, OfficeEntry> {
  const offices = { ...(cfg.offices ?? {}) };
  const before = offices[id]?.settings ?? {};
  offices[id] = { home, settings: { ...before, ...(pick(patch, businessKeySet) as Partial<OfficeSettings>) } };
  return offices;
}

/** The open office's id, or null when no office is open or it has no id yet. */
export function currentOfficeId(): string | null {
  const cfg = readConfig();
  return officeIdIn(cfg, readOfficeId(cfg.harnessHome));
}

/** The open business's settings (the defaults when it has none saved). */
export function officeSettings(): OfficeSettings {
  const cfg = readConfig();
  return settingsIn(cfg, officeIdIn(cfg, readOfficeId(cfg.harnessHome)));
}

/**
 * Save business settings for the open office. Only business keys are saved;
 * anything else in the patch is left out. False, with nothing saved, when no
 * office is open or it has no id: settings with nowhere to go must not land in
 * another business's entry or at the top level.
 */
export function updateOfficeSettings(patch: Partial<OfficeSettings>): boolean {
  const cfg = readConfig();
  const home = cfg.harnessHome;
  const id = officeIdIn(cfg, readOfficeId(home));
  if (!home || !id) return false;
  writeConfig({ offices: officesWith(cfg, id, home, patch) });
  return true;
}

/** How the app behaves, without any business's settings. */
export function installConfig(): InstallConfig {
  return pick(readConfig(), installKeySet) as InstallConfig;
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
  const cfg = readConfig();
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

  const saved = readConfig();
  if (known.some((o) => !saved.offices?.[o.id])) { log('[offices] migration: settings did not read back, kept as it was'); return 'failed'; }

  const next: Record<string, unknown> = { ...saved };
  for (const k of BUSINESS_KEYS) delete next[k];
  next.officesMigrated = 1;
  replaceConfig(next as unknown as HarnessConfig);
  log(`[offices] migration: done, ${known.length} office(s)`);
  return 'done';
}
