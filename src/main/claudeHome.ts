/**
 * Where Claude Code keeps its settings and account record for this app run.
 *
 * Claude Code reads CLAUDE_CONFIG_DIR when it is set: its settings.json,
 * plugins, projects and conversations live there, and its account record is
 * `<dir>/.claude.json` instead of `~/.claude.json`. Its sign in is kept per
 * folder too (probed on Claude Code 2.1.328, docs/designs/separate-businesses.md
 * T4). The app sets it for a business with its own Claude login (E6), and an
 * owner may export it themselves; either way, every file the app reads or
 * writes for Claude goes through here, so it is the folder Claude really uses.
 *
 * Plain node, no electron import, so it tests as a node module.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The CLAUDE_CONFIG_DIR in effect, or null for Claude's default (~/.claude). */
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const d = env.CLAUDE_CONFIG_DIR?.trim();
  return d ? d : null;
}

/** Claude Code's settings folder: settings.json, settings.local.json, plugins. */
export function claudeSettingsDir(home: string = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  return claudeConfigDir(env) ?? join(home, '.claude');
}

/** Claude Code's account record and per project trust: `.claude.json`. */
export function claudeJsonFile(home: string = homedir(), env: NodeJS.ProcessEnv = process.env): string {
  const d = claudeConfigDir(env);
  return d ? join(d, '.claude.json') : join(home, '.claude.json');
}
