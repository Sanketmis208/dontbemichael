# Team upgrade: an Ask me card, no top bar chip

Status: Built (2026-11-05), not yet seen in the running app.

## The ask

Owner, 2026-11-05, with a screenshot of the top bar chip "Team upgrade ready" and the popup "Your
team has an upgrade waiting": "the chip "team upgrade is ready" is not required. also the update
popup should be a card in "Ask me" area."

## What is true today (receipts)

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| P1 | Main works out when live agents run an older Claude Code than is installed, and pushes it | `src/shared/cliUpdate.ts:37-48`, `src/main/index.ts:431-448` | verified |
| P2 | The owner sees it as a top right toast and a top bar chip | `src/renderer/src/components/CliUpdateNotice.tsx:46-115`; `App.tsx:536`; `TopBar.tsx:68` | verified |
| P3 | Later hides the toast until a newer Claude Code is installed (kept in the renderer's local storage); the chip brings it back meanwhile | `CliUpdateNotice.tsx:12-15`, `:21-35`, `:94-117` | verified |
| P4 | The only action, Close office & reopen, runs closing time and reopens the app | `App.tsx:245-260` (`closeOfficeAndReopen`) | verified |
| P5 | A new app version already became Michael's card on Ask me (owner, 2026-11-04): app made, nothing in tasks.json, counted in the Needs you number, Later per version | `src/renderer/src/components/UpdateCard.tsx:13-31`, `src/renderer/src/shell/useNeedsYou.ts:136`, `:246-252` | verified |

unverified=0

## Step 0

### 0A Premise
Two things compete for the owner's eye at the top right while the real list is on Ask me. The owner
already moved the app update there (P5); this is the same kind of thing. Do nothing: a popup that
covers the board, and a chip that adds noise to the top bar.

### 0B Existing code
| Sub problem | Reuse |
|---|---|
| Whether an upgrade waits | `cliUpdateStatus` and the main push (P1), unchanged |
| A card from Michael on Ask me | `UpdateCard`'s frame, avatar and buttons |
| Counted in the Needs you number | the feed's `update` pattern in `useNeedsYou.ts` |
| The action | `closeOfficeAndReopen` (P4), unchanged |

### 0C Dream state
```
  TODAY                        THIS PLAN                       12 MONTH IDEAL
  popup over the board,  --->  Michael's card on Ask me, ---> every "the app needs you"
  chip in the top bar          no chip                         moment is one Ask me card
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| U1 owner | The top bar chip (P2) | shown while agents are behind | removed | approved | Owner ask, 2026-11-05 (quoted above) |
| U2 owner | The upgrade popup (P2) | top right toast | Michael's card on Ask me | approved | Owner ask, 2026-11-05 (quoted above) |
| U3 owner | When the card comes back after Later, now that no chip brings it back (P3) | Later hides the toast until a newer Claude Code; the chip brings it back | until the next newer Claude Code | approved | Owner D2, 2026-11-05: A. Today's rule kept, per installed version, across restarts (`cth.cliUpdateLaterFor`); no reminder in between |

## Mode

HOLD SCOPE (owner D1, 2026-11-05). No new approach decision was needed. HOLD checks: about 7
files [estimated] (`CliUpdateNotice.tsx` becomes the card, `AskMeTab.tsx`, `useNeedsYou.ts`,
`App.tsx`, `TopBar.tsx`, tests, DESIGN.md), no new service; nothing to defer.

## Answered (U3, owner D2: A)
Commitment comparison:

```text
Commitment                         | Source | Current                          | A Next newer version     | B Next day
Card on Ask me while agents behind | U2     | approved                         | yes                      | yes
After Later                        | pending| toast hidden until newer version | card hidden until newer  | card hidden 24 hours,
                                   |        | (chip stays as reminder)         | Claude Code              | then back
Reminder in between                | U1     | the chip                         | none                     | the card itself
```

Question: D2 — U3: After you press Later, when should the upgrade card come back?
Header: After Later
A) With the next newer version (recommended)
B) The next day

Decided as small mechanics (owner rule 2026-10-27), each following the app update card (P5):
- The card counts in the Needs you number while shown, keeps All clear away, and sits on Ask me
  beside the app update card, from Michael (his avatar), app made: nothing in tasks.json.
- Its words are today's (`cliUpdate.title`, `body`, `bodyPlural`, `later`, `closeAndReopen`); the
  chip's copy (`cliUpdate.chip`, `chipTitle`) is removed.
- Close office & reopen reaches App's `closeOfficeAndReopen` through a source App registers once
  at start (as `setWorkStyleOffersSource` does, `useNeedsYou.ts:77`), not an event. Starting the
  close no longer writes Later (today `CliUpdateNotice.tsx:65` does): the card steps aside only
  while closing time is open, and comes back on a refused start, on `onClosingTime` 'cancelled'
  and on the closing bar's Cancel (`App.tsx:218-233`), since the agents are still behind.
- A null status (agents caught up) replaces the stored one and the card leaves; the start up read
  only fills the status when no push has landed yet, so a late read never puts back an old one
  (today's `prev ?? cur`, `CliUpdateNotice.tsx:43`, has that gap).

## Accepted scope

1. **No chip (U1).** `CliUpdateBadge` and its use in `TopBar.tsx:68` go, with its copy
   (`cliUpdate.chip`, `chipTitle` in en, ar and zh-CN).
2. **The card (U2).** `CliUpdateCard` on Ask me: Michael's avatar, the title, the body (one or
   several agents behind), Later and Close office & reopen. The toast (`CliUpdateToast`,
   `App.tsx:536`) goes.
3. **The feed.** `useNeedsYou` subscribes to the status push (P1) and the stored Later (U3), adds
   one to the count while the card shows, and `AskMeTab` includes it in `boardEmpty`.
4. **Later (U3).** Hides the card until a newer Claude Code is installed, stored as today.
5. **Docs and tests**: `branding/DESIGN.md` §7.4 drops `CliUpdateBadge` and "Team upgrade ready",
   and §7.8 gets the card beside the update card; the Later helper's comment must not say a badge
   still offers it (`useNeedsYou.ts:251` says that of the app update, not this). Tests below.

## NOT in scope
- Moving other corner popups to Ask me (HOLD SCOPE, owner D1).

## 0I Temporal interrogation
```
  HOUR 1: feed field and subscription; Later read and written in one place.
  HOUR 2: the card (UpdateCard's frame); the reopen event from App.
  HOUR 3: remove the chip and the toast; tests; DESIGN.md.
```
Effort: human ~half a day / CC ~25 min. Blockers: none.

## Review sections

### Section 1: Architecture
```
  main (cliUpdate.ts) ─ push 'cliUpdate:status' ─► useNeedsYou feed { cliUpdate, cliUpdateLater }
                                                    ├─ count +1 while shown
                                                    └─► AskMeTab ─► CliUpdateCard
                                                          Later ─► store version (local storage)
                                                          Close & reopen ─► window event ─► App
                                                                 closeOfficeAndReopen ─► closing time ─► relaunch
```
1. [INFORMATIONAL] The feed is shared with the pill and the strip, so the card and the number
   can never disagree (same rule as the update card). No issue.
Rollback: revert; nothing stored changes shape (the Later key is today's).

### Section 2: Error and rescue map
```
  CODEPATH                 | WHAT CAN GO WRONG              | RESCUE                   | USER SEES
  status push              | arrives before the window      | pull on start (today)    | the card
  closing time start       | refused (Michael's terminal    | card comes back          | the card again, and the
                           | ended)                         |                          | closing bar's message
  closing time             | owner cancels                  | card comes back          | the card again
  status push              | null (caught up)               | replaces the status      | the card leaves
  start up read            | lands after a newer push       | ignored once a push came | the right state
  local storage            | unavailable                    | Later lasts this session | the card after a restart
  status                   | agents catch up (reopened)     | status null              | the card leaves
```

### Section 3: Security
No new IPC; the reopen still needs the owner's click and runs closing time. No issues found.

### Section 4: Edge cases
```
  INTERACTION        | EDGE CASE                          | HANDLED
  Close & reopen     | double click                       | card steps aside on the first click
  Later              | a newer version while hidden       | card returns (U3)
  board              | only this card waiting             | not All clear; the number shows 1
  department filter  | a department picked                | stays in view (Michael's card, D6)
  update card too    | both waiting                       | both cards, app update first
```

### Section 5: Code quality
The card reuses `UpdateCard`'s frame; the Later helpers move with it. No issues found.

### Section 6: Tests
- Unit: `cliUpdateToastVisible` (existing) becomes the card's shown rule; keep its tests.
- Source checks: no `CliUpdateBadge` in `TopBar.tsx`, no `CliUpdateToast` in `App.tsx`; the card
  in `AskMeTab`; the feed adds one while shown; `boardEmpty` reads it; the reopen source wired;
  no Later written on start; the card back on cancel.
- Existing pins rewritten in the same change: `test/office-break.test.cjs:230` (the chip before
  the break chip), `test/update-words.test.cjs:69-72` (the toast's words), and
  `test/report-problem.test.cjs:132` checked against the new top bar order.
- no_claim: the closing and relaunch run (unchanged code; manual check).

### Section 7: Performance
No issues found.

### Section 8: Observability
No issues found: the closing bar already reports a refused start.

### Section 9: Deployment
Ships with the next release; no migration. No issues found.

### Section 10: Trajectory
Reversibility 5/5. Same shape as the update card, so a later "app needs you" item follows it.

### Section 11: Design
The card is `UpdateCard`'s: same frame, Michael's chip, body at 12.5 / 18, Later (secondary) and
Close office & reopen (primary) right aligned. The top bar loses one chip. No issues found.

## Outside voice (native fallback, Claude Plan subagent)

Codex not run (owner rule). The bounded native fallback completed inside five minutes; native
coverage only. Every finding was checked against the code and applied as a mechanic for the
approved outcomes; none needed a new answer.

| # | Finding | Disposition |
|---|---|---|
| O1 High | A cancelled closing time leaves the card hidden: today the start writes Later (`CliUpdateNotice.tsx:65`) and the chip was the way back | Applied: no Later on start; the card returns on cancel |
| O2 Medium | Copying `takeUpdate` would ignore a null push and let a late read restore an old status (`useNeedsYou.ts:242-247`) | Applied: null replaces; the read fills only before any push |
| O3 Medium | Three existing tests pin the chip and the toast | Applied: named in Section 6 |
| O4 Low | An unanswered window event can hide the card | Applied: a registered source instead |
| O5 Low | Doc and copy locations vague; §7.4 names the chip | Applied: named in Accepted scope 1 and 5 |

## Approval readiness

Approval readiness: PASS. U1, U2 (owner ask), U3 (D2); mechanics under the 2026-10-27 rule.

## Reality rows

REALITY: premise-table pass 5 premises with code receipts, unverified=0 src/renderer/src/components/CliUpdateNotice.tsx:46-115
REALITY: already-done pass the toast and chip are still on origin/main src/renderer/src/shell/TopBar.tsx:68
REALITY: surface-check pass reuses the cliUpdate push and closing time; no new IPC src/main/index.ts:431-448
REALITY: binding-decisions pass follows the owner's 2026-11-04 update card decision src/renderer/src/components/UpdateCard.tsx:13-31
REALITY: numbers pass no measured numbers; effort marked estimated docs/designs/team-upgrade-card.md:55
REALITY: deferred-asks pass no linked issue; both asks covered docs/designs/team-upgrade-card.md:7
REALITY: pr-count pass one PR on the running branch 9c6c6cfe

## What already exists
`cliUpdateStatus`, the status push, `UpdateCard`'s frame, the feed's count, `closeOfficeAndReopen`.

## Failure modes
| Path | Failure | Covered | User sees |
|---|---|---|---|
| close cancelled | card stays hidden | O1 | the card again |
| agents caught up | card stays | O2 | the card leaves |
| late start up read | old status back | O2 | the right state |

Critical gaps: 0.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.
Run with Claude Code or Codex; checkbox as you ship.

- [x] **T1 (P1, human: ~2h / CC: ~10min)** — feed — `cliUpdate` and its Later in `useNeedsYou`: null replaces, read only before a push, count while shown; App registers the reopen source
  - Surfaced by: U2, U3, O2, O4
  - Files: src/renderer/src/shell/useNeedsYou.ts, src/renderer/src/App.tsx
  - Verify: source checks
- [x] **T2 (P1, human: ~2h / CC: ~10min)** — card — `CliUpdateCard` on Ask me; steps aside while closing, back on refuse or cancel; no Later on start
  - Surfaced by: U2, O1
  - Files: src/renderer/src/components/CliUpdateNotice.tsx, src/renderer/src/components/AskMeTab.tsx
  - Verify: source checks; a manual close and cancel in the dev app
- [x] **T3 (P1, human: ~1h / CC: ~5min)** — remove — the chip, the toast and the chip copy
  - Surfaced by: U1
  - Files: src/renderer/src/shell/TopBar.tsx, src/renderer/src/App.tsx, locales
  - Verify: source checks
- [x] **T4 (P1, human: ~1h / CC: ~10min)** — tests — new checks; the three pinned tests rewritten
  - Surfaced by: Section 6, O3
  - Files: test/team-upgrade-card.test.cjs (new), test/office-break.test.cjs, test/update-words.test.cjs, test/report-problem.test.cjs
  - Verify: `npm test`
- [x] **T5 (P2, human: ~30min / CC: ~5min)** — docs — `branding/DESIGN.md` §7.4 and §7.8; FEATURES.md
  - Surfaced by: O5
  - Files: branding/DESIGN.md, docs/FEATURES.md
  - Verify: read through

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | chip and toast in CliUpdateNotice; the app  |
  |                      | update card is the pattern                  |
  | Step 0               | D1 hold; D2 Later until a newer version     |
  | Section 1  (Arch)    | 1 issue found (no change needed)            |
  | Section 2  (Errors)  | 7 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 5 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (1 item)                            |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 7 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 3 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 0 proposed (HOLD SCOPE)                     |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex unavailable (owner rule); native      |
  |                      | fallback completed, 5 findings              |
  | Lake Score           | N/A                                         |
  | Diagrams produced    | 3 (flow, error map, edge table)             |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 0 unverified       |
  +====================================================================+
```

### Unresolved Decisions

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: HOLD_SCOPE, 0 critical gaps |
| Outside Review | native fallback (Claude Plan subagent); Codex not run by owner rule | Independent 2nd opinion | 1 | unavailable (native completed) | 5 native findings; 5 resolved; 0 unresolved; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan review: unavailable (owner rule keeps Codex to the DeepSeek adversarial diff pass). Native Claude Plan subagent completed with 5 findings; no external coverage.
- **VERDICT:** CEO CLEARED. eng review required

NO UNRESOLVED DECISIONS
