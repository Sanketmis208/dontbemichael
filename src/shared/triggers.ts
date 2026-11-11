/**
 * TRIGGERS — every way the God orchestrator gets woken up without a human typing.
 *
 * This module is the single contract shared by main, preload and renderer. Two
 * trigger types live under one roof:
 *
 *   schedules  — recurring dispatched missions (the pre-existing `ScheduledMission`;
 *                still owned by config.missions, surfaced under Triggers)
 *   context    — auto-compaction / auto-clearing of agent terminal context
 */

/* ──────────────────────────── context trigger ────────────────────────────── */

/**
 * One half of the context trigger (compact, or clear). Both the *message* sent to
 * the agent and the *conditions* that fire it are user-editable — that is the whole
 * point of surfacing this as a trigger rather than leaving it hardcoded.
 *
 * A run fires for an agent when BOTH conditions hold:
 *   - at least `everyMs` has elapsed since the last run, and
 *   - that agent's context is at least `minContextPct` full.
 * `minContextPct` of 0 disables the pressure gate (time alone fires it).
 */
export interface ContextRule {
  enabled: boolean;
  /** Minimum wall-clock gap between runs. */
  everyMs: number;
  /** Percent (0-100) of the context window that must be used before firing. */
  minContextPct: number;
  /**
   * Separate, lower bar for very large context windows (~1M tokens), where a
   * smaller *fraction* is still an enormous absolute amount of text.
   */
  minContextPctLargeWindow: number;
  /**
   * For `compact`: extra focus text appended to the provider's compaction command,
   * on the providers that read trailing text (codex and opencode ignore it, so it
   * is dropped for them rather than typed as stray input).
   *
   * For `clear`: a literal command that OVERRIDES the provider's own clear verb.
   * That override doubles as the escape hatch for providers we deliberately map to
   * nothing — Crush (palette-only), Copilot (print mode), and custom binaries —
   * where the operator knows their CLI and we don't.
   *
   * Empty string = send the provider's bare command.
   */
  message: string;
}

export interface ContextTriggerConfig {
  compact: ContextRule;
  clear: ContextRule;
}

/**
 * The focus text that has always ridden along with `/compact`. Preserved verbatim
 * as the default so upgrading users see no behaviour change beyond the cadence.
 */
export const DEFAULT_COMPACTION_FOCUS =
  'Keep the current task, recent decisions, open questions, and file paths in play. Drop resolved tangents.';

/**
 * Defaults are deliberately TWICE the old cadence and TWICE the previously
 * documented pressure bar.
 *
 * History: `main/config.ts` documented a 30% / 20% context gate that was never
 * actually implemented — every live agent got compacted on every tick, hourly.
 * This makes the gate real and sets it at 2x, so compaction now costs an agent
 * half as many interruptions.
 *
 * Auto-clear ships DISABLED. `/clear` is destructive — it discards context rather
 * than summarising it, and the codebase already gates the manual verb behind a
 * spoken confirm word. Turning it on is an explicit operator choice.
 */
export const DEFAULT_CONTEXT_TRIGGER: ContextTriggerConfig = {
  // RETIRED (owner, 2026-09-25): the app no longer types /compact on a clock.
  // Compaction is Claude Code's own auto compact, with its window set per agent
  // at spawn (AUTO_COMPACT_WINDOW_TOKENS). A clock usually fired on idle agents
  // with a cold cache, paying full price for savings that may never come. The
  // field stays so older configs still parse; main never arms it.
  compact: {
    enabled: false,
    everyMs: 7_200_000, // 2h — was 1h
    minContextPct: 60, // was a documented-but-unenforced 30
    minContextPctLargeWindow: 40, // was a documented-but-unenforced 20
    message: DEFAULT_COMPACTION_FOCUS
  },
  clear: {
    enabled: false,
    everyMs: 7_200_000,
    minContextPct: 90,
    minContextPctLargeWindow: 80,
    message: ''
  }
};

/**
 * Where Claude Code's own auto compact fires, in tokens, set for every Claude
 * agent at spawn through CLAUDE_CODE_AUTO_COMPACT_WINDOW. Claude Code clamps it
 * to the model's window, so a 200k model keeps its usual point and a 1M model
 * compacts at about 300k instead of about 967k: every turn rereads the whole
 * context, and quality drops as it fills (owner, 2026-09-25; to be measured).
 */
export const AUTO_COMPACT_WINDOW_TOKENS = 300_000;
