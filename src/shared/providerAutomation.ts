import type { AgentProvider } from './agentProvider';

/** What one provider's interactive TUI accepts for each context action. */
interface ProviderContextCommands {
  /** Summarise-in-place. `null` = no command we can type with confidence. */
  compact: string | null;
  /** Discard-and-restart. `null` = same. */
  clear: string | null;
}

const NO_CONTEXT_COMMANDS: ProviderContextCommands = {
  compact: null,
  clear: null
};

/**
 * THE per-provider context-command table.
 *
 * Deliberately a total `Record<AgentProvider, …>` and NOT a switch with a
 * `default:` arm — the previous switch silently answered `null` for seven of the
 * eleven providers, so auto-compaction quietly did nothing for most of the fleet
 * and nobody found out. A total record makes the compiler stop the next person
 * who adds a provider until they have actually looked its commands up.
 *
 * `null` means "we could not establish a command we trust", NOT "we didn't
 * check". A wrong slash command typed into a live terminal is worse than no
 * command: at best it is dead text the model answers, at worst it fires some
 * other verb. Every entry below cites where it was verified — mostly by reading
 * the SHIPPED BINARY of each CLI (its own embedded command table / docs), which
 * outranks web docs because it cannot lag the installed version.
 */
const CONTEXT_COMMANDS: Record<AgentProvider, ProviderContextCommands> = {
  // claudeCommands.ts:34,37 (this repo's own catalog): `/compact` takes a focus
  // ("usage: /compact keep the auth decisions"), `/clear` starts a fresh
  // conversation and reclaims the window.
  claude: { compact: '/compact', clear: '/clear' },

  // Codex 0.137.0 binary, TUI slash-command description table:
  //   "summarize conversation to prevent hitting the context limit"  → /compact
  //   "clear the terminal and start a new chat"                      → /clear
  // NOTE this contradicts codexCommands.ts, which lists /clear but NOT /compact.
  // The binary is right and that catalog is incomplete (see report).
  codex: { compact: '/compact', clear: '/clear' },

  // Grok binary ships its own docs inline (04-slash-commands.md):
  //   "/compact [context] — Compress conversation history… Optionally specify
  //    what to preserve", example `/compact keep the auth implementation details`
  //   "/new — Start a new session, clearing the current conversation.
  //    Aliases: /clear"
  // `/new` is the documented spelling (and what grokCommands.ts:13 already
  // records), so prefer it over the alias.
  grok: { compact: '/compact', clear: '/new' },

  // Moonshot kimi-cli slash-command reference: `/compact` accepts appended
  // custom instructions ("/compact preserve database-related discussions");
  // `/clear` (alias /reset) "Clear the current session's context and start a
  // new conversation". NB `/new` there forks a session rather than discarding.
  kimi: { compact: '/compact', clear: '/clear' },

  // antigravity.google/docs/cli/reference (Google's own command table):
  //   "/clear  (/new)  — Clear the terminal and reset active conversation
  //    contexts."     ← a REAL context reset, and
  //   "Ctrl+L  cli.clear_screen — Refreshes and clears the visual terminal
  //    buffer."       ← the screen-only one. The two are different things, so
  // the "agy /clear only clears the screen" worry does not hold.
  // That reference lists NO compaction verb at all (zero hits for compact /
  // compress / summarize), and the shipped `agy` binary has no such literal
  // either — agy compacts AUTOMATICALLY when the window fills ("# Resuming from
  // a compaction"). Nothing to type, so: null.
  antigravity: { compact: null, clear: '/clear' },

  // Google Gemini CLI's command reference documents `/compress` as replacing
  // the chat context with a summary and `/clear` as starting a clean context.
  gemini: { compact: '/compress', clear: '/clear' },

  // qwen-code's bundled cli.js, verbatim:
  //   compressCommand = { name:"compress", altNames:["summarize"],
  //     description "Compresses the context by replacing it with a summary." }
  //   and its action reads `context.invocation?.args` as `customInstructions`
  //   (capped at 2000 chars) → it genuinely takes a focus.
  //   clearCommand    = { name:"clear", altNames:["reset","new"],
  //     description "Clear conversation history and free up context." }
  // It is `/compress`, NOT `/compact`: qwen dropped upstream gemini-cli's
  // `compact` altName, so `/compact` would land as plain text here.
  qwen: { compact: '/compress', clear: '/clear' },

  // opencode binary's command registry, verbatim:
  //   { title:"Compact session", value:"session.compact",
  //     slash:{ name:"compact", aliases:["summarize"] }, run: … }
  // and its own tip text "Run /compact to summarize long sessions near context
  // limits".
  // `/clear` does NOT exist in the binary (zero literals); the fresh-session
  // verb is `/new` — matched exactly (`t.trim().toLowerCase()==="/new"`).
  opencode: { compact: '/compact', clear: '/new' },

  // Crush has NO typed slash commands at all. Its own binary strings show
  // "Summarize Session" / "New Session" as ctrl+p COMMAND-PALETTE rows, and the
  // hint "/ or ctrl+p" means a leading `/` OPENS that palette rather than
  // submitting a command. Typing "/compact" would filter a modal and leave it
  // open, swallowing everything queued behind it. Nothing safe to type: null.
  // (Crush's compact/clear are reachable only over its HTTP API.)
  crush: NO_CONTEXT_COMMANDS,

  // Copilot's INTERACTIVE mode does have `/compact [FOCUS-INSTRUCTIONS]` and
  // `/clear` — but this app never runs it interactively. The preset spawns it in
  // print mode (`initialPromptFlag: '-p'`, `canReceiveInbox: false`), which runs
  // one prompt and EXITS. There is no prompt left alive to type a slash command
  // into, so both are null by construction rather than by ignorance.
  copilot: NO_CONTEXT_COMMANDS,

  // Cursor Agent CLI (`agent`) is interactive in this preset, but its slash /
  // command surface is not yet verified against a frozen binary catalog in-repo.
  // Prefer null over guessing — wrong slashes into a live TUI are worse than no
  // auto-compact. Revisit when a shipped command table is transcribed.
  cursor: NO_CONTEXT_COMMANDS,

  // An arbitrary user binary. We cannot know its command surface, and guessing
  // means typing slashes into someone's unknown REPL.
  custom: NO_CONTEXT_COMMANDS
};

