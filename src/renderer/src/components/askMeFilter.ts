/**
 * Which department an Ask me card belongs to, and the board's department
 * filter (docs/designs/ask-me-department-colors.md).
 *
 * One rule decides both a card's color and where the filter files it, so the
 * two can never disagree:
 *
 *   member card (question, report, schedule change, Work style, mail)
 *       -> the department of the one member it names (agents, then the
 *          restorable roster, like AgentAvatar); Michael or nobody -> none
 *   Company foundations card
 *       -> the area its question is about (jobsAsking); a question several
 *          areas share takes the asker's area when it is one of them, else
 *          the first in section order
 *   silent engine, Michael's own cards -> not on this board's list at all
 *
 * The filter never removes a card: it returns the keys to hide, and the board
 * keeps those cards mounted (their typed edits live in local state).
 *
 *   ALL --pick d--> DEPT(d) --pick d / Show all / d empty / focus on a hidden
 *                             card / board hidden--> ALL
 *       DEPT(d) --pick e--> DEPT(e)
 *
 * Kept free of renderer imports so it loads in node tests.
 */
import { departmentOf, type DepartmentSource, type OfficeDepartment } from '@shared/officeRoles';
import { FOUNDATION_JOBS, jobsAsking, type FoundationId, type FoundationJob } from '@shared/foundations';

/** What the board tells a member's card: its department in words, for the
 *  card's label (the cards stay white; owner, 2026-11-05). */
export interface MemberLook { dept: string }

/** A member as the roster holds it. */
export type RosterMember = DepartmentSource & { isGod?: boolean };

/** A member by id: running members first, then last session's team. */
export function findMember(id: unknown, agents: readonly RosterMember[], restorable: readonly RosterMember[]): RosterMember | undefined {
  if (typeof id !== 'string' || !id) return undefined;
  return agents.find((a) => a.id === id) ?? restorable.find((a) => a.id === id);
}

/** The department of the member `id` names; none for Michael or an id on
 *  neither roster (agents write tasks.json, so the id may not be a string). */
export function memberDepartment(id: unknown, agents: readonly RosterMember[], restorable: readonly RosterMember[]): OfficeDepartment | null {
  const m = findMember(id, agents, restorable);
  if (!m || m.isGod) return null;
  return departmentOf(m);
}

/** The area a Company foundations question is about. */
export function foundationDepartment(id: FoundationId, askerDepartment: OfficeDepartment | null): OfficeDepartment | null {
  const jobs = jobsAsking(id);
  if (!jobs.length) return null;
  if (askerDepartment && (jobs as string[]).includes(askerDepartment)) return askerDepartment;
  return FOUNDATION_JOBS.find((j) => jobs.includes(j)) as FoundationJob;
}

/** One card on the board, in the order the board draws it. `dept` null: a
 *  card with no department, always shown. `keep`: shown whatever is picked
 *  (a report), though it still has a color. */
export interface BoardCard { key: string; dept: OfficeDepartment | null; keep?: boolean }

/** The departments with a card on the board, in the order they first appear
 *  top to bottom (owner, design review 1B). */
export function departmentsOnBoard(cards: readonly BoardCard[]): OfficeDepartment[] {
  const out: OfficeDepartment[] = [];
  for (const c of cards) if (c.dept && !out.includes(c.dept)) out.push(c.dept);
  return out;
}

/** The keys a pick hides: cards of other departments. Cards with no
 *  department and reports stay (owner D6). */
export function hiddenKeys(cards: readonly BoardCard[], picked: OfficeDepartment | null): Set<string> {
  const out = new Set<string>();
  if (!picked) return out;
  for (const c of cards) if (c.dept && !c.keep && c.dept !== picked) out.add(c.key);
  return out;
}

/** Whether the chip row shows: two or more departments, or one still picked
 *  (so it can always be unpicked). */
export function showDepartmentRow(cards: readonly BoardCard[], picked: OfficeDepartment | null): boolean {
  return departmentsOnBoard(cards).length >= 2 || !!picked;
}

/** A pick and what arrived since. `seen` holds every key the board has shown
 *  since the first pick; `fresh` the departments with a card that arrived
 *  while another was picked (owner, design review 2A). */
export interface FilterState { picked: OfficeDepartment; seen: Set<string>; fresh: Set<OfficeDepartment> }

/** Picking `dept` (or unpicking it when it is already picked). Moving from one
 *  department to another keeps what arrived elsewhere marked; the department
 *  just picked is cleared. */
export function pickDepartment(state: FilterState | null, dept: OfficeDepartment, cards: readonly BoardCard[]): FilterState | null {
  if (state?.picked === dept) return null;
  if (!state) return { picked: dept, seen: new Set(cards.map((c) => c.key)), fresh: new Set() };
  const fresh = new Set(state.fresh);
  fresh.delete(dept);
  return { picked: dept, seen: state.seen, fresh };
}

/** The state after the board changed: new keys join `seen`, and a new card of
 *  another department marks that department. Returns the same object when
 *  nothing changed, so a render loop can compare by identity. */
export function noteArrivals(state: FilterState | null, cards: readonly BoardCard[]): FilterState | null {
  if (!state) return state;
  const added = cards.filter((c) => !state.seen.has(c.key));
  if (!added.length) return state;
  const seen = new Set(state.seen);
  const fresh = new Set(state.fresh);
  for (const c of added) {
    seen.add(c.key);
    if (c.dept && c.dept !== state.picked) fresh.add(c.dept);
  }
  return { picked: state.picked, seen, fresh };
}

/** Whether a pick should clear itself: its department has no card left. Only
 *  once the roster has loaded, so a passing gap (a reload, the launch frame)
 *  never clears a choice the owner just made. */
export function pickRunsDry(state: FilterState | null, cards: readonly BoardCard[], rosterLoaded: boolean): boolean {
  return !!state && rosterLoaded && !cards.some((c) => c.dept === state.picked);
}
