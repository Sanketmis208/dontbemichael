/**
 * Agent providers — the CLI a worker runs on: Claude Code, the OpenAI Codex CLI
 * (`codex`, the ChatGPT engine) or Google's Gemini CLI (`gemini`). Every other
 * engine was removed (owner, 2026-11-11); a member saved on one moves to Claude
 * Code when it is loaded (onRetiredEngine).
 * Each provider declares how to build its spawn command (model/auto-mode flags) and
 * whether it accepts the hive's Claude-specific identity injection
 * (`--append-system-prompt` + `--settings`).
 *
 * Shared between main and renderer; keep it dependency-free (no electron, no UI).
 */
import type { CmdGroup } from './claudeCommands';
import { COMMAND_GROUPS as CLAUDE_COMMAND_GROUPS } from './claudeCommands';
import { CODEX_COMMAND_GROUPS } from './codexCommands';
import { tokenizeCommand } from './commandLine';

export type AgentProvider = 'claude' | 'codex' | 'gemini';

/** Structured descriptor for how a NON-hiveAware provider gets hive lifecycle
 *  events (live status + Stop→inbox-drain + cost): a config-file hook shim is
 *  installed (codex/gemini). Codex's is derived from the legacy `hookBridge` by
 *  `bridgeOf`. */
export type BridgeDescriptor = { kind: 'hooks'; shim: 'codex' | 'gemini' };

/** How the agent's identity, house rules, folder boundaries, work style and
 *  standing goal are delivered so they survive compaction and resume (#298):
 *   - 'system-level'           → delivered via a native system/developer instructions
 *                                channel (Claude's `--append-system-prompt`, Codex's
 *                                `developer_instructions` in `config.toml`).
 *   - 're-injected on compact' → no native system prompt CLI channel; the full
 *                                protocol is delivered in the initial turn and
 *                                re-injected on `SessionStart` (compact/resume)
 *                                via hook bridge `additionalContext` (Gemini CLI). */
export type InstructionsDelivery = 'system-level' | 're-injected on compact';

/** Short initial turn prompt used when the agent's full protocol is delivered
 *  at the system level (Codex), keeping the session active without
 *  duplicating the system prompt in conversation history (#298). */
export const ON_SHIFT_PROMPT = "You're on shift; check your inbox";

