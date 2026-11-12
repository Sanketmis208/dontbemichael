/**
 * When the app ships a better default job description for a pack card, every
 * office that already hired from that card is offered it on Ask me, never
 * given it silently: the owner may have changed the job (owner, 2026-10-03,
 * inbox zero). "See it" previews the new text with the owner's changes
 * reapplied, and "Use it" saves that and adds the card's starter jobs; "Keep
 * mine" keeps everything (work-style-change-request.md, D7).
 * Each update is offered once per team member.
 */
import type { AgentDefinitionV2 } from './agentDefinition';
import { teamMemberGoal, teamMemberName, teamMemberRole } from './teamPlan';
import { appendOnce, splitBindings, swapName } from './hireTemplates';

export interface WorkStyleUpdate {
  /** Stable id, recorded once the owner decides. */
  key: string;
  /** The pack card id it applies to, in every pack unless `packs` names some. */
  cardId: string;
  /** The business types whose card changed, when the others did not: a Kelly
   *  in another pack is offered nothing, since her text is the same. */
  packs?: readonly string[];
  /** Locale key for the one line saying why (behind the card's info icon). */
  whyKey: string;
  /** The duty this update brings, as the change to work into the member's
   *  current job (owner, CEO review D3, 2026-11-07): never the whole new text.
   *  English, like the pack texts. */
  duty: string;
}

/** Newest first: a card is offered the first update that matches it, and the
 *  newest text already holds the older changes. */
export const WORK_STYLE_UPDATES: readonly WorkStyleUpdate[] = [
  // Marketing keeps the referenceable customers, Sales the customer list (owner, 2026-11-06/07).
  { key: 'ryan-reference-customers-2026-11', cardId: 'ryan', whyKey: 'askMe.workStyleWhy.customerLists',
    duty: "Keep the list of customers we may reference: one row per customer with what they may be named for (name, logo, case study, social post, quote), why, where that came from, who decided and when, and a history of each change. Before naming a customer, check the list and ask the teammates in contact with them for praise in the customer's own words and anything they said about being named. Quote only a customer's exact words, with where they were found. When you can't tell whether a customer may be named, ask Michael." },
  { key: 'dwight-customer-list-2026-11', cardId: 'dwight', whyKey: 'askMe.workStyleWhy.customerLists',
    duty: "Keep the office's customer list: every customer ever won that the office knows by name, one row each with when and where it came from, and tell Michael about each new one." },
  // Replies leave as the Sending setting allows, never "always a draft" (owner, 2026-10-05).
  { key: 'pam-sending-2026-10', cardId: 'pam', whyKey: 'askMe.workStyleWhy.sendingSetting',
    duty: "Send replies the way your Sending setting on the Access tab allows: sent, proposed for the owner's approval, or saved as drafts. Never keep every reply as a draft when the setting allows more." },
  { key: 'kelly-sending-2026-10', cardId: 'kelly', packs: ['saas-consulting'], whyKey: 'askMe.workStyleWhy.sendingSetting',
    duty: "Send replies the way your Sending setting on the Access tab allows: sent, proposed for the owner's approval, or saved as drafts. Never keep every reply as a draft when the setting allows more." },
  { key: 'pam-inbox-zero-2026-10', cardId: 'pam', whyKey: 'askMe.workStyleWhy.pamInboxZero',
    duty: "Keep the inbox at zero: give every email an outcome and move it out of the inbox, and never delete an email." },
  // Facts come from the teammate who has them, Michael only when they can't help (owner, 2026-10-03).
  { key: 'kelly-ask-teammates-2026-10', cardId: 'kelly', packs: ['saas-consulting'], whyKey: 'askMe.workStyleWhy.askTeammates',
    duty: "Ask the teammate whose role holds the answer directly, and go to Michael only when they can't help." },
  { key: 'ryan-ask-teammates-2026-10', cardId: 'ryan', packs: ['retail-shop'], whyKey: 'askMe.workStyleWhy.askTeammates',
    duty: "Ask the teammate whose role holds the answer directly, and go to Michael only when they can't help." }
];

export interface WorkStyleOffer {
  /** The newest update in it: names the card. */
  key: string;
  /** Every update this card brings at once, newest first: the ones newer
   *  than the newest the owner already decided (deciding one decides the
   *  older ones too, eng review E1). */
  keys: string[];
  /** Their duties, oldest first, worked into the member's job together. */
  duties: string[];
  whyKey: string;
  agentId: string;
  /** "<businessType>/<card id>", for the starter jobs. */
  sourceCard: string;
  goal: string;
  description: string;
  /** The owner's applied change requests, oldest first, reapplied to the new
   *  text in the preview (work-style-change-request.md, eng D7). */
  changes: string[];
  /** No change list to carry over: the card says earlier edits are replaced
   *  (eng D8). Members changed before the list existed can't be told apart. */
  olderEdits: boolean;
}

/** Where an owner's decision is kept: `${key}:${agentId}`. */
export const decisionId = (key: string, agentId: string): string => `${key}:${agentId}`;

/**
 * The offers due now. `cards` maps "<businessType>/<card id>" to the card. A
 * team member matches by the card it was hired from, else (a member started
 * at setup) by its id in this office's own pack. Nothing is offered when its
 * text is already the new text, or the owner already decided.
 */
export function workStyleOffers(
  agents: Array<{ id: string; name?: string; goal?: string; description?: string; sourceCard?: string; isGod?: boolean; isAssistant?: boolean; jobChanges?: Array<{ text: string }> }>,
  cards: Map<string, AgentDefinitionV2>,
  businessType: string | undefined,
  business: { name?: string; city?: string },
  decided: Record<string, unknown> | undefined
): WorkStyleOffer[] {
  const out: WorkStyleOffer[] = [];
  for (const a of agents) {
    if (a.isGod || a.isAssistant) continue;
    const sourceCard = a.sourceCard ?? (businessType ? `${businessType}/${a.id}` : undefined);
    if (!sourceCard) continue;
    const [pack, cardId] = sourceCard.split('/');
    const mine = WORK_STYLE_UPDATES.filter((u) => u.cardId === cardId && (!u.packs || u.packs.includes(pack)));
    const firstDecided = mine.findIndex((u) => decided?.[decisionId(u.key, a.id)]);
    const pending = firstDecided === -1 ? mine : mine.slice(0, firstDecided);
    const update = pending[0];
    const def = cards.get(sourceCard);
    if (!update || !def) continue;
    // Someone hired from the card under another name gets the text with their
    // own name in it, as hiring does (2026-10-03: Erin, hired from Pam's
    // card, was given "Pam runs the business inbox").
    const cardName = teamMemberName(def);
    const name = a.name?.trim() || cardName;
    const goal = swapName(teamMemberGoal(def, business), cardName, name);
    // The lines a hire binding wrote stay: Michael routes by them, and the new
    // default text knows nothing about them (splitBindings).
    const bindings = splitBindings(a.description ?? '').lines;
    const description = bindings.reduce((d, line) => appendOnce(d, line), swapName(teamMemberRole(def), cardName, name));
    if ((a.goal ?? '').trim() === goal.trim()) continue;
    const changes = (a.jobChanges ?? []).map((c) => c.text).filter(Boolean);
    out.push({ key: update.key, keys: pending.map((u) => u.key), duties: pending.map((u) => swapName(u.duty, cardName, name)).reverse(), whyKey: update.whyKey, agentId: a.id, sourceCard, goal, description, changes, olderEdits: changes.length === 0 });
  }
  return out;
}
