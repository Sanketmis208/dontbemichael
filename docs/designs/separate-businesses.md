# One owner, two unrelated businesses

Status: CEO review in progress (2026-11-18). Strategy-only depth: which way to support it, not the implementation design.

Ask (owner, 2026-11-18): some owners run two businesses that share nothing, such as a bakery and a real estate agency. Explore the best way to support this.

## What the app does today (receipts)

- An office is a folder (`harnessHome`, default `~/HarnessAgents`), marked by `hive/registry.json` (src/main/homeFolder.ts:23,31). It holds the hive, memory palace, agent settings, `office.json` and `private/` (foundations, owner chat, broker tokens).
- Nearly everything about the business lives in ONE app-wide `config.json` (src/main/config.ts:229-248, 303-326, 387-393): business name, city, type, company profile, business folder, team, mailboxes, agent grants, Claude connector switches, QuickBooks, schedules, custom integrations, notifications. The code says it: "Several offices share one config" (src/main/officeFile.ts:79).
- Secrets for every office sit in one `integration-secrets.json`; the company knowledge store is app-wide by default (src/main/knowledge.ts:68-73).
- One app process (src/main/index.ts:2828-2834) and one window; the second floor window went 2026-10-03 (docs/FEATURES.md:879).
- Switching office (Settings, General, "Other offices on this computer" or "Change office folder") writes only `{ harnessHome }` and relaunches (src/main/index.ts:4203). `office.json` is never read back on a switch (src/main/index.ts:4110-4114).
- Claude login, Claude connectors (Gmail, Calendar, QuickBooks, Drive, HubSpot) and transcripts belong to the Mac user's `~/.claude` (src/main/claudeAccount.ts:16-18, src/main/transcript.ts:47-52). A Claude connector holds one account per service (docs/designs/claude-connectors.md:4-6, docs/designs/multi-mailbox.md:7).
- The app's own mailboxes (IMAP/SMTP) can hold many addresses, but in one app-wide list; one address can be connected once per install (src/main/mail.ts:2161-2164).

**Consequence:** today a second business on the same Mac user is not isolated. "Start a new, empty office here" keeps the first business's name, city, type, profile, mailboxes, grants and schedules (inferred from index.ts:4203 writing only harnessHome; not yet reproduced live). The bakery's Michael would introduce himself as the real estate agency, its standup would fire into the other office, and its foundations would be seeded from the other company's profile (src/main/foundations.ts:275-303). Only one business runs at a time, so the other one's mail, schedules and agents stop while it is closed.

## Step 0A. Premise

- **Real problem:** an owner with two businesses needs two offices that never mix (identity, customers, mail, money, memory) and that both keep working.
- **Proxy to avoid:** "a switcher in Settings". A switcher on top of a shared config makes mixing easier, not harder.
- **Cost of doing nothing:** the switch path that exists already crosses data between businesses. An owner who tries it today gets one business's agents speaking for the other. That is the worst outcome for a business owner (wrong company name in a customer email, the wrong QuickBooks company).

## Step 0B. Existing code to reuse

| Sub-problem | Reuse | Gap |
|---|---|---|
| Office data on disk | the office folder, `office.json` record (src/main/officeFile.ts, src/shared/officeRecord.ts) | config keeps the live copy; office.json is a mirror |
| Listing offices | `recentHives` (src/main/fs.ts:292-307), Settings "Other offices" (SettingsModal.tsx:716-730) | capped at 8, no business names |
| Switching | `config:changeHome` stop, relaunch (index.ts:4145-4207) | carries the whole config across |
| Office keyed stats | Pulse tables already carry an `office` column (src/main/db.ts:214) | keyed by folder path (TODOS.md:284-293) |
| Separate Claude account per office | Claude Code honours `CLAUDE_CONFIG_DIR`; the app passes it through to terminals (src/main/ptyEnv.ts:40) and some readers use it (claudeAccount.ts:17, transcript.ts:47) | the app never sets it per office; sign in storage follows the undocumented `CLAUDE_SECURESTORAGE_CONFIG_DIR` (hiddenClaude.ts:180-188); several readers hardcode `~/.claude` (hive.ts:2070-2072, config.ts:724-726, the sign in terminal and connector listing in index.ts) |
| New business setup | onboarding wizard with pack choice | not reachable for a second office once `onboardingComplete` is true |

## Step 0C. Dream state

```
  CURRENT STATE                      THIS PLAN                         12-MONTH IDEAL
  one shared config, one office  ->  each business owns its settings, ->  both businesses run at once,
  at a time, switching leaks         accounts and secrets; a new          one window with a business
  identity, mail and schedules       business gets its own setup          switcher and one Needs you
                                                                          list that says which business
```

## Landscape (search, 2026-11-18)

- Layer 1: small business accounting tools keep each company as its own file, with one login and a company switcher (QuickBooks Online, Xero HQ, FreshBooks, Patriot). Books are never mixed unless the owner asks for consolidation.
- Layer 2: AI agent platforms recommend one isolated workspace per company: its own credentials, data store and context, with shared orchestration code.
- Layer 3: those tools are cloud apps where a closed company still exists on a server. Here the office IS the running process on the owner's Mac, so "switch to the other company" means the other company stops working. Isolation and both running are two separate requirements, and the switcher pattern only gives the first.

## Reality rows

```
REALITY: premise-table finding unverified=3 (new office inherits identity: inferred, not reproduced; two Mac users run both offices at once with fast user switching: unverified; one claude.ai account cannot hold two QuickBooks companies: unverified) src/main/index.ts:4203
REALITY: already-done pass no commit on origin/main since 2026-11-01 adds per office config or concurrent offices (git log --grep office at cd757e20) src/main/index.ts:4203
REALITY: surface-check pass Settings "Other offices" and "Change office folder" exist, no "Switch business" menu item exists src/renderer/src/components/SettingsModal.tsx:431-461 src/main/index.ts:3062-3104
REALITY: binding-decisions pass gstack-decision-search returned no branch decisions; memory rules (reuse the orchestrator architecture, fix in code for every install) are kept src/main/officeFile.ts:79
REALITY: numbers pass recentHives cap 8 [measured: src/main/fs.ts:292-307]; no other numbers claimed src/main/fs.ts:292-307
REALITY: deferred-asks pass no linked issue; nothing deferred from an issue docs/FEATURES.md:879
REALITY: pr-count pass no .gstack/ship-policy.json, default one PR per wave; T2 guard ships first, step one later TODOS.md:3
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| BIZ-1 approach (owner) | two unrelated businesses, no mixing, both keep working; evidence above | none: switching leaks, one at a time | A) separate Mac user per business, B) per business settings with a switcher, one open at a time, C) per business settings, both running at once | approved: C | D1 answer 2026-11-18, "Both at once (recommended)": step one each business owns its settings (fixes the leak, ships alone), step two each business runs as its own office process with one window, a business switcher and a Needs you list marked by business |

| BIZ-2 step two now or later (owner) | BIZ-1 C includes step two; mode SCOPE REDUCTION (D2) | deferred to TODOS.md | — | deferred | D3 answer 2026-11-18, "Defer to TODOS.md (recommended)": step two leaves this plan; direction BIZ-1 C stands |
| BIZ-3 own Claude account per business (owner) | Claude connectors hold one account per service (claude-connectors.md:4-6); app already honours CLAUDE_CONFIG_DIR (ptyEnv.ts:40) | in step one | — | approved: keep | D4 answer 2026-11-18, "Keep in step one (recommended)": a new business can choose its own Claude login, kept with the office |
| BIZ-4 Pulse keyed by a stable office id (owner) | TODOS.md:284-293; Pulse rows keyed by folder path (db.ts:214) | in step one | — | approved: keep | D5 answer 2026-11-18, "Keep in step one (recommended)": Pulse rows use the step one office id, old rows mapped from their folder |
| BIZ-5 switch uses closing time (eng review) | today's switch kills terminals at once (index.ts:4204) | kill | closing time like Close Office | settled in eng review | see Eng review ledger: BIZ-5 by D10, BIZ-7 by D11, BIZ-8 by D9 |
| BIZ-6 guard today's leaking switch (owner) | S1-1: index.ts:4203 carries the whole config into another office | in next release | — | approved: guard now, amended by D8 | D6 answer 2026-11-18, "Guard now (recommended)": a guard in the next release; D8 replaced how it detects and what a new empty office does (see OV-2) |
| BIZ-7 migration of installs with several offices (eng review) | one global config, several offices in recentHives (fs.ts:292-307) | none | only the open office gets the global settings; others get their office.json identity and empty mailboxes, schedules and grants | settled in eng review | see Eng review ledger: BIZ-5 by D10, BIZ-7 by D11, BIZ-8 by D9 |
| BIZ-8 where per office secrets, knowledge and journals live (eng review) | outside voice 6: a folder the owner may sync or copy breaks encryption; knowledge.ts:68-73 allows a chosen store path | move into the office folder | keep in userData, namespaced by office id | settled in eng review | see Eng review ledger: BIZ-5 by D10, BIZ-7 by D11, BIZ-8 by D9 |
| OV-1 verify the Mac user path first (owner) | outside voice 1 and 8: deferred C delivers B (closed business stops); A's "both running" is unverified and S effort; S1-1 not reproduced | not planned | A) include: before step one, test two Mac users with both apps running and reproduce S1-1; if both run, document a Mac user per business as the interim for owners who need both working | approved: include | D7 answer 2026-11-18, "Include (recommended)": test two Mac users with both apps running for a day and reproduce S1-1 before step one; document the interim only if both keep working |
| OV-2 how the guard detects another business (owner) | outside voice 3: offices most at risk have no office.json (backfillOfficeRecord refuses, officeFile.ts:79-85); names drift; per office setup needs the split | D6: compare office.json business; new empty office runs setup | — | approved: apply | D8 answer 2026-11-18, "Apply this change (recommended)": the guard detects another business by team (reuse configMatchesRegistry, officeFile.ts) and refuses "Start a new, empty office" while settings hold a business, pointing to the interim; this replaces D6's detection and its "runs setup" part |

Mode: SCOPE REDUCTION, chosen in D2 (2026-11-18, recommended option). Proposed minimum core (kept unless a row above says otherwise): each business owns its settings, accounts, secrets and knowledge; a new business gets its own setup; a visible Switch business item stops one office and opens the other.

## Answered: BIZ-1 (D1, "Both at once (recommended)")
Commitment comparison:

```text
Commitment                         | Source/approval or pending | Current          | A Mac user each  | B switcher        | C both at once
Business data never mixes          | the ask                    | no (leaks)       | yes, by the OS   | yes, by the app   | yes, by the app
Both businesses keep working       | the ask ("running two")    | no               | yes (unverified) | no, closed one stops | yes
Own Claude account and connectors  | pending (BIZ-3)            | shared           | yes, automatic   | optional          | optional
Owner sees both in one place       | pending                    | no               | no, log in/out   | one at a time     | yes
Fixes today's leaking switch       | Section 1 finding          | no               | no, separate fix | yes               | yes
Effort                             | estimate                   |                  | S                 | L                 | XL (L of it is B)
```

Question: D1 — BIZ-1: How should one owner run two unrelated businesses, such as a bakery and a real estate agency?
Project: Don't Be Michael, an office of AI agents on the owner's Mac. ELI10: today the app keeps each business's name, mailboxes, schedules and logins in one shared settings file, and only one office runs at a time. Switching to a second office carries the first business's settings across, so the bakery's agents could introduce themselves as the real estate agency. Stakes: a wrong company name or the wrong QuickBooks company in front of a customer, and one business going quiet while the owner looks at the other. Recommendation: C, built in two steps, because the businesses share nothing and both have customers waiting, so they must be isolated and both keep running; step one (each business owns its settings) is the same work as B and fixes today's leak on its own. Note: options differ in kind, not coverage — no completeness score.
Header: Approach
A) Separate Mac user each
The owner makes a second macOS user for the second business; the app documents it and blocks the leaking switch. Effort S, risk low, reuses everything; verify by running two Mac users side by side. ✅ Full isolation by the operating system, Claude account and connectors included, with almost no code. ✅ Ships this week as help text plus a guard on the switch. ❌ The owner logs in and out to see each business, and notifications from the other one are not seen.
B) Switcher, one open at a time
Each office owns its settings, accounts and secrets; a new business runs setup; a Switch business menu item stops one and opens the other. Effort L, risk medium, reuses office.json, recentHives and changeHome; verify with a two office switch test. ✅ Isolation inside one app, with a clear switch the owner understands. ✅ Fixes today's leak for every install. ❌ The closed business stops: its mail, schedules and agents wait until the owner switches back.
C) Both at once (recommended)
Step one is B's settings split; step two runs each business as its own office process, with one window, a business switcher and a Needs you list marked by business. Effort XL, risk high, reuses the hive and Michael per office; verify with two offices running a day side by side. ✅ Both businesses keep working, which is what running two businesses means. ✅ Step one ships alone and already fixes the leak. ❌ Largest build: two Michaels at once doubles Claude usage, and a per process app changes launch, the single instance lock and updates.

## Current scope (after Step 0)

- Mode: SCOPE REDUCTION (D2). Approach: BIZ-1 C (D1), built in two steps.
- Accepted (step one): each business owns its settings, accounts, secrets and knowledge; a new business runs its own setup; a visible Switch business item stops one office and opens the other; a new business may use its own Claude login (BIZ-3, D4); Pulse keys by a stable office id (BIZ-4, D5).
- Deferred: step two, both businesses running at once (BIZ-2, D3).
- Rejected: none.

## Review sections (strategy-only depth)

### Section 1: Architecture

```
  TODAY                                      STEP ONE
  userData/config.json  (ONE)                userData/config.json   install only: window, language,
   ├ business identity, team                                        Claude Code update, harnessHome,
   ├ mailboxes, grants, connectors                                  known offices (id, name, folder)
   ├ schedules, integrations, research       <office>/office.json   becomes the live settings of
   └ harnessHome, recentHives                 (per business)        that business: identity, team,
  userData/integration-secrets.json (ONE)                           mailboxes, grants, connectors,
  userData/knowledge/ (ONE)                                         schedules, integrations, research
  userData/mail-*.json, broker journal (ONE) <office>/private/      secrets, knowledge, mail and
  ~/.claude (ONE login, ONE connector set)                          broker journals, dock keys
                                             <office>/claude/       optional own Claude login
                                                                    (CLAUDE_CONFIG_DIR), BIZ-3
          app process (one office at a time, unchanged in step one)
           └ reads install config + the open office's settings; nothing business-shaped is global