export interface AgentProviderPreset {
  id: AgentProvider;
  label: string;
  /** The binary spawned when the user hasn't typed a custom command. */
  defaultCommand: string;
  /** Slash / CLI command reference for this provider. */
  commandGroups: CmdGroup[];
  /** Environment variable to set for non-interactive / first-run suppression. */
  nonInteractiveEnv?: Record<string, string>;
  /** Flag(s) appended to the command string when auto mode is active.
   *  Kept alongside `autoFlag` (same value) for the HEAD consumers that read
   *  `autoModeFlag` via `autoModeFlagForProvider`. */
  autoModeFlag: string;
  /** Show a model picker and splice the model into the command. */
  supportsModel: boolean;
  /** Flag that selects the session model, e.g. `--model`. */
  modelFlag?: string;
  /** Flag appended when the floor is in auto (skip-permissions) mode.
   *  PR #54 consumers read this; mirrors `autoModeFlag`. */
  autoFlag?: string;
  /** Claude Code accepts the hive identity injection (`--append-system-prompt`
   *  + hook `--settings`). Other CLIs don't — they spawn with the shared AGENT_*
   *  env only. Gates the Claude-specific spawn injection in hive.ensureAgent.
   *  NOTE: this gates the *Claude-only* flag path specifically — it is NOT the
   *  same as "participates in the hive". A non-hiveAware provider can still be a
   *  full hive citizen (live status + guarded idle delivery) via a `hookBridge`. */
  hiveAware: boolean;
  /** Which config-file lifecycle-hook bridge a NON-hiveAware provider uses to get
   *  the same live status that Claude gets from `--settings`:
   *    - 'codex' → installCodexHooks() writes a per-agent CODEX_HOME config and
   *                reuses the Claude `cth-hook` shim verbatim (Codex's hook payload
   *                + response contract are already Claude-shaped).
   *  Claude leaves this undefined (it uses its native `--settings` path, gated by
   *  hiveAware). This is the single switch hive.ensureAgent dispatches on to wire
   *  the bridge. */
  hookBridge?: 'codex';
  /** Structured bridge descriptor (the forward-looking replacement for the legacy
   *  `hookBridge`; Gemini sets it). Codex leaves it undefined and `bridgeOf`
   *  derives `{kind:'hooks'}` from its `hookBridge`. claude leaves it undefined
   *  (no bridge). Prefer `bridgeOf(provider)` over reading this directly. */
  bridge?: BridgeDescriptor;
  /** The model the GOD orchestrator ("Michael") defaults to when this provider
   *  powers it — surfaced as the picker default and the advisory "give Michael a
   *  longer-context, higher-capability model". `modelForRole` resolves the GOD
   *  model as `config.godModel ?? preset.recommendedOrchestratorModel ?? MODEL_GOD`.
   *  Advisory + user-overridable. */
  recommendedOrchestratorModel?: string;
  /** Whether the router may DELIVER inbox mail to this provider (vs bouncing it
   *  to the god). Requires lifecycle status so the renderer can deliver only at a
   *  safe idle prompt: Claude natively, Codex/Gemini via hook bridges.
   *  Distinct from hiveAware: codex/gemini are NOT hiveAware (no Claude injection)
   *  but CAN receive inbox via their bridge. */
  canReceiveInbox: boolean;
  /** For non-hive-aware CLIs that still take an INITIAL prompt to orient the
   *  session (Gemini's `gemini -i "<prompt>"`), the flag to pass it under. The
   *  hive identity+protocol rides in as the first turn — the closest thing to
   *  Claude's `--append-system-prompt` these CLIs offer. undefined = the CLI
   *  takes its initial prompt POSITIONALLY (Codex: `codex "<prompt>"`) and the
   *  injection branch appends it as a quoted trailing arg instead of a flag. */
  initialPromptFlag?: string;
  /** This CLI accepts the initial hive prompt as a trailing positional argument.
   *  Codex does; a CLI with neither this nor a prompt flag spawns bare. */
  positionalInitialPrompt?: boolean;
  /** Flag to resume a prior session on respawn, given the recorded session id
   *  (Claude and Gemini `--resume <sid>`). undefined = no
   *  resume support, spawn fresh. */
  resumeFlag?: string;
  /** Shell command that installs this provider's engine CLI when it's missing,
   *  e.g. `npm install -g @anthropic-ai/claude-code`. When set, the missing-CLI
   *  path may RUN it visibly in the agent terminal (after pre-spawn detection);
   *  when undefined, the user is shown a manual instruction only and nothing is
   *  auto-run. MUST be a trusted, hardcoded constant — never user/manifest input. */
  installCommand?: string;
  /** A SELF-CONTAINED installer that needs no Node/npm at all, per platform.
   *
   *  `installCommand` is `npm install -g …` for every provider, which silently
   *  assumes npm — i.e. node — is already on the machine. When it isn't, the
   *  missing-CLI banner prints a command that CANNOT succeed, so the user watches
   *  an installer fail instead of an app work. Where the vendor ships a native
   *  installer we run that instead (see buildMissingCliScript's ladder).
   *
   *  Trusted, hardcoded constants — never user/manifest input. MUST contain no
   *  double-quotes: the Windows form is wrapped verbatim in `cmd /d /s /c "…"`. */
  nativeInstallCommand?: { posix: string; win32: string };
  /** Optional docs URL surfaced as a manual-setup hint in the missing-CLI banner. */
  docsUrl?: string;
  /** Extra argv tokens that count as an explicit permission stance (so the auto
   *  flag is not appended). Defaults to the auto flag's own leading token. */
  autoStanceTokens?: string[];
  resumeSubcommand?: string; // CLIs that resume via a subcommand instead of a flag (Codex: `codex resume [OPTIONS] [SESSION_ID]`)
  /** How the agent's identity and rules are delivered so they survive compaction and resume (#298). */
  instructionsDelivery?: InstructionsDelivery;
}

/** The engines this build offers the owner. Only Claude Code is supported for
 *  now; the Codex and Gemini presets stay below, fully wired, so bringing one
 *  back means adding its id here and nothing else. Setup's manager step reads this. */
export const BUILD_ENGINES: readonly AgentProvider[] = ['claude'];

