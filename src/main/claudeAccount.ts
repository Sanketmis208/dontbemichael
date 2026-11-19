/**
 * Which Claude plan the owner's account is on, from Claude Code's own account
 * record (`.claude.json` in its config folder). Only the plan fields are read;
 * the file holds no secret the app looks at, and nothing is written.
 */
import { readFileSync } from 'node:fs';
import { planFromAccount, type ClaudePlanId } from '../shared/claudePlan';
import { claudeJsonFile } from './claudeHome';

const KEEP_MS = 10 * 60_000;
let cached: { at: number; plan: ClaudePlanId | null } | null = null;

/** The account record's path: Claude Code keeps it beside its config folder's
 *  contents when CLAUDE_CONFIG_DIR is set, else in the home folder. */
export function claudeAccountFile(): string {
  return claudeJsonFile();
}

/** The detected plan, read at most every ten minutes. */
export function readClaudePlan(now = Date.now(), file = claudeAccountFile()): ClaudePlanId | null {
  if (cached && now - cached.at < KEEP_MS) return cached.plan;
  let plan: ClaudePlanId | null = null;
  try {
    const acct = (JSON.parse(readFileSync(file, 'utf8')) as { oauthAccount?: Record<string, unknown> }).oauthAccount;
    plan = planFromAccount(acct ? { organizationType: acct.organizationType, organizationRateLimitTier: acct.organizationRateLimitTier, userRateLimitTier: acct.userRateLimitTier } : null);
  } catch { plan = null; }
  cached = { at: now, plan };
  return plan;
}

/** Forget the cached reading (tests, and after the owner signs in again). */
export function forgetClaudePlan(): void { cached = null; }
