/**
 * Usage telemetry seam (Lane A #6.6 — Seam 1, the LOCKED contract with Oscar/#7).
 *
 * The circuit breaker (breaker.ts) and the durable cost ledger (hive.ts
 * appendCostLedger) consume usage ONLY through the `UsageProvider` interface —
 * they never read transcripts, never compute tokens, and never recompute `usd`.
 * That keeps a single source of truth for cost and lets the backend swap with
 * zero changes to the consumers:
 *
 *   - PRIMARY (pull): `getAgentUsage(agentId)` — the collector implements it.
 *   - ADDITIVE (push): `onAgentUsage(cb)` — optional push from the collector.
 *
 * Two invariants every consumer must honor (Oscar's 7A.1 spike findings):
 *   (i)  Samples are CUMULATIVE snapshots (monotonic running totals). Velocity is
 *        the DIFF of consecutive pulls (Δusd/Δt, Δoutput/Δt) — never treat a
 *        single sample as an increment.
 *   (ii) `model` arrives normalized (base id, any `[1m]` suffix stripped).
 *
 * The provider is the OpenTelemetry collector (telemetry.ts).
 */

/** One cumulative usage snapshot for an agent. The identical row that Oscar
 *  emits, Jim (this lane) persists to cost-ledger.jsonl, and Kevin (#4) stores
 *  in the cost_ledger SQLite table — one shape across all three lanes.
 *
 *  🔒 PII-free by construction: the provider's normalize step allowlists only
 *  these fields and strips every identity attribute (user.email, account/uuid,
 *  organization.id, hashed user.id) BEFORE emitting. Persist ONLY this sample;
 *  never a raw OTel record. */
export interface AgentUsageSample {
  agentId: string;
  /** Doubles as the #6.6a --resume key AND the cost accounting/dedup key. */
  sessionId: string | null;
  ts: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  /** Normalized base model id (no `[1m]` suffix), or null if unknown. */
  model: string | null;
  /** Claude-precomputed cost (live path) / transcript-fallback estimate.
   *  Never recomputed by a consumer. */
  usd: number;
}

/** The seam the usage provider implements. */
export interface UsageProvider {
  /** PRIMARY pull. Returns a cumulative snapshot, or null when unknown. */
  getAgentUsage(agentId: string): AgentUsageSample | null;
  /** ADDITIVE push. Optional. */
  onAgentUsage?(cb: (sample: AgentUsageSample) => void): () => void;
}