export const AGENT_PROVIDER_PRESETS: AgentProviderPreset[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    defaultCommand: 'claude',
    commandGroups: CLAUDE_COMMAND_GROUPS,
    autoModeFlag: '--permission-mode bypassPermissions',
    supportsModel: true,
    modelFlag: '--model',
    autoFlag: '--permission-mode bypassPermissions',
    hiveAware: true,
    canReceiveInbox: true,
    // The newest Opus, and Claude Code's own default on every paid plan. It has
    // a native 1M window, so no [1m] variant is needed. Was Opus 4.8 [1m] from
    // June 2026 until 2026-09-23, never bumped when newer models shipped. Needs
    // Claude Code 2.1.280+; an older CLI runs Opus 5 instead (modelCliFloor.ts).
    recommendedOrchestratorModel: 'claude-opus-5-5',
    resumeFlag: '--resume',
    // Official Claude Code install (npm global). Used by the missing-CLI auto-install.
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    // Anthropic's official native installer — a standalone binary, no node/npm.
    // The only rung of the ladder that works on a machine with no Node at all.
    nativeInstallCommand: {
      posix: 'curl -fsSL https://claude.ai/install.sh | bash',
      win32: 'powershell -c irm https://claude.ai/install.ps1 ^| iex'
    },
    docsUrl: 'https://docs.claude.com/en/docs/claude-code',
    instructionsDelivery: 'system-level'
  },
  {
    id: 'codex',
    label: 'Codex · GPT',
    defaultCommand: 'codex',
    commandGroups: CODEX_COMMAND_GROUPS,
    // Auto mode: never prompt (-a never) but KEEP codex's OS sandbox, scoped to the
    // workspace (-s workspace-write). The app used to spawn with
    // `--dangerously-bypass-approvals-and-sandbox` for one reason only: a hive
    // worker must write to its agent folder at <harnessHome>/hive/agents/<id>/,
    // a different path tree from cwd, which workspace-write blocked. That is a
    // path-layout problem, not a reason to drop the sandbox: codex's documented
    // `--add-dir <DIR>` makes extra directories writable alongside the workspace,
    // and the hive spawn path (hive.ts, which knows the agent dir) appends it.
    // So: approvals off, sandbox on, hive housekeeping still works.
    autoModeFlag: '-a never -s workspace-write',
    autoFlag: '-a never -s workspace-write',
    // Any of these on a command line means the user already chose a posture
    // (including the old full bypass) — do not stack ours on top.
    autoStanceTokens: ['-a', '--ask-for-approval', '-s', '--sandbox', '--full-auto', '--dangerously-bypass-approvals-and-sandbox'],
    // Suppresses first-run interactive prompts (directory-trust gate, installer).
    nonInteractiveEnv: { CODEX_NON_INTERACTIVE: '1' },
    supportsModel: true,
    modelFlag: '--model',
    // Codex is NOT hiveAware in the Claude-flag sense: it has no
    // `--append-system-prompt`/`--settings`. The hive protocol is injected as
    // Codex's INITIAL prompt, which it takes POSITIONALLY (`codex "<prompt>"`) —
    // hence initialPromptFlag is undefined and hive.ts appends it as a trailing arg.
    hiveAware: false,
    // …but Codex DOES expose a Claude-style hooks system (hooks.json / config.toml
    // [hooks]; PreToolUse/PostToolUse/Stop/…), so it gets full hive parity via the
    // 'codex' bridge: a per-agent CODEX_HOME/hooks.json wired to the cth-hook shim
    // (see hive.installCodexHooks). Stop→drain works natively (Codex's Stop honors
    // {decision:'block',reason} = continue-with-prompt, exactly like Claude).
    hookBridge: 'codex',
    // Inbox drains via the codex-hook bridge's Stop→drain (the renderer's idle
    // inbox-wake nudge remains as a harmless fallback for an idle worker).
    canReceiveInbox: true,
    initialPromptFlag: undefined,
    positionalInitialPrompt: true,
    // Codex's long-context coding model for the orchestrator role. // TODO-verify
    // the exact codex CLI model id (couldn't install the codex CLI to confirm).
    recommendedOrchestratorModel: 'gpt-5-codex',
    // Codex resumes via a SUBCOMMAND, not a flag: `codex resume [OPTIONS]
    // [SESSION_ID]`. A `--resume <id>` flag does not exist, which is why restarts
    // used to silently start a brand-new session instead of continuing.
    resumeFlag: undefined,
    resumeSubcommand: 'resume',
    // Official OpenAI Codex CLI install (npm global). Used by the missing-CLI auto-install.
    installCommand: 'npm install -g @openai/codex',
    docsUrl: 'https://github.com/openai/codex',
    instructionsDelivery: 'system-level'
  },
  {
    // Google's official Gemini CLI: the open-source `@google/gemini-cli` binary,
    // with Gemini's native settings hooks
    // (BeforeTool/AfterTool/BeforeAgent/AfterAgent/SessionStart).
    id: 'gemini',
    label: 'Gemini CLI',
    defaultCommand: 'gemini',
    commandGroups: [],
    // `--yolo` is deprecated upstream; approval-mode is the current spelling.
    autoModeFlag: '--approval-mode=yolo',
    autoFlag: '--approval-mode=yolo',
    supportsModel: true,
    modelFlag: '--model',
    hiveAware: false,
    bridge: { kind: 'hooks', shim: 'gemini' },
    canReceiveInbox: true,
    // Keep the TUI alive after processing the hive protocol seed.
    initialPromptFlag: '-i',
    recommendedOrchestratorModel: 'pro',
    resumeFlag: '--resume',
    installCommand: 'npm install -g @google/gemini-cli',
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
    instructionsDelivery: 're-injected on compact'
  }
];

