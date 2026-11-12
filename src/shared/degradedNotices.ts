/**
 * Members that started with something missing (the hive's `degraded` sentence:
 * a proxy bridge that never bound, a team list it couldn't read, a hooks file
 * of the owner's it left alone). Main used to tell the owner only with a
 * desktop notification, which the notifications setting can turn off, so
 * with it off nobody heard. Now each one is also a report card from Michael
 * on Ask me (owner, 2026-11-10).
 *
 * One notice per member, from its latest start: a start with nothing missing
 * clears it, and a new problem replaces it. Got it hides that sentence for the
 * rest of the session; a different one, or the same one after a clean start,
 * shows again.
 *
 * Plain TypeScript with no imports from either side, so the tests can run it.
 */

export interface DegradedNotice {
  agentId: string;
  name: string;
  /** The hive's sentence, as the desktop notification says it. */
  message: string;
  /** When the member started. */
  at: number;
}

export interface DegradedState {
  notices: DegradedNotice[];
  /** `agentId` and `message` the owner said Got it to, this session. */
  dismissed: string[];
}

/** No office runs this many members; a cap keeps a loop from growing it. */
export const DEGRADED_NOTICES_MAX = 50;

export const emptyDegraded = (): DegradedState => ({ notices: [], dismissed: [] });

const key = (agentId: string, message: string): string => `${agentId}\u0000${message}`;

/** A member started: keep its sentence, or clear it when it started clean.
 *  A clean start also forgets its Got it, so the problem coming back shows. */
export function noteStart(s: DegradedState, agentId: string, name: string, message: string | undefined, at: number): DegradedState {
  const others = s.notices.filter((n) => n.agentId !== agentId);
  const text = (message ?? '').trim();
  if (!text) {
    return { notices: others, dismissed: s.dismissed.filter((d) => !d.startsWith(`${agentId}\u0000`)) };
  }
  const notices = [...others, { agentId, name, message: text, at }];
  return { notices: notices.slice(-DEGRADED_NOTICES_MAX), dismissed: s.dismissed };
}

/** Got it on a member's card. */
export function dismissNotice(s: DegradedState, agentId: string): DegradedState {
  const n = s.notices.find((x) => x.agentId === agentId);
  if (!n) return s;
  const k = key(n.agentId, n.message);
  return { notices: s.notices, dismissed: s.dismissed.includes(k) ? s.dismissed : [...s.dismissed, k].slice(-DEGRADED_NOTICES_MAX) };
}

/** The cards Ask me shows: not dismissed, members still on the team (a member
 *  who left takes its card with it), oldest first. */
export function shownNotices(s: DegradedState, onTeam: (agentId: string) => boolean): DegradedNotice[] {
  return s.notices
    .filter((n) => onTeam(n.agentId) && !s.dismissed.includes(key(n.agentId, n.message)))
    .sort((a, b) => a.at - b.at);
}
