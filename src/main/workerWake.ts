/**
 * WorkerWakeWatchdog — main-process inbox-wake watchdog for worker agents (#151).
 *
 * The renderer's idle inbox-wake nudge (useHive.ts effect #3) is the ONLY wake
 * path for a worker that has gone quiet at its prompt: it polls on a setInterval
 * in the renderer, so a throttled/occluded window (Chromium suspends background
 * setInterval timers) can miss the moment mail lands and the worker then sits on
 * an undrained inbox forever — the orchestrator ("god") never has this problem
 * because the main process re-engages it on its own heartbeat cadence.
 *
 * This watchdog is the worker-side counterpart: on a cadence it finds live
 * workers that are genuinely idle, have newly arrived inbox mail, are not
 * paused / not awaiting a human decision, and have not been nudged recently —
 * then types the same guarded nudge the renderer would have, directly into the
 * PTY. Message ids make this edge-triggered: unchanged undrained mail is never
 * re-announced once a minute forever.
 *
 * Safety mirrors the renderer's guarded queue-drain (useHive.ts dispatch):
 *  - only a GENUINELY idle worker is nudged (no PTY output for IDLE_MS — the
 *    same quiescence the renderer's idle fallback uses), never a mid-turn one,
 *  - never inside the boot sequence (BOOT_GRACE_MS from spawn, mirroring the
 *    renderer's bootGraceUntil),
 *  - delivery paused / agent paused / halted → no nudge (ControlRegistry),
 *  - a permission/HITL notification blocks nudges until the agent moves on
 *    (its next tool call, reply, prompt or session, never a subagent's), so an
 *    open prompt is never typed into: the nudge's Enter answered it "Yes" once
 *    a timed block ran out (owner, 2026-10-15),
 *  - a per-worker cooldown (NUDGE_COOLDOWN_MS) so the watchdog and the renderer
 *    nudge don't stack on top of each other.
 *
 * Deliberately the renderer's own nudge text, and the same type pattern the
 * renderer's submitToPty uses (text first, Enter as a separate keystroke).
 *
 * No electron import — unit-testable (mirrors ControlRegistry).
 */

/** No PTY output for this long = genuinely idle (renderer QUIESCE_IDLE_MS). */
export const WORKER_WAKE_IDLE_MS = 12_000;
/** Never nudge inside the boot sequence (renderer BOOT_GRACE_MS). */
export const WORKER_WAKE_BOOT_GRACE_MS = 35_000;
/** Minimum gap between two watchdog nudges of the same worker. */
export const WORKER_WAKE_COOLDOWN_MS = 60_000;
/** Hook events that mean the agent moved past a prompt: a new session ends a
 *  dismissed one; an idle notice does not, since Claude Code can send one while
 *  a permission prompt is still open (the same rule as safeClearer.ts). Only the
 *  main session's events count: a Task subagent's tool calls go on under an
 *  open prompt. */
const MOVED_ON_EVENTS = new Set(['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop']);

/** A hook event message that means "the agent needs the human" — permission /
 *  approve / confirm prompts (mirrors the renderer's needsHuman detection in
 *  useHive.ts). Anything matching the idle-waiting shape is NOT a HITL hold. */
export type HookClass = 'needsHuman' | 'idle' | null;

export function classifyHook(event: string | undefined, message: string | undefined): HookClass {
  if (event === 'Notification') {
    const msg = (message ?? '').toLowerCase();
    const idleWaiting = !msg
      || msg.includes('waiting for your input')
      || msg.includes('is idle')
      || msg.includes('waiting for input');
    const needsHuman = msg.includes('permission')
      || msg.includes('approve')
      || msg.includes('confirm')
      || msg.includes('needs your');
    if (needsHuman && !idleWaiting) return 'needsHuman';
    return 'idle';
  }
  return null;
}

/** One worker's live facts, gathered by the caller each beat. */
export interface WorkerWakeFacts {
  /** Worker agent id (god is never a candidate). */
  agentId: string;
  /** True when this agent is the orchestrator — god is never nudged. */
  isGod?: boolean;
  /** Live PTY id, or undefined when the agent has no terminal. */
  ptyId?: string;
  /** Timestamp of the PTY's last output (0 = never output). */
  lastOutputAt: number;
  /** IDs of undrained inbox messages (empty → nothing to wake for). */
  inboxIds: readonly string[];
  /** ControlRegistry snapshot flags. */
  autoDeliveryPaused: boolean;
  paused: boolean;
  halted: boolean;
}

/** Why the watchdog left a worker with mail alone on a beat. */
export type HoldReason = 'orchestrator' | 'no terminal' | 'delivery paused' | 'paused' | 'halted'
  | 'no output yet' | 'terminal busy' | 'starting' | 'at a prompt' | 'already nudged for this mail' | 'cooldown';

export class WorkerWakeWatchdog {
  /** ptyId → spawn timestamp (boot grace). */
  private spawnedAt = new Map<string, number>();
  /** agentId → last nudge timestamp (cooldown). */
  private lastNudgeAt = new Map<string, number>();
  /** agentId → inbox ids included in the last nudge. This turns the watchdog
   *  into an edge trigger: a worker is nudged again only when a new id appears. */
  private announcedInboxIds = new Map<string, Set<string>>();
  /** agentId → timestamp of the last needsHuman hook notification. */
  private lastHumanNeedsAt = new Map<string, number>();
  /** agentId → when it last moved past a prompt (MOVED_ON_EVENTS). */
  private lastMovedOnAt = new Map<string, number>();
  /** agentId → when its inbox last went from empty to holding mail. */
  private mailSince = new Map<string, number>();
  /** agentId → why the last beat did not nudge it ('nudged' when it did). */
  private skipReason = new Map<string, HoldReason | 'nudged'>();