export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

export function normalizeAgentProvider(value: unknown): AgentProvider | undefined {
  return isAgentProvider(value) ? value : undefined;
}

export function providerPreset(provider: AgentProvider): AgentProviderPreset {
  return AGENT_PROVIDER_PRESETS.find((p) => p.id === provider) ?? AGENT_PROVIDER_PRESETS[0];
}

export function isClaudeProvider(provider: AgentProvider | undefined): boolean {
  return provider === 'claude';
}

/** Whether this provider takes the hive's Claude-only identity injection. */
export function isHiveAwareProvider(provider: AgentProvider | undefined): boolean {
  return providerPreset(provider ?? 'claude').hiveAware;
}

/** Whether the router may deliver inbox mail to this provider (else bounce to
 *  the god). True when lifecycle status supports guarded idle delivery. */
export function canReceiveInbox(provider: AgentProvider | undefined): boolean {
  return providerPreset(provider ?? 'claude').canReceiveInbox;
}

/** The bare executable from a command string ('codex --model x' → 'codex'). */
function commandBinary(command: string | undefined): string {
  const first = tokenizeCommand(command ?? '')[0] ?? '';
  // strip a path + extension so 'C:\...\codex.exe' and '/usr/bin/claude' both map
  const leaf = first.split(/[\\/]/).pop() ?? first;
  return leaf.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
}

/** Infer the provider from a command (or honor an explicit override). Any
 *  program but codex and gemini reads as Claude Code: a member saved on another
 *  program is moved to Claude Code when it is loaded (onRetiredEngine), so only
 *  `claude`, a path to it, or no command reaches here in practice. */
export function inferAgentProvider(command: string | undefined, explicit?: unknown): AgentProvider {
  const normalized = normalizeAgentProvider(explicit);
  if (normalized) return normalized;
  const bin = commandBinary(command);
  if (bin === 'codex') return 'codex';
  if (bin === 'gemini') return 'gemini';
  return 'claude';
}

/** Engines a past build ran that this one no longer does: Pi, then Grok, Kimi,
 *  Antigravity, Qwen, OpenCode, Crush, Copilot, Cursor and a custom command
 *  (owner, 2026-11-11: only Claude, Gemini and ChatGPT). Their ids are not
 *  AgentProviders any more, so a team member or Michael saved on one is moved
 *  to Claude Code where it is loaded. */
const RETIRED_ENGINES: ReadonlySet<string> = new Set([
  'pi', 'grok', 'kimi', 'antigravity', 'qwen', 'opencode', 'crush', 'copilot', 'cursor', 'custom'
]);

/** The programs the kept engines run. */
const ENGINE_BINARIES: ReadonlySet<string> = new Set(['claude', 'codex', 'gemini']);

/** Was this saved member set up on a retired engine? A saved engine id
 *  decides; with none saved, the command's program does: any program but
 *  claude, codex or gemini (agy, cursor-agent, qwen, an owner's own command)
 *  is retired. No command at all is Claude Code. */
export function onRetiredEngine(command: string | undefined, provider: unknown): boolean {
  if (typeof provider === 'string' && provider) return RETIRED_ENGINES.has(provider);
  const bin = commandBinary(command);
  return !!bin && !ENGINE_BINARIES.has(bin);
}

/** The member moved to Claude Code: the old engine's command and model go, so
 *  its next start builds the office's Claude command; its name, job, memory and
 *  folders stay. Returned unchanged when it is not on a retired engine. */
export function moveOffRetiredEngine<T extends { command?: string; provider?: unknown; model?: string }>(a: T): T {
  if (!onRetiredEngine(a.command, a.provider)) return a;
  return { ...a, provider: 'claude', command: '', model: undefined };
}

