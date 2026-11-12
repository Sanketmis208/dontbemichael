// Mirrors src/main/config.ts. Kept as a renderer-side type-only module
// so we don't have to reach into the preload package to type-check.
import type { ResearchConfig } from '@shared/research';
import type { DataClassId, DataClassSetting } from '@shared/dataClasses';
import type { ClaudeConnectorsState } from '@shared/claudeConnectors';
import type { IntegrationRecord } from '@shared/integrations';
import type { MailboxRecord, AgentCapabilities } from '@shared/mailboxes';
import type { CompanyProfile } from '@shared/companyProfile';
import {
  AGENT_PROVIDER_PRESETS,
  BUILD_ENGINES,
  providerPreset,
  inferAgentProvider,
  isClaudeProvider,
  type AgentProvider,
  type AgentProviderPreset
} from '@shared/agentProvider';
import { isNewer } from '@shared/updateState';
import modelCatalog from '@shared/modelCatalog.json';
import type { CatalogModel, ModelCatalog } from '@shared/modelCatalogPayload';

export {
  AGENT_PROVIDER_PRESETS,
  providerPreset,
  inferAgentProvider,
  isClaudeProvider,
  type AgentProvider
};

/** A recurring auto-dispatched mission (mirrors src/main/config.ts). */
export interface ScheduledMission {
  id: string;
  label: string;
  intervalMs: number;
  to: string;
  body: string;
  enabled: boolean;
  autoCompact?: boolean;
  lastFiredAt?: number;
  kind?: 'dispatch' | 'heartbeat' | 'compact';
  quietThresholdMs?: number;
}

/** Circuit-breaker thresholds (mirrors src/main/config.ts CircuitBreakerConfig). */
export interface CircuitBreakerConfig {
  enabled?: boolean;
  hardStop?: boolean;
  repeatedToolLimit?: number;
  errorStormLimit?: number;
  tokenVelocityPerMin?: number;
}

/** Enterprise Knowledge Graph config (mirrors src/main/config.ts KnowledgeGraphConfig). */
export interface KnowledgeGraphConfig {
  enabled?: boolean;
  rootPath?: string;
}