```

- **Also business shaped (outside voice 7):** the job, standing and trust check folders (index.ts:1221-1291), failures.jsonl, the Pulse database rows, mail and broker journals, owner dock keys and renderer localStorage. The field by field proof covers every per install file in userData, not only config.ts.
- **Boundary rule:** anything that names a customer, an account, a schedule, a team member or the business belongs to the office; only how the app itself behaves is install-wide. Implementation owner must prove the split field by field (config.ts:229-393 is the list to sort).
- **Coupling:** reads of `cfg.businessName`, `cfg.mailboxes`, `cfg.missions` and the rest are spread through src/main/index.ts (e.g. 616-619, 700, 1746-1760, 3528-3570). The split must go through one accessor for "the open office's settings", or a missed reader keeps leaking. Implementation owner must prove every reader moved (a test that the global config holds no business field after migration).
- **Single point of failure:** the office record. Today office.json is a mirror nobody reads back (index.ts:4110-4114); in step one it is the source of truth, so a corrupt or missing file loses the business's settings. Needs the same atomic write and backup the roster already has (roster-backups, homeFolder.ts:63).
- **Rollback (corrected after outside voice 5):** the migration removes business fields from the live config, which the new version never reads again, and keeps a frozen copy of the old config next to it for one release, so a downgraded build can be pointed back at it. Decided as a small mechanic under the owner's plan review rule; owner: eng review to confirm the downgrade path.
- **Switching:** today's switch kills terminals at once (index.ts:4204) after stopping services (index.ts:4179-4185). Switch business must use closing time like Close Office, so a member mid task finishes or hands off instead of being cut. Pending row BIZ-5, owner eng review.

**Finding S1-1 (CRITICAL, shipped today):** the existing "Start a new, empty office here" and "Other offices, Open" paths carry one business's identity, mailboxes, grants and schedules into another office (index.ts:4203). Pending decision BIZ-6.

### Section 2: Error and rescue map (capability rows)

```
  CAPABILITY                     | WHAT CAN GO WRONG                              | USER SEES (required)
  -------------------------------|------------------------------------------------|----------------------------------
  Settings migration (first run) | crash midway; two offices in recentHives       | each office opens with its own
                                 | both claim the one global config               | name, or a setup card, never the other's
  Open office settings           | office.json missing, corrupt, older version   | "This office's settings could not be
                                 |                                                | read" with restore from backup
  Switch business                | member mid task; other office folder gone;     | closing time progress; the missing
                                 | relaunch fails                                 | office screen (OfficeFolderMissing.tsx)
  New business setup             | owner quits halfway                            | the half set office reopens setup,
                                 |                                                | never runs with the old business's data
  Own Claude login (BIZ-3)       | not signed in; plan detection reads the wrong  | "Sign in to Claude for <business>"
                                 | .claude.json (claudeAccount.ts:17); sign in    | card in that office only
                                 | lands in the owner's main Keychain entry      | (implementation owner must prove with
                                 | (undocumented env, hiddenClaude.ts:180-188)   | a probe before building BIZ-3)
  Secrets per office             | mailbox id collides across offices            | each office's mailbox keeps its own
                                 | (secret key mail:<id>, mail.ts:2157-2181)      | password
  Pending mail proposals         | bakery proposal approved while agency is open  | proposals belong to their office and
                                 | (global mail-proposals.json, index.ts:1198)    | only show and send there
```

Rescue rule: none of these may fall back to "use the other office's value". Implementation owner must prove each row with a failing case.

### Section 3: Security and threat model

| Threat | Likelihood | Impact | Mitigated by plan? |
|---|---|---|---|
| One business's agent sends mail as the other business (shared mailboxes and identity) | Med (any owner who uses the switch) | High | Yes in step one; today no (S1-1) |
| Secrets readable across offices (one integration-secrets.json) | Med | High | Yes: secrets move under the office; keys namespaced by office id |
| Claude connector shares one QuickBooks company across businesses | High for two business owners | High | Yes when the owner gives the business its own Claude login (BIZ-3); otherwise connectors stay off for the second business |
| Company knowledge from one business retrieved by the other's agents (global knowledge store, knowledge.ts:68-73) | Med | High | Yes: knowledge moves under the office |
| Prompt injection from one business's mail reaching the other's Michael | Low | Med | Yes, follows from separate mailboxes and memory |
| Deep link or hire link lands in the wrong business | Low | Low | Lands in the open office; the link screen must name the business it will join |

Audit: switching, migration and setup of a new business write a line to each office's log (hive log.jsonl) naming the office id.

### Section 4: Data flow and interaction edge cases

```
  INPUT (Switch business) -> CHECK (target office exists, has settings) -> CLOSE (closing time) -> PERSIST (harnessHome)
       -> RELAUNCH -> LOAD (install config + office settings) -> OUTPUT (floor of that business)
  shadow: target folder deleted -> missing office screen; settings corrupt -> restore card; closing time
          times out -> say which member was cut; relaunch fails -> the office it came from reopens
```

| Interaction | Edge case | Handled? | How (required) |
|---|---|---|---|
| Switch business | double click | gap | one switch at a time, button busy during closing time |
| Switch business | Ask me card half answered | gap | the draft stays with its office (renderer state is cleared on switch today, localState.ts:9-34) |
| New business setup | owner picks the same business folder as the first business | gap | refuse: two businesses never share a business folder |
| New business setup | owner connects a mailbox the other business already has | gap | refuse with "this address belongs to <business>" (mail.ts:2161-2164 already refuses per install) |
| Closed business | mail arrives, schedules come due | known | waits until it is opened, like the app closed today; say so on the switcher |
| Migration | owner has several offices, only one matches the global config | gap | pending BIZ-7 |

### Section 5: Code quality

- The split must remove business fields from config, not copy them; two live copies is how the leak happens again.
- Reuse `office.json`, `officeRecord.ts` and `syncOfficeRecord` rather than a new store (memory rule: reuse the orchestrator architecture).
- Over-engineering to avoid: no per office process, IPC layer or office manager service in step one (that is step two).

### Section 6: Tests (capability level)

| New thing | Test type | Must assert | no_claim |
|---|---|---|---|
| Settings split | unit | after migration the global config holds no business field; the open office's settings equal the old global values | real Electron relaunch (unit only) |
| Switch between two offices | integration | office A's name, mailboxes, schedules and grants never appear in office B after a switch and back | live mail servers (fixtures) |
| New business setup | integration | a new office starts with no identity, team, mailbox, schedule or grant, and runs setup | packaged app UI |
| Secrets per office | unit | the same mailbox id in two offices keeps two passwords | Keychain (file store) |
| Own Claude login | unit | the office's Claude folder drives plan detection and terminal env | real Claude sign in |
| Pulse office id | unit | rows keyed by folder map to the office id; moving the folder keeps history | none beyond protects |
| Hostile QA | integration | switch during closing time, switch to a deleted folder, corrupt office.json | |

Friday 2am test: two offices with different businesses, a schedule and a mailbox each, switched back and forth five times; each Michael's first message names its own business.

### Section 7: Performance

No issues found. Reading one office settings file at launch replaces reading one global file; switch cost is dominated by closing time, which exists today.

### Section 8: Observability

- Each office log records migration, switch out, switch in and setup completion with the office id and app version.
- The failure report (auto report failures) must include the office id, never the business name or mailbox addresses.
- Gap: today a leak would be silent. Step one adds a launch check that the office settings' business name matches the office record, and reports a mismatch.

### Section 9: Deployment and rollout

- Migration runs once at launch, before any service starts, with a backup of the global config kept next to it.
- Order: write the office settings, verify by reading back, write the frozen copy, then remove the business fields from the live config. A crash between steps leaves both, and the next launch resumes.
- Windows ships every release (memory rule): migration paths must be case insensitive for folder matching (officeFile.ts already does this).
- Rollback: the frozen copy (Section 1). The live config never holds business fields again.

### Section 10: Long-term trajectory

- Reversibility 2/5: once settings live in the office, going back means another migration.
- Step two (both at once) depends on step one's boundary being complete; any global business field left behind becomes a cross-business bug when two offices run in one app.
- Debt paid: TODOS.md:284-293 (Pulse office id) closes.

### Section 11: Design and UX

```
  My Office menu  ->  Switch business  ->  list: Bakery (open), Realty Agency (paused since 9:12)
                                               |                       |
                                               |                  [Open] -> closing time for Bakery -> Realty floor
                                               +-> [Add a business] -> setup (pack, name, city, team, own Claude login?)