/** The structured bridge descriptor for how a non-hiveAware provider receives hive
 *  lifecycle events. Returns the preset's explicit `bridge` when set (gemini);
 *  else derives `{kind:'hooks', shim}` from the legacy `hookBridge` (codex); else
 *  undefined (claude uses its native `--settings` path). The single accessor call
 *  sites switch on. */
export function bridgeOf(provider: AgentProvider | undefined): BridgeDescriptor | undefined {
  const preset = providerPreset(provider ?? 'claude');
  if (preset.bridge) return preset.bridge;
  if (preset.hookBridge) return { kind: 'hooks', shim: preset.hookBridge };
  return undefined;
}

/** Returns the preset's auto-mode CLI flag for the given provider. Empty string = no flag. */
export function autoModeFlagForProvider(provider: AgentProvider): string {
  return providerPreset(provider).autoModeFlag ?? '';
}

/** Idempotently append a provider's auto-mode flag to an args array, honoring the
 *  user's global autoMode toggle. The renderer's Add Agent flow bakes this same
 *  flag into the command STRING before a GUI hire ever reaches the shared spawn
 *  core (buildSpawnCommand → tokenizeCommand), so `args` for a GUI spawn already
 *  contains it by the time it gets here — this is a no-op for that path. A
 *  main-only spawn (an ephemeral worker) never passes through that
 *  renderer step, so without this it got neither the flag nor any equivalent,
 *  leaving it in an ask-first posture no one could ever answer. */
export function argsWithAutoModeFlag(args: string[], autoMode: boolean, provider: AgentProvider): string[] {
  if (!autoMode) return args;
  const flag = autoModeFlagForProvider(provider);
  if (!flag) return args;
  if (hasAutoModeStance(args, provider)) return args;
  return [...args, ...flag.trim().split(/\s+/)];
}

/** The owner's turn cap (Settings, `maxTurns`) is the most turns any agent may
 *  run. A command can already carry `--max-turns`, typed by the owner or brought
 *  in by a shared hire (hire.ts allows it), so the lowest of them wins: a link
 *  can tighten the cap but never raise it. With no cap set, args are unchanged. */
export function argsWithTurnCap(args: string[], cap: number | undefined): string[] {
  if (typeof cap !== 'number' || !(cap > 0)) return args;
  let lowest = Math.round(cap);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    let value: string | undefined;
    if (a === '--max-turns') {
      if (args[i + 1] !== undefined && !args[i + 1].startsWith('-')) value = args[++i];
    } else if (a.startsWith('--max-turns=')) {
      value = a.slice('--max-turns='.length);
    } else {
      out.push(a);
      continue;
    }
    const n = Number(value);
    if (Number.isInteger(n) && n > 0 && n < lowest) lowest = n;
  }
  return [...out, '--max-turns', String(lowest)];
}

/** True when argv already states a permission posture for this provider: the
 *  auto flag's leading token, or any of the preset's `autoStanceTokens`. Token
 *  match, not substring. A flag written with
 *  its value (`--permission-mode=plan`) counts by its name. */
export function hasAutoModeStance(args: string[], provider: AgentProvider): boolean {
  const preset = providerPreset(provider);
  const flag = preset.autoModeFlag ?? '';
  const lead = flag.trim().split(/\s+/)[0];
  const stance = new Set([...(lead ? [lead] : []), ...(preset.autoStanceTokens ?? [])]);
  return args.some((a) => stance.has(a.split('=')[0]));
}

/** Returns any env vars the provider needs for non-interactive / first-run suppression. */
export function nonInteractiveEnvForProvider(provider: AgentProvider): Record<string, string> {
  return providerPreset(provider).nonInteractiveEnv ?? {};
}

/** Install metadata for a provider's engine CLI, consumed by the missing-CLI
 *  auto-install path. `command` is the (trusted, hardcoded) installer to run when
 *  present; when undefined the caller shows a manual hint and runs NOTHING. `label`
 *  is the friendly CLI name; `docsUrl` is an optional manual-setup link. */
export interface ProviderInstallInfo {
  command?: string;
  /** A node-free installer for this platform, when the vendor ships one. */
  nativeCommand?: string;
  label: string;
  docsUrl?: string;
}

export function installInfoForProvider(
  provider: AgentProvider,
  platform: string = process.platform
): ProviderInstallInfo {
  const p = providerPreset(provider);
  const native = p.nativeInstallCommand;
  return {
    command: p.installCommand,
    nativeCommand: native ? (platform === 'win32' ? native.win32 : native.posix) : undefined,
    label: p.label,
    docsUrl: p.docsUrl
  };
}
