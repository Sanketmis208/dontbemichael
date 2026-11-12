/**
 * Context upkeep. Nothing runs on a clock (owner, 2026-09-25): compaction is
 * Claude Code's own auto compact, and a conversation is cleared only after a
 * finished, handed-off task (main/safeClearer.ts).
 */

/**
 * Where Claude Code's own auto compact fires, in tokens, set for every Claude
 * agent at spawn through CLAUDE_CODE_AUTO_COMPACT_WINDOW. Claude Code clamps it
 * to the model's window, so a 200k model keeps its usual point and a 1M model
 * compacts at about 300k instead of about 967k: every turn rereads the whole
 * context, and quality drops as it fills (owner, 2026-09-25; to be measured).
 */
export const AUTO_COMPACT_WINDOW_TOKENS = 300_000;
