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
import { configDefaults, readConfig, writeConfig, type HarnessConfig } from './config';
import { isOfficeId } from '../shared/officeRecord';
import { readOfficeId } from './officeFile';

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
  'integrations', 'costCapTokens', 'costCapUsd'
] as const satisfies readonly (keyof HarnessConfig)[];

/** How the app itself behaves, the same for every business. The engine and
 *  model choices stay here until a login per office lands (plan, T4). */
export const INSTALL_KEYS = [
  'harnessHome', 'recentHives', 'offices', 'audience', 'autoMode', 'maxTurns', 'circuitBreaker', 'notifications',
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