export interface HarnessConfig {
  onboardingComplete: boolean;
  /** Self-identified audience. No longer asked during onboarding; still exposed
   *  in Settings as "simple mode". Mirrors src/main/config.ts. */
  audience?: 'technical' | 'non-technical';
  /** The Office Pack picked on the first onboarding screen (a pack's
   *  `businessType`). Mirrors src/main/config.ts. */
  businessType?: string;
  /** The business's name and city as the owner typed them. Mirrors src/main/config.ts. */
  businessName?: string;
  businessCity?: string;
  /** The company profile: key facts with short, definite answers, delivered
   *  to every agent (src/shared/companyProfile.ts). */
  companyProfile?: CompanyProfile;
  /** Michael's folder: the business folder, private to him and the owner, that
   *  holds every team member's folder by default (src/shared/folderAccess.ts). */
  businessFolder?: string;
  /** Before 2026-09-25: the shared Office folder, inside Michael's. Read once at
   *  launch to fill businessFolder (its parent); nothing else uses it. Company
   *  knowledge lives in the knowledge feature now. */
  officeFolder?: string;
  /** The starter team picked during onboarding, each with the ABSOLUTE folder it
   *  works in (Decisions 44, 47). The running office starts agents from this. */
  businessTeam?: Array<{ agentId: string; folder: string }>;
  /** Set once the onboarding team has been started, so it is started once. */
  businessTeamStarted?: boolean;
  /** Research, the one team member on the internet (shared/research.ts). */
  research?: ResearchConfig;
  /** The owner's data classes that differ from the seeded defaults
   *  (shared/dataClasses.ts): what the team may send to Research. */
  dataClasses?: Partial<Record<DataClassId, DataClassSetting>>;
  /** Team members that failed their first start, tried again (and only they)
   *  on each later launch until they start. */
  businessTeamRetry?: string[];
  /** Set once existing team members got today's Role description and Work
   *  style (the one-time rewrite, 2026-09-25). */
  instructionsRewritten?: boolean;
  /** Set once the pack's First task text was taken out of existing team
   *  members' Work styles (docs/designs/first-task-card.md, D1). */
  firstTasksRemoved?: boolean;
  /** Owner decisions on offered job description updates (shared/workStyleUpdates.ts). */
  workStyleUpdatesDecided?: Record<string, 'use' | 'keep'>;
  harnessHome: string | null;
  /** Recently-opened office folders (most-recent first), for the missing office
   *  screen and Settings → General.
   *  Mirrors src/main/config.ts. */
  recentHives?: string[];
  registeredRepos: string[];
  autoMode: boolean;
  defaultCommand: string;
  /** Default model for newly spawned agents (e.g. 'claude-sonnet-4-6[1m]'); unset = CLI default. */
  defaultModel?: string;
  /** Which provider+model powers the GOD orchestrator ("Michael"). Default
   *  'claude' / 'claude-opus-5-5'. Mirrors src/main/config.ts. */
  godProvider?: AgentProvider;
  /** How Claude Code signs in: the owner's Claude account, or an Anthropic API key (mirrors src/main/config.ts). */
  claudeAuth?: 'account' | 'apiKey';
  /** The owner's monthly Claude plan price in USD; unset uses the detected plan's (mirrors src/main/config.ts). */
  planPriceMonthly?: number;
  godModel?: string;
  /** Mailboxes connected in Settings (docs/designs/multi-mailbox.md). Metadata
   *  only; each app password lives in the secret store under `mail:<id>`. */
  mailboxes?: MailboxRecord[];
  /** Saved integrations. The Access tab lists them through integrationsClient. */
  integrations?: IntegrationRecord[];
  /** Per-agent Capabilities, keyed by agent id (Michael included). Missing means
   *  no capabilities: every agent starts with email off (MB-6). */
  agentCapabilities?: { [agentId: string]: AgentCapabilities };
  /** The QuickBooks row's switch under Settings > Connections > Claude connectors.
   *  Off or absent refuses everyone. Mirrors src/main/config.ts. */
  quickbooksClaude?: boolean;
  /** Connectors on the owner's Claude account, as last read (src/main/config.ts). */
  claudeConnectors?: ClaudeConnectorsState;
  /** The connectors the owner turned on, by key (QuickBooks: quickbooksClaude). */
  connectorsOn?: { [key: string]: boolean };
  /** Connector keys the owner has seen in Settings. */
  connectorsSeen?: string[];
  /** One-time guard for the connector carry-over (main config.ts); a new office sets it at setup. */
  connectorsMigrated?: boolean;
  embeddingModel: 'minilm' | 'embeddinggemma';
  missions?: ScheduledMission[];
  opsStandupSeeded?: boolean;
  heartbeatSeeded?: boolean;
  notifications?: boolean;
  /** Opt-in "strong keep-alive": escalates the in-app power blocker to
   *  prevent-display-sleep so scheduled missions/terminals keep firing on time
   *  while away (battery cost; best on AC). Default off = survive + catch up on
   *  resume. Mirrors the main-process field (src/main/config.ts). */
  strongKeepalive?: boolean;
  /** @deprecated Ignored since 2026-10-02: updates are always checked. */
  autoUpdate?: boolean;
  costCapUsd?: number;
  /** Hard total-token ceiling across active agents (the user-facing budget). */
  costCapTokens?: number;
  /** Per-agent total-token ceiling, keyed by agent id. Overrides the floor budget
   *  for that agent's meter and trips the breaker for it alone. */
  agentTokenCaps?: Record<string, number>;
  autoDeliveryPausedAgents?: string[];
  maxTurns?: number;
  circuitBreaker?: CircuitBreakerConfig;
  /** Company knowledge (the Knowledge Graph store). Default ON. */
  knowledgeGraph?: KnowledgeGraphConfig;
  /** TV-show office themes feature flag (Settings picker + switch flow). Default OFF. */
  tvShowOffices?: boolean;
  /** Per-CLI-provider default model slug, used to pre-fill the model picker. */
  providerDefaultModels?: Partial<Record<AgentProvider, string>>;
}

/** The Sonnet model with the 1M-token context window — used for Michael's prep
 *  assistant (cheap, large-context context gathering). Mirrors ASSISTANT_MODEL
 *  in src/main/assistant.ts; keep the two in sync. */
export const ASSISTANT_MODEL = 'claude-sonnet-4-6[1m]';

export interface ModelOption {
  /** undefined = use the CLI default (no --model flag) */
  id?: string;
  label: string;
}

