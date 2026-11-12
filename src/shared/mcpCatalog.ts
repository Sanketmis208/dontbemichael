/**
 * The MCP server ids a shared hire manifest may name (src/shared/hire.ts checks
 * a manifest's `mcpServers` against this list, and Add Agent shows them by
 * tier). The app does not start any of these servers: the Default MCP servers
 * section and the per agent server map it fed are gone (Claude Code ignored
 * `mcpServers` in the settings file each agent starts with). Keep it free of
 * electron/UI/node imports; main and renderer both read it.
 *
 * Tiers:
 *   - 'safe-readonly' → no secret, no destructive write outside the workspace.
 *   - 'write'         → can change state beyond the workspace.
 *   - 'secret'        → needs an API key, token or connection string.
 * A hire naming a write or secret server lists it for the owner's consent.
 */

export type McpTier = 'safe-readonly' | 'write' | 'secret';

export interface McpCatalogEntry {
  /** Stable catalog id, the name a hire manifest uses. */
  id: string;
  tier: McpTier;
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  { id: 'sequential-thinking', tier: 'safe-readonly' },
  { id: 'time', tier: 'safe-readonly' },
  { id: 'fetch', tier: 'safe-readonly' },
  { id: 'context7', tier: 'safe-readonly' },
  { id: 'filesystem', tier: 'safe-readonly' },
  { id: 'git', tier: 'safe-readonly' },
  { id: 'github-token', tier: 'secret' },
  { id: 'db', tier: 'secret' },
  { id: 'email-calendar', tier: 'secret' },
  { id: 'search-with-key', tier: 'secret' }
];

/** Look up a catalog entry by id. */
export function mcpCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id);
}
