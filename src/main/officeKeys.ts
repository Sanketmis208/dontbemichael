/**
 * Which config fields belong to a business and which to the install, and the
 * pure helpers that file a business's settings by office id
 * (docs/designs/separate-businesses.md). No runtime import of config.ts, so
 * config.ts can route its reads and writes through these without a cycle.
 */
import { resolve } from 'node:path';
import type { HarnessConfig } from './config';
import { isOfficeId } from '../shared/officeRecord';

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

export const businessKeySet: ReadonlySet<string> = new Set(BUSINESS_KEYS);
export const installKeySet: ReadonlySet<string> = new Set(INSTALL_KEYS);

export function pick<K extends string>(from: object, keys: ReadonlySet<string>): Partial<Record<K, unknown>> {
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

export function samePath(a: string, b: string): boolean {
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

/** One business's settings in this config: its saved ones over `defaults`. */
export function settingsIn(cfg: Pick<HarnessConfig, 'offices'>, id: string | null, defaults: Partial<OfficeSettings>): OfficeSettings {
  const saved = id && isOfficeId(id) ? cfg.offices?.[id]?.settings : undefined;
  return { ...defaults, ...pick(saved ?? {}, businessKeySet) } as OfficeSettings;
}

/** The offices map with this business's patch saved and its folder noted. */
export function officesWith(
  cfg: Pick<HarnessConfig, 'offices'>,
  id: string,
  home: string,
  patch: Partial<OfficeSettings>
): Record<string, OfficeEntry> {
  const offices = { ...(cfg.offices ?? {}) };
  const settings: Record<string, unknown> = { ...(offices[id]?.settings ?? {}) };
  // A field saved as undefined is cleared, as a save at the top level clears it.
  for (const [k, v] of Object.entries(patch)) {
    if (!businessKeySet.has(k)) continue;
    if (v === undefined) delete settings[k];
    else settings[k] = v;
  }
  offices[id] = { home, settings: settings as Partial<OfficeSettings> };
  return offices;
}