/** The catalog row + catalog types now live in shared/, because the MAIN
 *  process validates the remote copy against the same shape before it crosses
 *  the bridge. `minAppVersion` / `maxAppVersion` are INCLUSIVE app-version
 *  bounds: the model is offered while the running build sits inside them, and
 *  null (or an absent key) means unbounded in that direction. That is what lets
 *  a release introduce or retire a model without a code change.
 *
 *  PRERELEASES COUNT AS THEIR RELEASE. The comparison is major.minor.patch only
 *  (`isNewer` discards a `-rc.N` suffix), so `minAppVersion: '0.4.6'` IS offered
 *  on `0.4.6-rc.1`. That is deliberate and ruled on: an rc of a release should
 *  count as that release, it matches the update badge's own comparison, and the
 *  alternative would hide a new model from exactly the testers meant to
 *  exercise it. Bound a model to the release, not to its rc. */
export type { CatalogModel, ModelCatalog } from '@shared/modelCatalogPayload';

/** The model presets every provider picker offers.
 *
 *  These were a dozen hardcoded `ModelOption[]` arrays in this file, so shipping
 *  a model — one string — meant editing, type-checking and rebuilding renderer
 *  source. They now live in src/shared/modelCatalog.json, imported at BUILD time
 *  (no fs, no network, offline-safe) and filtered per running version, so adding
 *  a model is a one-line JSON edit and a model can name the releases it belongs
 *  to instead of appearing in builds whose CLI never shipped it.
 *
 *  What the arrays used to say — kept, because it explains why the entries look
 *  the way they do:
 *
 *  - claude: `[1m]` selects the 1M-token context-window variant. The list
 *    deliberately has NO "pass no --model flag" entry: every option names a real
 *    model, because the whole reason to open this picker is to know which model
 *    an agent is on, and a no-flag option resolves to whatever Claude Code
 *    happens to choose — which the UI cannot show and the user cannot predict.
 *    The harness default is marked ` · default` instead, and it names a real model.
 *  - The leading `CLI default` entry several providers carry means no `--model`
 *    flag at all — whatever the CLI itself defaults to. That is NOT the harness's
 *    `config.defaultModel`; the pickers mark that one separately, and labelling
 *    both "default" is what made the two impossible to tell apart.
 *  - codex: current OpenAI models offered by Codex. The command field stays
 *    editable and `codex --model <id>` is the source of truth.
 *  - gemini: stable aliases accepted by the official Google Gemini CLI. They
 *    follow the CLI instead of pinning preview model ids that drift.
 */
// The JSON import types `tier` as a plain string; the parser's ModelTier is the contract.
const BAKED: ModelCatalog = modelCatalog as ModelCatalog;

/** The catalog the pickers actually read. Starts as the baked copy and is
 *  replaced, per provider, when the remote copy arrives from main. `let`, not
 *  `const`, is the whole mechanism: everything below reads it through a
 *  function call, so a refresh reaches the next render with no plumbing. */
let CATALOG: ModelCatalog = BAKED;

/** Merge a validated remote catalog over the baked one.
 *
 *  Per PROVIDER, not per model: a provider present in the remote copy replaces
 *  that provider's list outright, and a provider the remote copy does not
 *  mention keeps the list this build shipped with. That means docs/model-catalog
 *  .json can carry only the providers being changed, and a provider dropped from
 *  it degrades to the built-in list rather than to an empty picker.
 *
 *  One exception to "replaces outright": the model this build RECOMMENDS for
 *  Michael is always kept. Setup preselects it, so a remote list without it
 *  left the picker showing its first row while a different model was saved
 *  (seen live: Fable 5.1 on screen, Opus 5.5 saved, from a list published
 *  before Opus 5.5 existed). It goes back at the top, as the build ships it.
 *
 *  Returns whether anything actually changed, so the caller can skip a pointless
 *  event on the overwhelmingly common "nothing new" path. */
export function applyRemoteModelCatalog(remote: ModelCatalog | null): boolean {
  const next: ModelCatalog = remote
    ? { version: BAKED.version, providers: keepRecommended({ ...BAKED.providers, ...remote.providers }) }
    : BAKED;
  if (JSON.stringify(next) === JSON.stringify(CATALOG)) return false;
  CATALOG = next;
  return true;
}

function keepRecommended(providers: ModelCatalog['providers']): ModelCatalog['providers'] {
  const out = { ...providers };
  for (const preset of AGENT_PROVIDER_PRESETS) {
    const id = preset.recommendedOrchestratorModel;
    const list = out[preset.id];
    if (!id || !list || list.some((m) => m.id === id)) continue;
    const baked = BAKED.providers[preset.id]?.find((m) => m.id === id);
    if (baked) out[preset.id] = [baked, ...list];
  }
  return out;
}