```

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Switch business | closing time progress | only one business: list shows Add a business | folder gone: missing office screen | other floor opens | a member cut by timeout is named |
| New business setup | existing setup steps | | Claude sign in fails: retry card | floor opens | half done setup resumes |

- The window title and the floor's business name plate must always show which business is open (floor-business-name.md exists).
- Less verbose UI rule: the switcher shows names and one state word; explanations go behind an InfoTip.
- Consider running /plan-design-review for the switcher and the second business setup before building.

## Outside voice (Claude subagent, native; Codex not run)

Codex was not run: the owner's standing rule limits Codex to adversarial diff review. A Claude Plan subagent gave an independent read (no outside coverage credit). Eight findings, dispositions:

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Critical | Deferred C builds B; the Mac user path may meet both needs at S effort and was never tested | D7: include the test before step one (OV-1) |
| 2 | High | BIZ-3 rests on undocumented `CLAUDE_SECURESTORAGE_CONFIG_DIR`; several readers hardcode `~/.claude` | factual correction in 0B and Section 2; probe required before BIZ-3 (T4); second plan cost was in D4's option text |
| 3 | High | Guard by business name misses offices with no record and false alarms on renamed businesses | D8: detect by team, refuse a new empty office (OV-2) |
| 4 | High | Migration of several offices is the crux and has no data | kept pending for eng review (BIZ-7) with a required count of installs with more than one recent office, if any telemetry exists; otherwise the owner's own installs |
| 5 | Medium | Rollback text contradicts "remove, not copy" | corrected: frozen copy for downgrade, live config never holds business fields |
| 6 | Medium | Moving secrets into a syncable folder adds exposure | pending for eng review (BIZ-8) |
| 7 | Medium | Business shaped files beyond config.ts not listed | added to Section 1 |
| 8 | Low | S1-1 not reproduced | covered by OV-1 (reproduce first) |

## Approval readiness

Approval readiness: PASS. Checked rows: BIZ-1 (D1), BIZ-2 (D3, deferred), BIZ-3 (D4), BIZ-4 (D5), BIZ-6 (D6 amended by D8), OV-1 (D7), OV-2 (D8). Pending, not approved and not in tasks as decisions: BIZ-5, BIZ-7, BIZ-8 (owner: /plan-eng-review).

## NOT in scope

- Both businesses running at once (step two): deferred by D3, in TODOS.md "Both businesses running at once in one app".
- Combined views across businesses (a morning summary, one Ask me across both): not proposed in SCOPE REDUCTION; belongs with step two.

## What already exists

See Step 0B. Reused: the office folder and office.json record, recentHives and the Settings office list, changeHome's stop and relaunch, `configMatchesRegistry` for the guard, Pulse's office column, Claude Code's `CLAUDE_CONFIG_DIR`, the missing office screen.

## Dream state delta

After step one the businesses never mix, but only one works at a time. If OV-1 proves the Mac user path, owners who need both working have an interim. Step two (deferred) closes the rest of the gap to the 12 month ideal.

## Failure modes registry (capability rows)

```
  CAPABILITY                  | FAILURE MODE                               | RESCUED? | TEST?   | USER SEES?                     | LOGGED?
  ----------------------------|--------------------------------------------|----------|---------|--------------------------------|--------
  Today's Settings switch     | carries one business into another office   | N        | N       | Silent  <- CRITICAL GAP (shipped) | N
  Guard (BIZ-6, OV-2)         | office has no record, team differs          | planned  | planned | plain stop message             | planned
  Settings migration          | crash midway, several offices               | planned  | planned | own name or setup card         | planned
  Office settings read        | office.json corrupt or missing              | planned  | planned | restore from backup card       | planned
  Switch business             | member mid task                             | pending BIZ-5 | unknown | closing time progress     | planned
  Own Claude login (BIZ-3)    | sign in lands in the main Keychain entry    | unknown  | probe T4 | wrong account, silent if missed | unknown
  Per office secrets          | mailbox id collides                         | planned  | planned | each office keeps its password | n/a
  Mail proposals              | approved in the wrong office                | planned  | planned | shown only in their office     | planned
```

Capability rows: 8. Critical gaps: 1 (the shipped switch; the guard closes it).

## Diagrams

System architecture (Section 1), data flow with shadow paths (Section 4), user flow (Section 11). No new state machine beyond the switch flow; deployment order and rollback are in Section 9 as steps.

## Stale diagram audit

The plan touches no file with an ASCII diagram yet (strategy-only). HIVE.md's folder layout (HIVE.md:66-84) must be updated when step one moves files into the office.

## Reality check

```
REALITY: premise-table finding unverified=3 (new office inherits identity: inferred, reproduce in T1; two Mac users run both offices at once: unverified, T1; per office Claude sign in: unverified, T4) src/main/index.ts:4203
REALITY: already-done pass no commit on origin/main since 2026-11-01 adds per office config or concurrent offices (git log --grep office at cd757e20) src/main/index.ts:4203
REALITY: surface-check pass Settings "Other offices" and "Change office folder" exist, no "Switch business" menu item exists src/renderer/src/components/SettingsModal.tsx:431-461 src/main/index.ts:3062-3104
REALITY: binding-decisions pass gstack-decision-search returned no branch decisions; memory rules (reuse the orchestrator architecture, fix in code for every install) are kept src/main/officeFile.ts:79
REALITY: numbers pass recentHives cap 8 [measured: src/main/fs.ts:292-307]; no other numbers claimed src/main/fs.ts:292-307
REALITY: deferred-asks pass no linked issue; nothing deferred from an issue docs/FEATURES.md:879
REALITY: pr-count pass no .gstack/ship-policy.json, default one PR per wave; T2 guard ships first, step one later TODOS.md:3
PLAN_REALITY: phase=ceo rows=7/7 missing=none unverified=3 verdict=complete
```

## Implementation Tasks

Synthesized from this review's findings (strategy-only: next research, verification and design actions).

- [ ] **T1 (deferred 2026-11-19, human: ~2h / CC: ~30min)** (code check done; owner: the leak reproduction is dropped, since the guard closes it; the two Mac user run waits until step two is decided or an owner asks for two businesses before step one ships) — verification — Reproduce the Settings leak and test two Mac users running the app at once
  - Surfaced by: Section 1 S1-1; outside voice 1 and 8 (OV-1, D7)
  - Files: none (live test from a second Mac user)
  - Verify: write down what each office's Michael says first after the switch; leave both Mac users running a day and check both offices' schedules fired
- [x] **T2 (P1, human: ~4h / CC: ~20min)** (built 2026-11-19, see T1 and T2 progress) — src/main — Guard the Settings switch by team and refuse a new empty office while settings hold a business
  - Surfaced by: BIZ-6 (D6) amended by OV-2 (D8)
  - Files: src/main/index.ts (config:changeHome), src/main/officeFile.ts (configMatchesRegistry), src/renderer/src/components/SettingsModal.tsx, src/renderer/src/i18n/locales/en.json, a test under test/
  - Verify: a test switching between two offices with different teams, with and without office.json, is refused; the same office reopens
- [x] **T3 (P1, human: ~3h / CC: ~20min)** (done 2026-11-19, see T3 below) — design — List every business shaped field and file for step one
  - Surfaced by: Section 1 boundary rule; outside voice 7
  - Files: src/main/config.ts, src/main/index.ts, files under userData
  - Verify: the list is in this doc and each item has a home (office or install)
- [x] **T4 (P1, human: ~2h / CC: ~15min)** (probed 2026-11-19 on Claude Code 2.1.328, see T4 below; a live second account sign in is an optional owner check) — verification — Probe a separate Claude sign in per office folder
  - Surfaced by: BIZ-3 (D4); outside voice 2
  - Files: none (probe with Claude Code and two config folders)
  - Verify: two folders keep two signed in accounts and two connector lists; note the Claude Code version
- [ ] **T5 (P1, human: ~1h / CC: ~15min)** — review — Run /plan-eng-review on step one and settle BIZ-5, BIZ-7 and BIZ-8
  - Surfaced by: pending rows BIZ-5, BIZ-7, BIZ-8
  - Files: docs/designs/separate-businesses.md
  - Verify: the eng review report clears those rows

## T1 and T2 progress, 2026-11-19

### T2: the guard (built, not committed)

- `officeSwitchGuard(cfg, newHome)` in src/main/officeFile.ts answers ok, otherBusiness or newBusiness. Before setup finishes, anything opens. An office opens when its registry has this team in the same folders (configMatchesRegistry, the backfill check), or when its office.json names the same business folder (covers a registry that drifted). A business with no team yet is told apart by office.json, or by members working outside the office folder; with neither, it opens. A folder with no office is newBusiness. Names never decide.
- `config:changeHome` asks it for every open (mode fresh) before it makes or saves anything, and returns `guard` with the refusal. A move is the same office and is never asked.
- Settings (Open another office, Change office folder) and the "We can't find your office" screen show OfficeGuardNotice: the title, an info tip with the why, one line and OK.
- Lines: "That office belongs to another business" / "It can't be opened from here yet." and "A new business can't start from here yet" / "To use a different folder for this business, choose Move my office here." The first line changes to "Open it from its own Mac user for now." only if the T1 live run passes.
- Test: test/office-guard.test.cjs (7 cases, with and without office.json, same name with another team, no team yet, drift, and a check that the switch asks before it touches anything). It fails when the guard is removed. Full suite: 4025 pass, 0 fail.
- Not guarded: "Start over here" on the missing office screen. It restarts the same business in its own folder, so it carries nothing to another business.

### T1: what the code says about two Mac users

| Question | Answer from the code |
|---|---|
| Does the second Mac user's app open? | Yes. The single instance lock (index.ts:2832) lives in each Mac user's own app data, so it locks per user. |
| Do the two apps fight over a port? | No. The integration broker and the usage listener bind 127.0.0.1 on a port the system picks (integrationBroker.ts:176, called with none at index.ts:6619; telemetry.ts:300). The hook socket sits in the per user temp folder (hive.ts:1008). |
| Claude login and connectors | Each Mac user has its own ~/.claude, so each business gets its own Claude login and its own Gmail and QuickBooks connections. That is BIZ-3 for free on this path. |
| Settings | Each Mac user has its own app data, so its own config.json. No leak between them. |
| Shared | The app in /Applications. An update installed from one user replaces it for both; the other keeps running the old version until it restarts. |
| Unknown until run live | Whether a Mac user in the background (fast user switching) keeps its schedules, mail polling and keep awake going for a day. |

### T1: the owner's live run (deferred, owner 2026-11-19)

Not needed for step one. Step 1 below is dropped. Steps 2 to 4 run before step two is decided, or sooner if an owner asks to run two businesses before step one ships.

Use the Demo Mac user as the second business. Nothing here touches the main office.

1. Reproduce the leak, on 0.4.2 as installed (the guard is not in it): in the Demo user, set up a business, then a second one with Settings, Change office folder, Start a new, empty office. Write down what Michael says first in the new office (its business name, mailboxes, schedules). Expected: the first business's.
2. Two Mac users at once: in your own user keep the main office open. Switch to Demo (fast user switching, not log out), open its office, give it one schedule that fires hourly, and switch back.
3. Leave both running a day. Then check each office: did the hourly schedule fire in Demo while it was in the background, did mail polling keep going, and did either app stop or show a sign in prompt.
4. Result: if both kept working, the guard's first line becomes "Open it from its own Mac user for now." and the Mac user per business is the documented interim (OV-1). If not, the line stays as built.

## T3: what belongs to a business, field by field (2026-11-19)

Rule (Section 1): anything that names a customer, an account, a schedule, a team member or the business goes with the office; only how the app itself behaves stays with the install. "Office" below means `config.json` under `offices[<officeId>]` (D9) for settings, and a folder or key by office id for files.

### Settings in config.json (HarnessConfig, config.ts:217-416)

| Goes with | Fields |
|---|---|
| Office: who the business is | businessType, businessName, businessCity, companyProfile, businessFolder, officeFolder (legacy, read once then dropped), registeredRepos (its folders) |
| Office: setup and team | onboardingComplete (each business's own setup, for the Setup not finished row, D18; "first run" becomes "no offices yet"), businessTeam, businessTeamStarted, businessTeamRetry, instructionsRewritten, firstTasksRemoved, workStyleUpdatesDecided, agentCapabilities, agentTokenCaps, autoDeliveryPausedAgents |
| Office: mail and connectors | mailboxes, quickbooksClaude, connectorsOn, connectorsSeen, connectorsMigrated, claudeConnectors (the last read of the login this office uses), mcpDefaults (legacy, feeds the connectors carry over) |
| Office: Claude account | claudeAuth (account or API key, a login like any other, BIZ-3), planPriceMonthly (that account's price) |
| Office: schedules | missions, scheduleRequests, missionsOwnersMigrated, opsStandupSeeded, foundationsCheckSeeded, standupFocusSeeded, heartbeatSeeded (seed guards follow the schedules they guard, so a new business gets its own standup) |
| Office: Research and data | research, dataClasses |
| Office: knowledge and memory | knowledgeGraph (its rootPath override is a business folder), knowledgeOnSeeded, knowledgeOnNoticeSeen, embeddingModel (the palace in the office folder is built with it) |
| Office: owner messages | ownerAnswerKeys, ownerDockKeys (legacy, already moved to a file) |
| Office: integrations and budget | integrations (metadata; secrets below), costCapTokens, costCapUsd (deprecated, follows costCapTokens) |
| Install: how the app behaves | harnessHome (becomes the open office's id), recentHives (becomes the known offices list), audience, autoMode, maxTurns, circuitBreaker, notifications, strongKeepalive, autoUpdate (deprecated), terminalTheme, tvShowOffices |
| Install, by the rule, open to revisit after T4 | godProvider, godModel, defaultModel, defaultCommand, providerDefaultModels. Which models exist depends on the Claude account; if T4 makes a login per office real, these may follow the login. Not a step one blocker. |

Count: all 60 fields placed: 44 with the office, 11 with the install, 5 with the install pending T4.

### Files in the app's data folder (~/Library/Application Support/dontbemichael)

| File | Goes with | Note |
|---|---|---|
| config.json | split | install part stays; business part under offices[<id>] |
| integration-secrets.json | office, keyed | one encrypted file, entries keyed by office id: `mail:<id>`, `apikey:anthropic`, integration secretRefs |
| knowledge/ | office | userData/knowledge/<officeId>, unless the office's own rootPath override is set |
| mail-send-journal.json, broker-write-journal.json, mail-proposals.json | office | journals and approvals name customers and accounts; split by office id |
| owner-dock-keys.json | office | |
| pastes/ | office | **Step one must split it.** The launch sweep keeps only pastes the open office's queues still name (index.ts:6574), so with two offices it would delete pastes the closed one still needs. |
| opened-attachments/ | office | that business's mail attachments |
| job-check/, standing-check/, trust-check/, run-compare/, case-study/ | office | empty working folders, but their Claude conversations hold the business's job text; per office so a reset of one office sweeps only its own (E3) |
| harness.db: telemetry_*, cost_ledger, owner_notes | office, keyed | already have an `office` column, keyed by folder; re-key to office id (E5) |
| harness.db: kv (window.bounds) | install | |
| failures.jsonl | install, tagged | app failure reports; tag each with the office id |
| hero.json, model-catalog.json, updater.log, last-run-version | install | remote copy and app version |
| Renderer saved state (localStorage `cth.*`) | office | cleared on a switch today; step one keys it by office id so a business's view comes back with it |

### Already in the office folder (nothing to do)

The hive (registry, tasks, log), the palace, roster.json, office.json and Research's desk all live under harnessHome today.

### Outside both (T4)

~/.claude: the Claude sign in, its connectors (Gmail, QuickBooks) and the Claude conversations of every member and check. A separate login per office is T4.

## T4: a separate Claude login per office (probed 2026-11-19, Claude Code 2.1.328)

**Result: it works, and through the documented setting.** Each Claude config folder gets its own login. BIZ-3 does not rest on the undocumented variable for members; only the app's hidden checks need it, as they do today.

### What the probe showed

`claude auth status` (read only; no sign in was started, the account email was not printed):

| Run | Signed in? |
|---|---|
| No CLAUDE_CONFIG_DIR (today's setup) | yes, the owner's account |
| CLAUDE_CONFIG_DIR = a new folder A | no: A has its own login, empty |
| A, with CLAUDE_SECURESTORAGE_CONFIG_DIR = "" | yes, the owner's account |
| A, with CLAUDE_SECURESTORAGE_CONFIG_DIR = ~/.claude written out | no |
| A new folder B, with CLAUDE_SECURESTORAGE_CONFIG_DIR = A | no (A has no login yet), so B reads A's entry |

Why, from the Claude Code 2.1.328 binary: the login lives in the Keychain under `Claude Code-credentials`, plus `-` and the first 8 hex characters of sha256 of the config folder path whenever CLAUDE_CONFIG_DIR is set. CLAUDE_SECURESTORAGE_CONFIG_DIR, when set, picks the folder that name is made from, and an empty value means the default entry. So:

- Office members run with `CLAUDE_CONFIG_DIR = <that office's Claude folder>`: a documented setting, its own login, its own `.claude.json`, plugins, local connectors and conversations.
- Hidden checks (isolated folders, hiddenClaude.ts:203-204) keep borrowing a login with `CLAUDE_SECURESTORAGE_CONFIG_DIR = <that office's Claude folder>`. That variable stays undocumented; if Claude drops it the checks fail closed (they stop at sign in), as today.
- The first business keeps today's login: no CLAUDE_CONFIG_DIR, and an empty CLAUDE_SECURESTORAGE_CONFIG_DIR for its checks. Writing ~/.claude out in full does **not** reach that login.
- Gmail, QuickBooks and the other claude.ai connectors belong to the account, so a second login brings its own list.

