/**
 * Settings inherited from a Claude Code session the app was started inside
 * (2026-11-19). A developer, or an agent building the app, starts the dev app
 * from a Claude Code terminal, and every Claude session the app then starts
 * inherited that session's own settings: CLAUDE_CODE_CHILD_SESSION turned off
 * transcript saving, so every check that reads its answer from a transcript
 * (the privacy check on questions to Research among them) failed as "never
 * took the prompt", and ANTHROPIC_BASE_URL pointed the team at the host's own
 * connection. An app opened from Finder, the Dock or the Start menu has none
 * of them, so for an owner this changes nothing.
 *
 * Only when the app was started inside a session (CLAUDECODE or
 * CLAUDE_CODE_CHILD_SESSION is set) are they dropped: the Claude Code ones and
 * the Anthropic and MCP connection ones, all the host's. CLAUDE_CONFIG_DIR
 * stays (the app sets its own per business). Pure, so it tests as a module.
 */

/** Started inside a Claude Code session. */
export function startedInsideClaudeCode(env: Record<string, string | undefined>): boolean {
  return !!(env.CLAUDECODE || env.CLAUDE_CODE_CHILD_SESSION);
}

/** The names to drop from `env`: none unless started inside a session. */
export function inheritedClaudeVars(env: Record<string, string | undefined>): string[] {
  if (!startedInsideClaudeCode(env)) return [];
  return Object.keys(env).filter((k) =>
    k !== 'CLAUDE_CONFIG_DIR' && (/^CLAUDE/.test(k) || /^ANTHROPIC_/.test(k) || /^MCP_/.test(k)));
}

/** Drop them from `env` in place; how many went. */
export function dropInheritedClaudeVars(env: Record<string, string | undefined>): number {
  const names = inheritedClaudeVars(env);
  for (const k of names) delete env[k];
  return names.length;
}