/** Fired on `window` after the catalog changes, so a surface holding a rendered
 *  list can re-read it. Pickers that call `modelsForProvider()` during render
 *  pick the change up on their next render either way. */
export const MODEL_CATALOG_EVENT = 'cth:model-catalog';

/** Ask main for the remote catalog and apply it. Safe to call repeatedly; the
 *  network hop is main's problem and it is cached there behind a TTL.
 *
 *  Called once when this module loads inside the app (below). Kept exported so a
 *  Settings action can force a refresh, and so the tests can drive it. */
export async function refreshModelCatalog(force = false): Promise<boolean> {
  try {
    const bridge = (globalThis as { cth?: { modelCatalog?: (force?: boolean) => Promise<{ catalog: ModelCatalog | null }> } }).cth;
    if (!bridge?.modelCatalog) return false;
    const { catalog } = await bridge.modelCatalog(force);
    const changed = applyRemoteModelCatalog(catalog);
    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MODEL_CATALOG_EVENT));
    }
    return changed;
  } catch {
    // The baked catalog is already rendering. A failed refresh is not an error
    // the user has any action for, so it is not one they get told about.
    return false;
  }
}

// Fire once on load. The pickers all call modelsForProvider() during render, so
// the usual case — main pre-warmed the cache at startup, this resolves in a few
// ms, no modal is open yet — needs no subscription at all. A catalog that lands
// while a picker is already open reaches it on that picker's next render.
if (typeof window !== 'undefined') void refreshModelCatalog();

declare const __APP_VERSION__: string | undefined;

/** The version of the running build. electron-vite replaces `__APP_VERSION__`
 *  with package.json's version at build time — the same value the update badge
 *  shows — so the renderer knows it synchronously, with no round trip to main.
 *  Outside a build (unit tests) the define is absent and there is no version to
 *  compare against; see the fail-open note on `offeredAtVersion`. */
export function runningAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
}

/** Whether a catalog entry belongs in a picker on this build. Both bounds are
 *  inclusive of the release they name. Anything unparseable — an absent bound, a
 *  malformed one, an unknown app version — is ignored rather than hiding the
 *  model: a picker that silently loses every model is far worse than one that
 *  offers a model this build's CLI cannot run (the command field is editable and
 *  the CLI reports the bad slug). */
function offeredAtVersion(model: CatalogModel, appVersion: string): boolean {
  if (model.minAppVersion && isNewer(model.minAppVersion, appVersion)) return false;
  if (model.maxAppVersion && isNewer(appVersion, model.maxAppVersion)) return false;
  return true;
}

/** The model preset list for a provider's picker, as of a given app version.
 *  `providers` is injectable so the version filter can be exercised against
 *  bounded entries — the shipped catalog is deliberately all-unbounded. */
export function modelsForProviderAtVersion(
  provider: AgentProvider,
  appVersion: string,
  providers: Record<string, CatalogModel[]> = CATALOG.providers
): ModelOption[] {
  // An unknown provider falls back to the Claude list, as the hardcoded dispatch
  // did.
  const entries = providers[provider] ?? providers.claude ?? [];
  return entries
    .filter((model) => offeredAtVersion(model, appVersion))
    .map((model) => (model.id === undefined ? { label: model.label } : { id: model.id, label: model.label }));
}

// tokenizeCommand moved to src/shared/commandLine.ts so main's spawn-request
// path splits command lines with the SAME rules as the renderer's spawn flows
// (they used to carry byte-identical copies). Re-exported here so existing
// importers keep their path.
export { tokenizeCommand } from '@shared/commandLine';

/** The model preset list for a given provider's picker, on this build. */
export function modelsForProvider(provider: AgentProvider): ModelOption[] {
  return modelsForProviderAtVersion(provider, runningAppVersion());
}

/** The Claude presets, for the surfaces that only ever offer Claude models.
 *  A FUNCTION, not a const array: a const would be captured at module load and
 *  would still be showing the baked list after a remote refresh landed. */
export function agentModels(): ModelOption[] {
  return modelsForProvider('claude');
}

/** Providers shown in the Command Center's cross-provider model picker.
 *  God must remain on a provider with a working inbox drain; otherwise switching
 *  to a terminal-only provider would silently disable orchestration. */
export function modelProvidersForAgent(isGod = false) {
  return AGENT_PROVIDER_PRESETS.filter((preset) =>
    preset.supportsModel && (!isGod || preset.canReceiveInbox)
  );
}