### What this changes in step one (follows D9, no new choice)

- **The office's Claude folder goes in the app's data folder, keyed by office id** (`userData/offices/<officeId>/claude`), not inside the office folder as Section 1's diagram drew it. The login name is a hash of the folder's path, so an office folder that is moved or opened from a synced copy would lose its login. The app data folder is also already outside every agent's reach (folderAccess.ts:323 refuses edits under ~/Library).
- A business uses its own Claude folder only when the owner chose "A different Claude account" in Add a business (DT, frame 4). Otherwise it shares the first business's login, as D4 allows.
- A second account is a second Claude plan (D4).

### Readers E6 routes through one claudeHome()

| Reader | Today |
|---|---|
| transcript.ts:47, 52 (projects, history) | follows CLAUDE_CONFIG_DIR |
| claudeAccount.ts:17 (plan) | follows CLAUDE_CONFIG_DIR |
| hooks.ts:1384, index.ts:3537 (projects folder walls) | follow CLAUDE_CONFIG_DIR |
| hiddenClaude.ts:204 (checks' login) | follows CLAUDE_CONFIG_DIR, empty for the default |
| config.ts:725 ensureClaudeGlobalPermissions | **hardcoded ~/.claude/settings.json** |
| config.ts:755 updateClaudeJson (trust and API key approvals) | **hardcoded ~/.claude.json**; with a config folder set, Claude reads `<folder>/.claude.json` instead |
| hive.ts:2072 ownerPluginsOffForSession | **hardcoded ~/.claude/settings*.json** |

The three hardcoded readers are wrong today too for an owner who exports CLAUDE_CONFIG_DIR: the approvals land in a file Claude does not read, and the agent stops at the trust question. E6 fixes them for both cases.

### Optional owner check (5 minutes, not needed for step one)

Proves two logins side by side on this Mac. Any account works, even the same one.

1. `CLAUDE_CONFIG_DIR=~/dbm-t4 claude auth login`, and sign in in the browser.
2. `CLAUDE_CONFIG_DIR=~/dbm-t4 claude auth status --text` shows that account; `claude auth status --text` still shows yours.
3. Clean up: `CLAUDE_CONFIG_DIR=~/dbm-t4 claude auth logout`, then delete ~/dbm-t4.

## E1: the office id and the settings accessor (2026-11-19)

- office.json gains `id` (a random UUID, made once by `ensureOfficeId`). Every later save keeps it (`syncOfficeRecord`). A record holding only the id describes no business: setup still sees no office to continue, and the launch backfill still writes the description (`describesBusiness`). An id read from a copied or synced record is checked (`isOfficeId`), so it is never a path.
- src/main/officeSettings.ts holds T3's two lists, `BUSINESS_KEYS` (44) and `INSTALL_KEYS` (16 plus `offices`). The build fails when a config field is in neither list or in both.
- `currentOfficeId()` reads office.json's id, else the `offices` entry last opened from this folder, so a lost office.json keeps its settings. `officeSettings()` gives that business's saved settings over the defaults (a business with none starts setup, with no mailboxes). `updateOfficeSettings(patch)` saves only business keys, and refuses (saving nothing) when no office is open or it has no id. `installConfig()` gives the install keys only.
- Nothing reads through it yet, so the app behaves as before.
- **Moved to E3:** `readConfig()` returning a type without business fields. Switched alone it breaks every reader, and the app would not run until E3 moved them; switched in E3, its compile errors are the list of readers still to move.
- Test: test/office-settings.test.cjs (8 cases: one home per field, the id kept through saves, backfill of an id only record, unsafe ids, two offices kept apart, a lost office.json, settings with nowhere to go, the pure helpers). Full suite 4033 pass, 0 fail.

## E2: moving the settings at launch (2026-11-19)

- `migrateToOfficeSettings()` in src/main/officeSettings.ts. Order: give each known office (the open one and the recent ones) its id; keep config.json as `config.before-offices.json` (the first copy is never overwritten); write `offices[<id>]` for every office not already there; read it back; then one write removes the business fields from the top level and sets `officesMigrated: 1`. A stop before that last write leaves the top level as it was, and the next launch runs again, keeping entries already written.
- Who gets what (D11): an office is this business when the T2 guard would open it with these settings (team match, or the same business folder in office.json, or a business with no team and nothing to tell it apart), and it gets every business setting. Another business with an office.json gets its identity and team, `setupNoticePending`, and no mailboxes, grants, connectors or schedules of this one. An office with nothing to go on gets nothing and runs setup. While setup is unfinished, the open office gets what was typed so far.
- It waits, changing nothing, while no office is open yet or the open office's folder is missing (the "We can't find your office" screen), and runs once it is there.
- New fields: `officesMigrated` (install) and `setupNoticePending` (business; the notice itself is UI work in E3 and the design tasks).
- **Not called at launch yet.** Its last step empties the top level, and every reader still reads there until E3, so running it now would leave the app with blank settings. E3 adds the launch call (before any service starts) in the same change that moves the readers, and splits `DEFAULTS` so `readConfig()` stops filling business defaults at the top level.
- Test: test/office-settings-migration.test.cjs (7 cases: the one office regression, field by field; several offices by team match with a moved copy, another business, an unknown office and a deleted folder; no team; unfinished setup; waiting; resume after a stop; the pure rule). It fails when every office is given the settings. Full suite: 4039 pass; proc-kill.test.cjs failed once under load and passed alone twice (unrelated timing).

## E3, part 1: every reader and writer through the open office (2026-11-19)

- **Changed from the eng review's plan, same goal.** Instead of moving each of the 179 `readConfig()` and 53 `writeConfig()` callers and switching readConfig's type, the routing sits inside those two functions (config.ts). Before the move they work as today. After it, `readConfig()` gives the install fields from the top of config.json and the business fields from the open office's entry over the defaults, never another office's; `writeConfig()` saves business fields into the open office's entry (the folder being opened, when the save also sets harnessHome) and install fields at the top. No caller can be missed, which is what the type switch was for, so the type switch is dropped. `offices` is never part of what readers or the renderer see.
- Shared key logic moved to src/main/officeKeys.ts so config.ts and officeSettings.ts do not import each other.
- Launch: `migrateToOfficeSettings()` then `adoptOpenOffice()`, before the office check and `bootstrapHiveServices()`. `adoptOpenOffice()` gives the open office its id and entry, lets the entry follow an office moved in Finder or found again, and gives a duplicated folder its own id with a copy of the settings. A Settings move copies office.json and moves the entry with it (`officesAfterMove`).
- **Behind `DBM_OFFICE_SETTINGS=1` until step one is complete.** The move is one way, and a dev run shares config.json with the installed app, which cannot read moved settings. A config already moved keeps working without the switch. To try it, use the Demo Mac user. The last step one task removes the switch.
- The T2 guard stays until switching goes through closing time (E4) and Add a business exists (design tasks).
- Not yet: secrets, knowledge, journals, dock keys, pasted images, attachments and check folders by office id; a factory reset that erases only the open business (today's `resetConfig()` still erases every entry, as it erases everything today); the setupNoticePending notice. These are E3's next parts.
- Test: test/office-config-routing.test.cjs (9 cases: unchanged before the move; reads and saves after it, clearing a field, the token cap; another office; a save that also opens a folder, and setup adopting its id; a Settings move and the backup left behind; a Finder move; what a save announces; a retired schedule in an office; the launch switch). It fails when reads ignore the office. Full suite 4048 pass, 0 fail.

## E3, part 2: secrets, files and the factory reset by office (2026-11-19)

- **Secrets:** the secret store (integrations.ts) keeps each business's passwords and keys under `@<office id>/<ref>` once settings are per office, inside the same get, set, has and delete functions every caller uses. Two businesses with a mailbox or integration of the same id keep two passwords, and one never reads the other's. The move copies every saved secret (still encrypted) to each office of this business; the keys from before the move stay in the file for a downgrade and are never read after it.
- **Files:** `officeDataPath(name)` (config.ts) gives `userData/offices/<id>/<name>` for the open office after the move (`userData/<name>` before; `offices/none` with no office open). Used for the mail send and broker write journals, mail approvals, dock keys, pasted images, the check folders and the default knowledge store. The move renames the existing journals, approvals, dock keys, pasted images and knowledge into the open office's place (a knowledge store the owner placed elsewhere stays). Opened attachments stay shared: they are cleared at every quit, and a switch quits.
- **The launch move now runs as the main process starts**, right after the data folder is set, so the journals and approvals open in the office's place. Still behind `DBM_OFFICE_SETTINGS=1`.
- **The open office is always this business** in the move: the settings at the top are the ones it runs on. (Fixed from E2, where an office whose team had drifted could have received only its identity.)
- **Factory reset, after the move, erases only the open business:** its place in the app's data folder, its secrets (`deleteOfficeSecrets`), its rows in every table with an office column (`persist.eraseOffice`, OFFICE_TABLES), its office folder entries as before, and its settings entry (`forgetOffice`). The shared database, secrets file, install settings and every other business stay. Before the move it erases everything, as today.
- **Downgrade:** the frozen config copy, plus the knowledge store and journals, which now sit under `offices/<id>/`; a downgrade needs them moved back to the data folder.
- Not yet: the setupNoticePending notice (UI), Pulse's office column by id (E5), switching through closing time (E4), a login per office (E6).
- Test: test/office-data.test.cjs (8 cases: unchanged before the move; the move keeps secrets and files and the old keys; another business never reads this one's password; a knowledge store placed elsewhere; a stopped move; a one business reset; the office tables; the reset wiring). factory-reset.test.cjs now also checks every business file named through officeDataPath is erased by a reset.

## E3, part 3: the setup notice and screen state (2026-11-19)

- **Finish setting up this business:** a one time card on Ask me, from the app, for a business whose identity came from its office.json in the move (`setupNoticePending`). It says its mailboxes, schedules and connections were another business's and did not come with it. Got it clears it; Open Settings clears it and opens Connections. It counts with the reports and keeps Ask me from showing all clear.
- **Screen state per business:** the renderer's saved state (`cth.*`: cards, selection, queues, floor view) is stamped with the office id. The preload checks it before the page's code reads it: state from another business is cleared, whatever way the app switched (Settings, the missing office screen, the business menu still to come). State from before the move has no stamp and is the open office's, so it is stamped, not cleared. Before the move nothing is checked. A business's view does not come back when you return to it: its roster comes from its own folder, and a stale saved copy could override it.
- Test: test/office-renderer-state.test.cjs (6 cases: same business kept, another cleared, unstamped kept, nothing before the move, the card cleared once read, the card wiring and its copy). It runs the real preload, and fails when the clear is removed.
- **E3 is complete.** Still behind `DBM_OFFICE_SETTINGS=1`. Left for step one: E4 (switch through closing time, and the T2 guard removed), E5 (Pulse office column by id), E6 (a Claude login per office), E7 (the live switch test), the design tasks DT1 to DT5, and removing the switch.

## E4: switching business through closing time (2026-11-19)

- **D10:** once settings are per office, a switch from Settings (Open another office, or Change office folder) starts closing time with the target held in memory (`pendingSwitch`). Nothing is written, stopped or killed until Michael concludes; then `switchOffice()` saves the folder and reopens the app on the other business. With no Michael running (nothing to close), the switch is immediate, as before.
- **D20, the closing bar:** it reads "Closing <A> to open <B>" (B is "a new business" for a folder with no office yet), and "Opening <B>…" once closed. Cancel becomes Cancel switch and keeps A open (main forgets the pending switch). Force quit becomes Switch now, which asks once: "3 people are still working. Switch anyway?" with Keep waiting and Switch anyway. Switch now stops closing time quietly (`stopForSwitch`: no "back to work" mail, no event, unread steers dropped) and switches. A hard quit forgets the switch. A switch asked while the office is already closing carries on to that business.
- Settings steps aside for the bar while closing runs, and its saved screen state stays (the other business's window clears it as it opens, E3 part 3).
- **The T2 guard now holds only before the move.** After it, another business's office opens with its own settings, and an empty folder starts a new business, which runs setup. Before the move nothing changes.
- Names on the bar: `businessNameAt(home)`, the business's own settings, else its office.json, else none.
- Test: test/switch-business.test.cjs (8 cases: the bar's names on every update; a plain closing and a cancel; a switch during a closing; a quiet Switch now; main writes nothing before conclusion, and conclusion, cancel, hard quit and Switch now; the guard only before the move; the bar, App and Settings wiring and the copy; the names). closing-time-dialog.test.cjs now checks the switch forms of Force quit too.
- Still behind `DBM_OFFICE_SETTINGS=1`. Not covered by a test: a real relaunch into the other business (E7, the live switch test).

## E5: Pulse by office id (2026-11-19)

- `pulseOffice()` (index.ts), the one key Pulse, the cost ledger, owner notes, run comparisons and the case study file rows under, is the office's lasting id once settings are per office, else its folder as before. A moved folder keeps its history.
- `persist.relabelOffice(folder, id)` runs right after the store opens, before any service writes: every row in the office tables and the kv marks keyed by office (`OFFICE_KV_PREFIXES`: the cost ledger import, Pulse backfill and Pulse processor position, run comparisons) move from the folder to the id, in one transaction, once per id (`office:relabelled:<id>`). A row or mark the id already has wins.
- A factory reset of one business now erases its kv marks and relabel mark too.
- Found while testing: `pulse:state:<office>` (the Pulse processor's position) was keyed by office and not in the list; without it Pulse would have read an office's history again after the move.
- Test: test/pulse-office-id.test.cjs, run under Electron's Node for the real store (5 cases: rows and marks move once; history found by id after a move; existing id data wins; a one business reset; no op cases), plus a scan that fails when a new office keyed kv mark is not listed, and the main wiring order.

## E6: a Claude login per business (2026-11-19)

- New business setting `claudeLogin` ('own' or 'shared', unset is shared). For a business with its own login, the app sets `CLAUDE_CONFIG_DIR` to `userData/offices/<id>/claude` once, as the main process starts (after the move, before any agent, check or reader). Everything already follows that variable: agents keep it (ptyEnv.ts), the checks' sign in points at it (hiddenClaude.ts, empty for the default as T4 showed), transcripts and the projects folder walls read it, and the connector list is read with it. A switch relaunches, so it never changes mid run.
- `claudeHome.ts` (plain node): where Claude's settings folder and `.claude.json` are, honoring `CLAUDE_CONFIG_DIR`. The three readers that hardcoded `~/.claude` now go through it: the trust and API key approvals (`.claude.json` moves inside the folder, where Claude reads it), the global permission prompts setting, and the owner plugins turned off per session. Plan detection uses it too. This also fixes those approvals for an owner who exports `CLAUDE_CONFIG_DIR` themselves.
- **Where the owner chooses:** not built here. The design puts it in Add a business, at its Ready step ("Same as <business>" or "A different Claude account", mockup frame 4), which is DT3. Until then nothing sets `claudeLogin`.
- A factory reset of a business erases its Claude folder with the rest of its place in the app's data folder; its Keychain entry (named after the folder) stays, unused.
- Test: test/office-claude-login.test.cjs (6 cases: the usual places with no folder; the folder's settings and record; approvals written where Claude reads them; the business's folder only after the move and only for 'own'; agents' environment and plan detection; main sets it once at start, and no reader is left on a fixed ~/.claude). Live sign in of two accounts is the optional T4 owner check.

## DT1: the business menu in the top bar (2026-11-19)

- `BusinessMenu` (src/renderer/src/shell/BusinessMenu.tsx) sits right of the lockup: the open business's name as a quiet button, "Business: <name>. Switch business", capped at 220 px with an ellipsis and the full name in a tooltip. Its menu lists every business (open first, then by name) with its state, then Add a business; with one business, only Add a business (D14).
- Row states from main (`listBusinesses`, `office:list`): Open (green); Closed since <time> (today's time in mono, else the date; noted when the office stops: a switch away or a quit, not a move); Folder not found · Find it, which opens Settings, General, and never starts closing time (D17); Setup not finished, for a business whose setup is not done (D18).
- Choosing a closed business, or one whose setup is not finished, switches to it through closing time (E4). Add a business, for now, asks for the folder the new office goes in and switches there, where setup runs; the wizard over the open business (D19) is DT3.
- D21: menuitemradio rows with aria-checked, 40 px tall; opening puts focus on the open business; arrow keys wrap, Home and End; Esc closes and returns focus; Tab closes. The switch is announced by the closing bar's status line.
- D22: the window title is "<business>, Don't Be Michael" with two or more businesses.
- Shown only once each business keeps its own settings (`perOffice`), so nothing changes before the move or without `DBM_OFFICE_SETTINGS=1`.
- Not built here: reopening an unfinished setup at the step it stopped (DT3), Remove for it (DT2), the narrow width live check.
- Test: test/business-menu.test.cjs (8 cases: states and order from main, closed time kept through saves; row actions; the closed time text; one business; arrow keys; the menu's accessibility and place; when main notes a close; the copy).

## Completion summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SCOPE REDUCTION                             |
  | System Audit         | one shared config for every office; switch  |
  |                      | writes only harnessHome; one office runs    |
  | Step 0               | C in two steps; step two deferred; own      |
  |                      | Claude login and Pulse id kept              |
  | Section 1  (Arch)    | 4 issues found                              |
  | Section 2  (Errors)  | 7 error paths mapped, 7 GAPS (all planned)  |
  | Section 3  (Security)| 6 issues found, 4 High severity             |
  | Section 4  (Data/UX) | 6 edge cases mapped, 4 unhandled            |
  | Section 5  (Quality) | 2 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 7 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 3 gaps found                                |
  | Section 9  (Deploy)  | 3 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 2/5, debt items: 1           |
  | Section 11 (Design)  | 3 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 7 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 8 total, 1 CRITICAL GAPS                    |
  | TODOS.md updates     | 1 items proposed                            |
  | Scope proposals      | 0 proposed, 0 accepted (EXP + SEL)          |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex unavailable (owner rule); native     |
  |                      | Claude subagent completed, 8 findings       |
  | Lake Score           | N/A                                         |
  | Diagrams produced    | 3 (architecture, data flow, user flow)      |
  | Stale diagrams found | 0 (HIVE.md layout to update in step one)    |
  | Unresolved decisions | 3 (listed below)                            |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 3 unverified       |
  +====================================================================+
```

## Eng review (step one), 2026-11-18

Target: docs/designs/separate-businesses.md, step one only (each business owns its settings; own Claude login BIZ-3; Pulse office id BIZ-4; the interim guard T2). Step two is deferred (TODOS.md).

### Scope record

feature answers: none proposed for cut (CEO approvals D1, D3 to D8 carried); structure: A Smaller arrangement (D9, 2026-11-18); accepted scope: step one as approved, laid out as business settings in `config.json` under `offices[<officeId>]`, secrets keyed by office id in the same encrypted store, knowledge at `userData/knowledge/<officeId>`, mail and broker journals, dock keys and failures tagged or split by office id, and a stable `id` added to office.json; this settles BIZ-8; pending remedies: BIZ-5, BIZ-7.

Scope Challenge result: scope accepted as-is.

### Decision ledger (eng)

#### R1 (BIZ-5): how Switch business stops the open office
Finding: 1, CRITICAL, confidence 9/10, src/main/index.ts:4204, reviewer: eng review (native)
Plan baseline: CEO review left BIZ-5 pending for eng review; original proposal "closing time like Close Office".
Runtime evidence: config:changeHome stops services, writes `{ harnessHome: newHome }`, then `ptyManager.killAll()` and `restartApp(app)` (index.ts:4179-4205): members are cut mid task. Close Office already has a graceful path with relaunch: `startClosingTime({ relaunch: true })` (App.tsx:205-209), ClosingTimeController `relaunch` (closingTime.ts:65, 124).
Comparison grid:

| Choice | Current | A closing time, then switch | B kill at once (today) |
|---|---|---|---|
| R1 how the open office stops | kill terminals at once | closing time with relaunch; harnessHome written only after Michael concludes | unchanged |
| Where the target is held during closing | n/a | a pending target in main memory, dropped if closing is cancelled | n/a |
| Force quit when closing runs long | exists for Close Office | same dialog and force option | n/a |
| BIZ-7 migration | pending | pending | pending |

Question D10:
D10 — R1 (BIZ-5): When the owner switches business, should the open office finish its work first (closing time) or stop at once as today? <gstack-qid:plan-eng-review-biz-switch-closing>
Project/branch/task: step one of docs/designs/separate-businesses.md on mit/promote-retry-5xx.
ELI10: switching offices today cuts every agent off mid task (index.ts:4204), the same as pulling the plug. Close Office already lets agents wrap up and hand off, then can reopen the app (App.tsx:205-209). Switch business could reuse that: closing time first, then open the other business.
Stakes if we pick wrong: a member halfway through a customer email or a ledger entry loses it, and the owner finds a half done job in the other business when they come back.
Recommendation: A because it reuses the closing time path that already relaunches, so the switch costs a short wait instead of lost work.
Completeness: A=10/10, B=4/10
Pros / cons:
A) Closing time, then switch (recommended)
  ✅ Members finish or hand off before the office stops, nothing is cut mid task
  ✅ Reuses ClosingTimeController with relaunch, the same dialog owners know
  ❌ A switch takes as long as closing time, often 30 to 60 seconds
B) Stop at once (today)
  ✅ The switch is immediate, with no waiting dialog for the owner
  ✅ No change to the switch code path or its tests
  ❌ Work in progress is cut, which is what closing time exists to prevent
Net: a short wait on every switch against losing members' work in progress.
Header: Switch stop
Options:
A) Closing time, then switch (recommended)
Switch business starts closing time with relaunch and holds the target office in memory; only after Michael concludes does it write harnessHome and relaunch into the other business. Cancelling closing time cancels the switch. Effort S (human: ~4h / CC: ~20min), risk low, reuses closingTime.ts. Test: a switch during closing writes nothing until conclusion; a cancel leaves harnessHome unchanged.
B) Stop at once (today)
Keep changeHome's immediate stop and kill. Effort S (none), risk medium: work in progress is cut on every switch.

State: approved
Actual answer: A) Closing time, then switch (recommended), D10 answer 2026-11-18
Accepted scope: Switch business starts closing time with relaunch and holds the target office in memory; harnessHome is written and the app relaunches only after Michael concludes; cancelling closing time cancels the switch; tests: nothing is written before conclusion, a cancel leaves harnessHome unchanged.
History: none

#### R2 (BIZ-7): how installs with several offices migrate
Finding: 2, CRITICAL, confidence 8/10, src/main/fs.ts:292-307 and src/main/officeFile.ts:76-88, reviewer: eng review (native), raised by CEO outside voice 4
Plan baseline: CEO review left BIZ-7 pending; original proposal "only the open office gets the global settings; others get their office.json identity and empty mailboxes, schedules and grants".
Runtime evidence: one global config holds one business's settings; recentHives keeps up to 8 offices (fs.ts:292-307); `configMatchesRegistry` already tells whether an office's registry has the config's team in the same folders, case-insensitive on Mac and Windows (officeFile.ts:76-88). The owner's own install lists 1 office [measured: local config.json, 2026-11-18]; no telemetry counts other installs [unverified].
Comparison grid:

| Choice | Current | A by team match | B copy to every office | C open office only |
|---|---|---|---|---|
| R2 offices whose team matches the config | share the config | get the settings | get the settings | only the open one gets them |
| R2 offices whose team differs | share the config (leak) | identity from office.json if any, empty mailboxes, schedules, grants, connectors; a setup notice on first open | get the settings (leak kept) | empty, setup notice |
| R2 offices with no record and no match | share the config | open setup | get the settings | open setup |
| Frozen copy of old config | n/a | kept one release (CEO Section 1) | kept | kept |
| R1 switch stop | approved: closing time (D10) | unchanged | unchanged | unchanged |

Question D11:
D11 — R2 (BIZ-7): When step one ships, which offices get the business settings that today sit in the one shared file? <gstack-qid:plan-eng-review-biz-migration>
Project/branch/task: step one of docs/designs/separate-businesses.md on mit/promote-retry-5xx.
ELI10: today every office on a Mac reads one shared settings file, so after the update the app must decide which office those settings belong to. The app can already tell whether an office has the same team in the same folders (officeFile.ts:76-88), which is how a moved or copied office of the same business looks.
Stakes if we pick wrong: copying to every office keeps the bakery speaking as the agency; giving them only to the open office strips a second folder of the same business of its mail and schedules.
Recommendation: A because the team check already exists and separates "same business in another folder" from "a different business" without asking the owner anything.
Completeness: A=10/10, B=3/10, C=7/10
Pros / cons:
A) By team match (recommended)
  ✅ A moved or copied office of the same business keeps its mail and schedules
  ✅ A different business stops inheriting the other's identity and mailboxes
  ❌ A different business that relied on shared mailboxes must reconnect them
B) Copy to every office
  ✅ Nothing any office used before goes missing after the update
  ✅ Simplest migration, one copy per known office
  ❌ Keeps today's leak for every office that holds a different business
C) Open office only
  ✅ The leak ends for every other office at once, with no matching logic
  ✅ Easy to explain: the office you had open keeps its settings
  ❌ A second folder of the same business loses its mail and schedules
Net: a small matching rule that keeps same business offices whole and cuts the leak for the rest.
Header: Migration
Options:
A) By team match (recommended)
At first launch on the new version, the global business settings go to every known office whose registry matches the config's team (configMatchesRegistry); other offices take their identity from office.json when present and start with no mailboxes, schedules, grants or connectors, with a setup notice on first open; an office with neither opens setup. Effort M (human: ~1 day / CC: ~40min), risk medium; tests: matching, non matching with and without office.json, crash midway resumes.
B) Copy to every office
Every known office gets a copy of today's settings. Effort S (human: ~3h / CC: ~15min), risk high: the leak continues for different businesses.
C) Open office only
Only the office open at update time gets the settings; all others start empty with a setup notice. Effort S (human: ~4h / CC: ~20min), risk medium: same business folders lose their settings.

State: approved
Actual answer: A) By team match (recommended), D11 answer 2026-11-18
Accepted scope: at first launch on the new version, the global business settings go to every known office whose registry matches the config's team (configMatchesRegistry); other offices take their identity from office.json when present and start with no mailboxes, schedules, grants or connectors, with a setup notice on first open; an office with neither opens setup; tests: matching, non matching with and without office.json, crash midway resumes.
History: none

Approval readiness: PASS. Checked: R1 (D10), R2 (D11), structure (D9, settles BIZ-8); carried CEO approvals BIZ-1 (D1), BIZ-2 (D3, deferred), BIZ-3 (D4), BIZ-4 (D5), BIZ-6 (D6 amended by D8), OV-1 (D7), OV-2 (D8). Required work under those answers (office id, accessor type split, scoped factory reset, one key list, regression test) carries no new choice.

### Reality rows (eng)

```
REALITY: premise-table finding unverified=2 (other installs with several offices: no telemetry, [unverified]; per office Claude sign in: probe T4 pending) src/main/fs.ts:292-307
REALITY: already-done pass no commit on origin/main since 2026-11-01 adds office ids, office keyed settings or a guarded switch src/main/index.ts:4203
REALITY: surface-check pass closing time relaunch exists (startClosingTime relaunch) src/renderer/src/App.tsx:205-209; configMatchesRegistry exists src/main/officeFile.ts:82-85
REALITY: binding-decisions pass CEO answers D1, D3 to D8 and eng answers D9 to D11 are carried; memory rules (reuse the orchestrator architecture, fix in code for every install) kept src/main/officeFile.ts:79
REALITY: numbers pass recentHives cap 8 [measured: src/main/fs.ts:292-307]; owner install lists 1 office [measured: local config.json]; file counts are [estimated] src/main/fs.ts:292-307
REALITY: deferred-asks pass no linked issue; nothing deferred from an issue docs/FEATURES.md:879
REALITY: pr-count pass no .gstack/ship-policy.json, default one PR per wave; T2 guard is its own small PR, step one one PR TODOS.md:3
PLAN_REALITY: phase=eng rows=7/7 missing=none unverified=2 verdict=complete
```

### Scope Challenge findings

1. [CRITICAL] (confidence: 9/10) src/main/index.ts:4204 — the switch kills terminals at once. Disposition: approved D10 (R1).
2. [CRITICAL] (confidence: 8/10) src/main/fs.ts:292-307, src/main/officeFile.ts:76-88 — several offices share one config with no rule for who owns it after the split. Disposition: approved D11 (R2).
3. [INFORMATIONAL] (confidence: 8/10) structure — step one counted about 14 files and 1 new accessor in the Smaller arrangement. Disposition: approved D9.

### 1. Architecture

Two shapes for the new boundary (it adds a public surface the rest of main calls):

```
  Shape A (picked): one deep module            Shape B: per field helpers
  src/main/officeSettings.ts                    getBusinessName(), getMailboxes(),
    currentOfficeId(): string                   getMissions(), setMailboxes(), ...
    officeSettings(): OfficeSettings            one function per field, each reading
    updateOfficeSettings(patch): void           config and the office id itself
    installConfig(): InstallConfig
```

Shape A hides the office id lookup, the offices map, migration state and the frozen copy behind three calls; Shape B leaks the keying rule into every helper (red flag 2) and grows a hand synced list of helpers (red flag 8). Picked A.

```
  renderer ── IPC config:get / config:update ──> main
                                                  ├─ installConfig()      window, language, Claude Code update, harnessHome, known offices
                                                  └─ officeSettings()     offices[currentOfficeId()] in config.json
                                                       ├─ identity, team, profile, business folder
                                                       ├─ mailboxes, agentCapabilities, connectors, QuickBooks, integrations
                                                       ├─ missions, research, dataClasses, notifications text
  secrets store  key "<officeId>:mail:<id>"  ────────┘
  knowledge      userData/knowledge/<officeId>   (an owner set rootPath still wins)
  journals       mail send, proposals, broker write: rows carry officeId; readers filter
  Pulse db       office column holds officeId (rows by folder mapped once)
  office.json    gains id; still the mirror the setup screen reads
```

Findings:

1. [CRITICAL] (confidence: 9/10) src/main/index.ts:616-619, 700, 1746-1760, 3528-3570 — business fields are read straight from `readConfig()` in at least 7 files (grep of `cfg.businessName|mailboxes|missions|...`). Any reader left on the old path keeps leaking. Required with the approved split: `readConfig()` returns `InstallConfig`, a type without business fields, so a missed reader fails to compile (red flag 7). Disposition: required work of the approved scope (D9), no new choice.
2. [CRITICAL] (confidence: 9/10) src/shared/officeRecord.ts:23-39 — `OfficeRecord` has no id (`version`, business fields, `team` only). Step one needs a stable id: a random id written to office.json at migration or setup, and kept in `offices[id].home` in config so a lost office.json is recovered by folder path. Disposition: required work of BIZ-4 and D9; mechanics decided under the owner's plan review rule.
3. [CRITICAL] (confidence: 8/10) src/main/factoryReset.ts:156-171 — `eraseOfficeData` erases userData files as one office's data (`APP_DATA_ENTRIES`, the journals). With several offices keyed in userData, a reset of one business would erase the other's secrets, knowledge and journals. Required: reset erases only the open office's entry, keys and knowledge folder. Disposition: required by the approved isolation, no new choice.
4. [INFORMATIONAL] (confidence: 8/10) src/main/hive.ts:2070-2072, src/main/config.ts:724-726 — `~/.claude` is hardcoded in plugin and permission readers. BIZ-3 routes them through one `claudeHome()` from the office's settings, and lands last in step one, after probe T4 passes. Disposition: required work of BIZ-3; ordering decided.
5. [INFORMATIONAL] (confidence: 7/10) src/main/index.ts:4145-4207 — the interim guard (T2) lives in `config:changeHome`; it becomes dead when step one ships and is deleted in the same change (red flag 6). Disposition: noted in tasks.

Production failure per new path: migration crash midway (resumes from the frozen copy and a `migratedOffices` marker); office.json deleted (id recovered from `offices[id].home`); keychain unavailable (secrets store already refuses to write, integrations.ts:12).

### 2. Code quality

1. [CRITICAL] (confidence: 8/10) src/shared/officeRecord.ts:41-50, src/main/config.ts:229-326 — the business field list would live in three places (config types, `OfficeConfigFields`, the migration). Derive all three from one exported const list of business keys, and fail the build if `HarnessConfig` keeps any of them (red flag 8). Disposition: required work.
2. [INFORMATIONAL] (confidence: 8/10) src/main/config.ts:483-495 — `readConfig()` returns `DEFAULTS` on a parse error. With every business inside one file, a damaged config must keep the existing damaged file handling (config-damaged.test.cjs) and never write defaults over the offices map. Disposition: required regression check.
3. [INFORMATIONAL] (confidence: 7/10) `config:update` (index.ts:4100-4125) merges a renderer patch into the whole config; business keys in a patch go to `updateOfficeSettings`, install keys to the install part. Disposition: required work.

### 3. Tests

Framework: node test runner, `test/*.test.cjs` (e.g. test/office-record.test.cjs, test/factory-reset.test.cjs, test/config-durability.test.cjs).

```
CODE PATHS                                              USER FLOWS
[+] src/main/officeSettings.ts (new)                    [+] Switch business
  ├── currentOfficeId()                                   ├── [GAP] [→E2E] switch, closing time, other floor opens
  │   ├── [GAP] office.json has id                        ├── [GAP] cancel closing time keeps the office
  │   └── [GAP] id missing, recovered from home           └── [GAP] target folder deleted, missing office screen
  ├── officeSettings() / updateOfficeSettings()         [+] Add a business (setup)
  │   └── [GAP] two offices never see each other's keys   └── [GAP] new office starts empty and runs setup
  └── installConfig() type has no business keys          [+] Interim guard (T2)
      └── [GAP] build fails when a business key is read     ├── [GAP] different team refused, with and without office.json
[+] migration (first launch)                              └── [GAP] new empty office refused while settings hold a business
  ├── [GAP] team match gets settings (D11)              [+] Factory reset
  ├── [GAP] different team, office.json, setup notice     └── [GAP] resets only the open business
  ├── [GAP] no record, no match, setup                  [+] Own Claude login (BIZ-3)
  ├── [GAP] crash midway resumes                          └── [GAP] office claude folder drives env and plan detection
  └── [★★ TESTED] case insensitive match office-record-edges.test.cjs
[+] secrets, knowledge, journals keyed by office id
  ├── [GAP] same mailbox id in two offices, two passwords
  └── [GAP] proposal from office A not listed in office B
[+] Pulse rows by office id
  └── [GAP] folder keyed rows mapped once; moving the folder keeps history
[+] config:changeHome with closing time (D10)
  └── [GAP] nothing written before conclusion

COVERAGE: 1/21 paths tested (5%)  |  Code paths: 1/13  |  User flows: 0/8
QUALITY: ★★★:0 ★★:1 ★:0  |  GAPS: 20 (1 E2E, 0 eval)
```

Regression contract (IRON RULE, decided as test shape under the owner's plan review rule): an install with one office behaves the same after migration: Michael's briefing names the same business, the same schedules fire, the same mailboxes and grants apply, Pulse history is kept. Test: test/office-settings-migration.test.cjs with a one office fixture.

Proposed tests (all P1, with value cards):
- test/office-settings.test.cjs: Value: protects=two offices never read each other's business keys; fails_when=a reader uses config instead of officeSettings; why_new=no office keyed settings exist; seam=none; no_claim=packaged Electron relaunch (unit only)
- test/office-settings-migration.test.cjs: Value: protects=D11 team match, setup notice, crash resume, one office regression; fails_when=settings copied to a different team or lost for the same team; why_new=no migration exists; seam=none; no_claim=real recentHives on owners' Macs (fixtures)
- extend test/factory-reset.test.cjs: Value: protects=a reset erases only the open business; fails_when=eraseOfficeData removes another office's keys or knowledge; why_new=today's test assumes one office; seam=none; no_claim=none beyond protects
- test/switch-business.test.cjs: Value: protects=D10 nothing written before closing concludes, cancel keeps harnessHome; fails_when=changeHome writes before conclusion; why_new=closing tests cover quit, not switch; seam=none; no_claim=agents' real hand off (stubbed god)
- test/office-guard.test.cjs (T2): Value: protects=the guard refuses a different team with and without office.json; fails_when=the guard compares names or skips offices with no record; why_new=no guard exists; seam=none; no_claim=none beyond protects
- extend test/office-record.test.cjs: Value: protects=office.json carries a stable id that survives rewrite; fails_when=syncOfficeRecord drops the id; why_new=records have no id today; seam=none; no_claim=none beyond protects
- test/office-secrets.test.cjs: Value: protects=secret keys are namespaced by office id; fails_when=mail:<id> collides across offices; why_new=secrets are install wide today; seam=none; no_claim=Keychain (file store)
- extend the Pulse backfill test: Value: protects=folder keyed rows map to the office id once; fails_when=history splits after a folder move; why_new=Pulse keys by folder today; seam=none; no_claim=none beyond protects
- E2E (run after build, live app): two offices, switch back and forth five times; each Michael's first message names its own business.

Tests to retire: none. LLM/eval scope: Michael's briefing text is filled from office settings instead of config; the text itself does not change, so no eval is required beyond the one office regression test.

### 4. Performance

1. [INFORMATIONAL] (confidence: 8/10) src/main/config.ts:483-495 — `readConfig()` reads and parses config.json on every call; the offices map grows it by at most 8 office entries (recentHives cap). Scale: a few KB per office, unknown call rate; no change needed unless profiling shows it. Disposition: no action.

No other issues found.

### Outside voice (eng)

Codex was not run (owner rule: Codex only for adversarial diff review). The CEO review's native second opinion already covered this plan; its findings 3, 4 and 6 are settled here by D8, D11 and D9. A second native pass would read the same text, so this review records outside coverage as unavailable.

### NOT in scope (eng)

- Step two, both businesses at once: deferred (D3), TODOS.md.
- Carrying an office's settings with its folder to another Mac: given up by D9 (Smaller arrangement).

### What already exists (eng)

Reused: ClosingTimeController relaunch (closingTime.ts:65,124) for D10; configMatchesRegistry (officeFile.ts:82-85) for D11 and T2; office.json and syncOfficeRecord for the id; the encrypted secret store; the knowledge root override; Pulse's office column; config-damaged handling.

### Failure modes (eng)

| Path | Realistic failure | Test | Handling | User sees |
|---|---|---|---|---|
| migration | crash between writes | planned | frozen copy and marker, resume next launch | own business, or setup |
| office id | office.json deleted | planned | recover from offices[id].home | nothing |
| switch | closing time hangs | existing closing tests | force quit dialog | the closing dialog |
| reset | one business reset | planned | keyed erase | only that business resets |
| Claude login | sign in stored in main entry | probe T4 | BIZ-3 waits for T4 | sign in card |

Critical gaps: 0 in the planned design (every path has handling and a planned test). The shipped switch leak stays a critical gap until T2 ships.

### Worktree parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| T2 guard | src/main (changeHome), renderer settings | — |
| office id and settings accessor | src/main, src/shared | — |
| migration | src/main | office id and accessor |
| readers moved, factory reset, secrets, knowledge, journals | src/main, src/renderer | accessor |
| Pulse office id | src/main (db, pulse) | office id |
| switch with closing time | src/main, src/renderer | accessor |
| own Claude login | src/main | readers moved, probe T4 |

Lane A: T2 guard (independent, ships first). Lane B: office id → accessor → migration → readers → switch → Claude login (shared src/main, sequential). Lane C: Pulse office id after the id lands. Launch A and B; C joins after B's first step. Conflict flag: A and B both touch `config:changeHome`; land A first.

### Eng implementation tasks

- [x] **E1 (P1, human: ~1 day / CC: ~30min)** — src/main, src/shared — Add a stable office id and the officeSettings accessor (done 2026-11-19; readConfig's type switch moved to E3, see E1 below)
  - Surfaced by: Architecture 1 and 2, Code quality 1
  - Files: src/main/officeSettings.ts (new), src/main/config.ts, src/shared/officeRecord.ts, src/main/officeFile.ts
  - Verify: node --test test/office-settings.test.cjs test/office-record.test.cjs; typecheck fails on a planted business key read
- [x] **E2 (P1, human: ~1 day / CC: ~40min)** — src/main — Migrate by team match with a frozen copy and resume marker (built 2026-11-19; called at launch in E3, see E2 below)
  - Surfaced by: R2 (D11), CEO Section 9
  - Files: src/main/officeSettings.ts, src/main/index.ts (launch)
  - Verify: node --test test/office-settings-migration.test.cjs
- [x] **E3 (P1, human: ~2 days / CC: ~1h)** — src/main, src/renderer — Move every business reader and writer to officeSettings; key secrets, knowledge, journals and dock keys by office id; scope factory reset (done 2026-11-19 in three parts, see E3 below)
  - Surfaced by: Architecture 1 and 3, Code quality 3, D9
  - Files: src/main/index.ts, src/main/mail.ts, src/main/integrations.ts, src/main/knowledge.ts, src/main/factoryReset.ts, src/main/foundations.ts, renderer settings screens
  - Verify: node --test test/office-secrets.test.cjs test/factory-reset.test.cjs; full suite green
- [x] **E4 (P1, human: ~4h / CC: ~20min)** — src/main, src/renderer — Switch business through closing time with relaunch (done 2026-11-19, see E4 below)
  - Surfaced by: R1 (D10)
  - Files: src/main/index.ts (config:changeHome), src/main/closingTime.ts, src/renderer/src/App.tsx, SettingsModal.tsx
  - Verify: node --test test/switch-business.test.cjs
- [x] **E5 (P2, human: ~4h / CC: ~20min)** — src/main — Key Pulse by office id and map folder rows once (done 2026-11-19, see E5 below)
  - Surfaced by: BIZ-4 (D5)
  - Files: src/main/db.ts, src/main/pulseBackfill.ts, Pulse telemetry
  - Verify: the Pulse backfill test with a moved folder
- [x] **E6 (P2, human: ~1 day / CC: ~40min)** — src/main — Own Claude login per office through one claudeHome(), after probe T4 (done 2026-11-19, see E6 below; the choice itself is set in Add a business, DT3)
  - Surfaced by: Architecture 4, BIZ-3 (D4)
  - Files: src/main/claudeAccount.ts, src/main/hive.ts, src/main/config.ts, src/main/ptyEnv.ts, src/main/index.ts
  - Verify: a unit test that the office's folder drives terminal env and plan detection; live sign in of two accounts
- [ ] **E7 (P1, human: ~2h / CC: ~10min)** — live check — Two offices switched five times; each Michael names its own business
  - Surfaced by: Test review E2E
  - Files: none
  - Verify: live run in the dev office per the restart routine

Unresolved decisions in this review: none.

## Design review (step one screens), 2026-11-18

Target: the screens of step one. Mockup (HTML and CSS with the app's tokens, per the owner's mockup rule): docs/designs/separate-businesses-mockup.html. DESIGN.md: branding/DESIGN.md. Focus: all 7 dimensions (D12). Outside design voice: skipped (D13).

### Approved design decisions

| # | Decision | Answer |
|---|---|---|
| 1A | The open business's name is a quiet menu button beside the mark in the top bar (§7.1 icon button hover). The menu lists each business with its state, then Add a business. With one business the name is plain text and the menu holds only Add a business. | D14 |
| 1B | Settings, General: "Other offices on this computer" becomes Your businesses, with the same entries as the menu, each with its folder in mono and Open. Change office folder keeps Move here and Open the office in this folder. Start a new empty office becomes Add a business. | D15 |
| 2A | The business that is not open reads "Closed since 9:12" (time in mono). An info tip in Settings says its mail and schedules wait until it opens. | D16 |
| 2B | A business whose folder is gone shows "Folder not found" with a Find it link to Settings, Your businesses, Change office folder. Choosing it never starts closing time. | D17 |
| 2C | A setup left unfinished shows its typed name, or New business, with "Setup not finished". Choosing it reopens the wizard at the step where it stopped. Settings, Your businesses offers Remove for it. | D18 |
| 3A | Add a business opens the setup wizard over the app while the open business keeps working. The last step's Open the office starts closing time for the open business, then opens the new one. Going back to the office leaves the new business as Setup not finished. | D19 |
| 5A | During a switch, the closing bar reads "Closing <A> to open <B>". Cancel switch keeps <A> open. "Switch now" asks once: "3 people are still working. Switch anyway?", with Switch anyway and Keep waiting. | D20 |
| 6A | The button is labelled "Business: <name>. Switch business" and has aria-haspopup=menu. Menu rows are menuitemradio with aria-checked and are 40 px tall. Arrow keys move, Enter opens, Esc closes and returns focus. Names are capped at 220 px with an ellipsis and the full name in a tooltip. A switch is announced once: "Closing <A> to open <B>". | D21 |
| 7A | The window title becomes "<business>, Don't Be Michael", only when the install has two or more businesses. | D22 |

The guard (T2) is one alert dialog: the title "That office belongs to another business" with an info tip, one line, and OK. The second line reads "Open it from its own Mac user for now." only if T1 shows two Mac users running side by side. Otherwise it reads "It can't be opened from here yet." Both follow the CEO decisions D6 and D8, so this review adds no new choice here.

### Pass scores

| Pass | Before | After | Remaining gap |
|---|---|---|---|
| 1 Information architecture | 3 | 9 | none material |
| 2 Interaction states | 4 | 9 | the guard's second line waits on T1 |
| 3 Journey | 4 | 8 | first time switch has no walkthrough (not needed) |
| 4 Generic UI risk | 8 | 8 | none; app UI from existing parts |
| 5 Design system | 7 | 9 | none material |
| 6 Responsive and accessibility | 4 | 9 | none material |
| 7 Decisions | | | 9 resolved, 0 deferred |

Journey (storyboard):

```
  STEP | OWNER DOES                          | FEELS                 | PLAN SPECIFIES
  1    | sees "Harbor & Pine Bakery" top left | oriented              | 1A
  2    | opens the menu, picks Add a business | curious, a bit unsure | 1A, 3A
  3    | fills setup while the bakery works   | unhurried             | 3A, Claude account choice
  4    | Open the office: closing bar         | in control            | 5A, cancel and switch now
  5    | agency floor opens, title updates    | clear which business  | 1A, 7A
  6    | later: menu shows bakery Closed since| knows it is waiting   | 2A
```

### Design tasks

- [x] **DT1 (P1, human: ~1 day / CC: ~30min)**: TopBar and a new business menu. Build the name button and menu with the Open, Closed since, Folder not found and Setup not finished rows. (done 2026-11-19, see DT1 below; the narrow width check is live)
  - Surfaced by: 1A, 2A, 2B, 2C, 6A
  - Files: src/renderer/src/shell/TopBar.tsx, a new BusinessMenu component, src/renderer/src/i18n/locales/en.json
  - Verify: a renderer test for the row states and keyboard; live check at narrow width with a long name
- [ ] **DT2 (P1, human: ~3h / CC: ~15min)**: Settings. Rename to Your businesses, align its entries with the menu, and replace Start a new empty office with Add a business.
  - Surfaced by: 1B
  - Files: src/renderer/src/components/SettingsModal.tsx, en.json
  - Verify: the Settings test lists the same entries as the menu
- [ ] **DT3 (P1, human: ~1 day / CC: ~40min)**: Setup wizard. Run Add a business over the app while the open business keeps working, add the Claude account choice on the Ready step, and switch at the end.
  - Surfaced by: 3A, BIZ-3 (D4)
  - Files: src/renderer/src/components/OnboardingWizard.tsx, src/main/index.ts
  - Verify: an integration test that the open office keeps running until Open the office
- [ ] **DT4 (P2, human: ~2h / CC: ~10min)**: Closing bar. Add the switch subject, Cancel switch, and Switch now with its one time question.
  - Surfaced by: 5A
  - Files: the closing bar component, en.json
  - Verify: the closing bar test covers the switch variant
- [ ] **DT5 (P2, human: ~30min / CC: ~5min)**: Window title. Name the business when there are two or more.
  - Surfaced by: 7A
  - Files: src/main/index.ts
  - Verify: a unit test of the title rule

### NOT in scope (design)

- Showing how many items the closed business has waiting: it needs reading another office while it is closed, which belongs with step two.
- DESIGN.md text for these components is written when they ship (the doc records shipped UI).

### What already exists (design)

§7.1 top bar icon button hover, §7.23 menus, closing bar and dialogs, §7.25 onboarding wizard and its Ready step sign in rows, the Office folder missing screen, InfoTip, the floor business name plate (docs/designs/floor-business-name.md), the hire wizard's indigo soft selection for the account choice.

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope: top bar, menu, |
  |                      | Settings, wizard, closing bar, dialog       |
  | Step 0               | 3/10 initial; all 7 dimensions              |
  | Pass 1  (Info Arch)  | 3/10 → 9/10 after fixes                     |
  | Pass 2  (States)     | 4/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 4/10 → 8/10 after fixes                     |
  | Pass 4  (AI Slop)    | 8/10 → 8/10 after fixes                     |
  | Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 4/10 → 9/10 after fixes                     |
  | Pass 7  (Decisions)  | 9 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 1 HTML mockup, updated to the decisions     |
  | Decisions made       | 9 added to plan                             |
  | Decisions deferred   | 0                                           |
  | Overall design score | 3/10 → 8/10                                 |
  +====================================================================+
```

Unresolved design decisions: none. Plan is design-complete for step one. Run /design-review after implementation for visual QA.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN | mode: SCOPE_REDUCTION, 1 critical gaps |
| Outside Review | Codex (not run, owner rule); native Claude subagent in the CEO review | Independent 2nd opinion | 2 | unavailable (native completed once) | 8 findings (native, CEO run); 8 resolved or routed; 0 unresolved; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES OPEN | 29 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 3/10 → 8/10, 9 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** plan-review phase: Codex not run (owner rule); the CEO review's native Claude subagent completed with 8 findings; the eng review ran no second pass; design phase: outside design voice skipped by the owner (D13). No completed external review.
- **VERDICT:** DESIGN CLEARED; CEO and eng reviews hold mapped work and no open decisions; eng review required to clear.

**UNRESOLVED DECISIONS:**
- + 3 unresolved from prior reviews (the CEO review's BIZ-5, BIZ-7 and BIZ-8, settled in the eng review by D10, D11 and D9)