  /** Record a PTY spawn so its boot sequence is left alone. */
  noteSpawn(ptyId: string, at = Date.now()): void {
    this.spawnedAt.set(ptyId, at);
  }

  /** Feed hook events (from HookServer) so a HITL prompt blocks nudges.
   *  `subagent` is true for a Task subagent's frame. */
  noteHook(agentId: string | undefined, event: string | undefined, message: string | undefined, at = Date.now(), subagent = false): void {
    if (!agentId) return;
    if (classifyHook(event, message) === 'needsHuman') this.lastHumanNeedsAt.set(agentId, at);
    else if (!subagent && event && MOVED_ON_EVENTS.has(event)) this.lastMovedOnAt.set(agentId, at);
  }

  /** Forget per-agent state (e.g. the agent's PTY was closed). */
  forget(agentId: string, ptyId?: string): void {
    this.lastNudgeAt.delete(agentId);
    this.announcedInboxIds.delete(agentId);
    this.lastHumanNeedsAt.delete(agentId);
    this.lastMovedOnAt.delete(agentId);
    this.mailSince.delete(agentId);
    this.skipReason.delete(agentId);
    if (ptyId) this.spawnedAt.delete(ptyId);
  }

  /** The worker ids that should be nudged right now, in stable registry order.
   *  Pure decision — the caller types the nudge. */
  decide(facts: readonly WorkerWakeFacts[], now = Date.now()): string[] {
    const out: string[] = [];
    for (const f of facts) {
      const inboxIds = new Set(f.inboxIds.filter((id) => typeof id === 'string' && id.length > 0));
      if (inboxIds.size === 0) {
        // A fully drained inbox starts a fresh announcement cycle and bounds the
        // remembered set even for a worker that lives for months.
        this.announcedInboxIds.delete(f.agentId);
        this.mailSince.delete(f.agentId);
        this.skipReason.delete(f.agentId);
        continue;
      }
      // Michael is never nudged here (his heartbeat is), so his mail is not reported.
      if (!f.isGod && !this.mailSince.has(f.agentId)) this.mailSince.set(f.agentId, now);
      const why = this.holdReason(f, inboxIds, now);
      if (why) { this.skipReason.set(f.agentId, why); continue; }
      this.skipReason.set(f.agentId, 'nudged');
      this.lastNudgeAt.set(f.agentId, now);
      this.announcedInboxIds.set(f.agentId, inboxIds);
      out.push(f.agentId);
    }
    return out;
  }

  /** Why a worker with mail is not nudged now, or null when it should be. */
  private holdReason(f: WorkerWakeFacts, inboxIds: Set<string>, now: number): HoldReason | null {
    if (f.isGod) return 'orchestrator';
    if (!f.ptyId) return 'no terminal';
    if (f.autoDeliveryPaused) return 'delivery paused';
    if (f.paused) return 'paused';
    if (f.halted) return 'halted';
    if (f.lastOutputAt <= 0) return 'no output yet'; // still booting
    if (now - f.lastOutputAt < WORKER_WAKE_IDLE_MS) return 'terminal busy'; // mid-turn
    const spawned = this.spawnedAt.get(f.ptyId) ?? 0;
    if (spawned > 0 && now - spawned < WORKER_WAKE_BOOT_GRACE_MS) return 'starting';
    // Waiting at a prompt: never typed into, however long it waits.
    if ((this.lastHumanNeedsAt.get(f.agentId) ?? 0) > (this.lastMovedOnAt.get(f.agentId) ?? 0)) return 'at a prompt';
    const announced = this.announcedInboxIds.get(f.agentId);
    if (announced && !Array.from(inboxIds).some((id) => !announced.has(id))) return 'already nudged for this mail';
    const lastNudge = this.lastNudgeAt.get(f.agentId) ?? 0;
    if (lastNudge > 0 && now - lastNudge < WORKER_WAKE_COOLDOWN_MS) return 'cooldown';
    return null;
  }

  /** Workers whose mail has waited at least `minWaitMs`, with why the last
   *  beat left them alone ('nudged' when it typed). Diagnostics for a member
   *  that stops taking mail: the log says which guard held it. */
  waiting(minWaitMs: number, now = Date.now()): Array<{ agentId: string; waitedMs: number; reason: HoldReason | 'nudged' }> {
    const out: Array<{ agentId: string; waitedMs: number; reason: HoldReason | 'nudged' }> = [];
    for (const [agentId, since] of this.mailSince) {
      const reason = this.skipReason.get(agentId);
      if (reason && now - since >= minWaitMs) out.push({ agentId, waitedMs: now - since, reason });
    }
    return out;
  }

  /** Last time this worker was nudged (0 = never) — useful for diagnostics. */
  lastNudge(agentId: string): number {
    return this.lastNudgeAt.get(agentId) ?? 0;
  }
}