/** The onboarding engine step's two groups (issue #355). An inbox-less engine
 *  can be HIRED as a worker but cannot run Michael, because the orchestrator
 *  must drain hive mail. So the step shows such engines as disabled
 *  workers-only rows — same god-eligible set as `modelProvidersForAgent(true)`
 *  for the selectable group, and every other preset in the disabled group.
 *
 *  Both groups are limited to `offered`, the engines this build supports
 *  (`BUILD_ENGINES`, only Claude Code today). An engine left out is not shown
 *  at all, not even disabled: the owner can't use it in this build. */
export function onboardingEngineChoices(offered: readonly AgentProvider[] = BUILD_ENGINES): {
  eligible: AgentProviderPreset[];
  workersOnly: AgentProviderPreset[];
} {
  const eligible = modelProvidersForAgent(true).filter((preset) => offered.includes(preset.id));
  const workersOnly = AGENT_PROVIDER_PRESETS.filter(
    (preset) => offered.includes(preset.id) && !modelProvidersForAgent(true).includes(preset)
  );
  return { eligible, workersOnly };
}

/** Setup asks for Michael's engine and model only, and the team follows it
 *  (owner, 2026-09-26). The config patch that makes his pick the team default:
 *  the engine's command (kept as is when it already runs that engine, so extra
 *  flags survive) and the model, in `defaultModel` for Claude or in
 *  `providerDefaultModels` for any other engine, the same fields the hire
 *  dialog and the starter team read. No model means the engine's own default,
 *  so nothing is written for it. */
export function teamDefaultsFromMichael(
  config: Pick<HarnessConfig, 'defaultCommand' | 'providerDefaultModels'>,
  provider: AgentProvider,
  model: string | undefined
): Partial<Pick<HarnessConfig, 'defaultCommand' | 'defaultModel' | 'providerDefaultModels'>> {
  const patch: Partial<Pick<HarnessConfig, 'defaultCommand' | 'defaultModel' | 'providerDefaultModels'>> = {};
  if (inferAgentProvider(config.defaultCommand) !== provider) patch.defaultCommand = providerPreset(provider).defaultCommand;
  if (model) {
    if (isClaudeProvider(provider)) patch.defaultModel = model;
    else patch.providerDefaultModels = { ...(config.providerDefaultModels ?? {}), [provider]: model };
  }
  return patch;
}

/** Native <select> values must carry both provider and model because each
 *  provider has its own "default" option and model namespace. */
export function encodeProviderModel(provider: AgentProvider, model?: string): string {
  return `${provider}:${encodeURIComponent(model ?? '')}`;
}

export function decodeProviderModel(value: string): {
  provider: AgentProvider;
  model?: string;
} | null {
  const split = value.indexOf(':');
  if (split < 1) return null;
  const provider = value.slice(0, split);
  if (!AGENT_PROVIDER_PRESETS.some((preset) => preset.id === provider)) return null;
  try {
    const model = decodeURIComponent(value.slice(split + 1));
    return { provider: provider as AgentProvider, model: model || undefined };
  } catch {
    return null;
  }
}

/** Build the command line to feed into spawnPty, honoring the provider's flags,
 *  autoMode, and an optional per-agent model override. Claude keeps the user's
 *  configured `defaultCommand`; other providers use their preset binary so the
 *  app works without Claude installed. */
export function buildSpawnCommand(
  config: Pick<HarnessConfig, 'defaultCommand' | 'autoMode'>,
  model?: string,
  provider: AgentProvider = inferAgentProvider(config.defaultCommand)
): string {
  const preset = providerPreset(provider);
  // Claude keeps the user's configured defaultCommand; every other provider
  // (codex, gemini) uses its preset binary so the app works even without
  // Claude installed.
  const base =
    provider === 'claude'
      ? config.defaultCommand || preset.defaultCommand
      : preset.defaultCommand;
  let cmd = base;
  if (preset.supportsModel && model && preset.modelFlag) {
    // Quote model values that contain whitespace so the command tokenizer
    // keeps them one arg.
    const m = /\s/.test(model) ? `"${model}"` : model;
    cmd = `${cmd} ${preset.modelFlag} ${m}`;
  }
  // Auto (skip-permissions) mode appends each provider's own flag — Claude's
  // bypassPermissions, Codex's never-ask with its sandbox, or Gemini's yolo
  // approval mode.
  if (config.autoMode && preset.autoFlag) cmd = `${cmd} ${preset.autoFlag}`;
  return cmd;
}
