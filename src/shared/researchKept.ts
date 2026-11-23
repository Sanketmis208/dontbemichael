/**
 * What the privacy check kept back from a team member's question to Research
 * (owner, 2026-11-20: "ask me card should offer adding whats blocked in this
 * case to this allow list"). The app files one per question in its private
 * folder; Ask me shows it with each kept back piece and Always allow, Ask
 * again and Keep private (ResearchKeptCards).
 */
export interface ResearchKept {
  /** The question's message id. */
  id: string;
  at: number;
  /** Who asked: a team member's id, or Michael's. */
  from: string;
  fromName: string | null;
  subject: string;
  /** The exact words the check took out (trustLayer keptParts). */
  parts: string[];
  /** True when the question was not sent at all; false when it went without them. */
  denied: boolean;
}

/** The most kept back questions waiting on Ask me at once; older ones drop. */
export const MAX_KEPT_OPEN = 20;