/** Every distinct compaction verb this harness can type, across all providers.
 *  Derived from CONTEXT_COMMANDS rather than hand-listed, so a provider added to
 *  that table is covered here without a second edit anyone could forget. */
const COMPACT_VERBS: ReadonlySet<string> = new Set(
  Object.values(CONTEXT_COMMANDS)
    .map((c) => c.compact)
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
);

/**
 * Every verb this harness can type into a provider's TUI, compaction and
 * clearing alike.
 *
 * Derived from CONTEXT_COMMANDS for the same reason COMPACT_VERBS is: a
 * provider added to that table is covered here without a second edit anyone
 * could forget. The owner's composer matches against this, so a verb the app
 * itself would send on the owner's behalf is never refused as a question.
 */
export const CONTEXT_COMMAND_VERBS: ReadonlySet<string> = new Set(
  Object.values(CONTEXT_COMMANDS)
    .flatMap((c) => [c.compact, c.clear])
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
);

/**
 * Is this queued text a compaction command?
 *
 * Matches the leading VERB only, so `/compact keep the auth decisions` counts
 * while a human sentence that merely mentions compaction does not — the queue
 * carries both, and mistaking prose for a command would silently drop real work.
 *
 * Provider-agnostic on purpose: the queue is keyed by agent, not provider, and a
 * duplicate `/compact` is worth dropping regardless of which CLI is going to
 * receive it.
 */
export function isCompactionCommand(text: string): boolean {
  return COMPACT_VERBS.has(text.trim().split(/\s+/)[0]);
}

/** Initial TUI output needs a short provider-specific settle before typing. */
export function terminalReadySettleMs(provider: AgentProvider): number {
  switch (provider) {
    case 'kimi': return 650;
    case 'grok': return 500;
    case 'gemini': return 500;
    case 'codex': return 500;
    default: return 400;
  }
}

/**
 * A live TUI is ready after it has produced an initial frame and had a short
 * settle period. Do not require output to become quiet: Codex can continuously
 * repaint its status line, which previously kept queued messages blocked until
 * every readiness attempt timed out.
 *
 * `undefined` is accepted for compatibility with a renderer hot-reloaded
 * against an older main process that does not yet expose `hasOutput`.
 */
export function terminalReadyToReceive(
  hasOutput: boolean | undefined,
  elapsedMs: number,
  provider: AgentProvider
): boolean {
  if (provider === 'antigravity') {
    return elapsedMs >= terminalReadySettleMs(provider);
  }
  return hasOutput !== false && elapsedMs >= terminalReadySettleMs(provider);
}
