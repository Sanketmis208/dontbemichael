# Office architecture review, 2026-11-06

Working plan for /plan-ceo-review (SELECTIVE EXPANSION). Reviews every architecture change made today against the harness principles, one change at a time.

Inputs:
- `docs/designs/referenceable-customers.md` (decisions 1 to 6)
- `docs/designs/foundations-rules-not-records.md` (decisions 1 to 8)
- Member rule in `src/main/hive.ts:483` (uncommitted): a member asks every teammate whose role could hold a fact before Michael.
- Research: `reports/Customer lists for marketing and sales.md`, `reports/Foundations versus systems of record.md`.

## Harness principles (the contract)

| # | Principle | Evidence |
|---|---|---|
| P1 | Michael orchestrates; he owns cards to Done; the app records and shows, never moves cards | memory michael-orchestrates-app-is-interface |
| P2 | Only Michael assigns work. Members share facts peer to peer ("query" asks, "inform" tells); a member to member "request" is delivered to Michael | hive.ts:6726 protocol; owner 2026-10-03 quoted at test/ask-teammates-first.test.cjs:5-7: "Agents does not need to tell michael unless they cant resolve those by finding the appropriate agent" |
| P3 | One check, on the member; Michael never cross-checks | memory one-check-member-asks-teammates |
| P4 | A member's memory, notes and hive folder are private; ask instead. Folder walls are enforced by the PreToolUse hook | hive.ts:483, hooks.ts:1316 folderCheck |
| P5 | The owner hears from Michael only; members file asks to triage | hive.ts:485 |
| P6 | Reuse the orchestrator architecture; no app specific parallel stores without a serious downside | memory reuse-orchestrator-architecture |
| P7 | Generic for every office: roles, never names; MoblizeIT is a reference office | memories moblizeit-is-a-reference-office, no-agent-names-in-job-text |
| P8 | New hires start with capabilities off | memory new-hires-start-restricted |
| P9 | Schedules run as configured; no hidden cadences | memory schedules-run-as-configured |
| P10 | Michael decides office management; owner only when unresolvable, conflicting or sensitive | memory schedule-changes-need-owner-approval |
| P11 | Prompt prefix stays volatile free for caching; foundations ride the hook context | hive.ts:2347-2356 |
| P12 | Michael does no member's work while any worker member exists; with none, he does all of it and suggests growing the team (owner D5, 2026-11-07, widening the 2026-11-06 records exception) | memory michael-keeps-records-only-when-alone.md (index entry "Records follow roles") |
| P13 | Outside feedback and anything that changes another member's record go through Michael, so he knows and no agent changes another's data by mistaking a task for a fact | owner, D2 answer 2026-11-07 |

## Landscape (own research, 2026-11-06)

- Supervisor (orchestrator and workers) routing scales coordination linearly but the supervisor is the throughput bottleneck; direct message passing has lower latency (Arsanjani and Bustos pattern catalog; openlayer multi-agent guide, March 2026).
- Blackboard designs replace routing with shared state that agents read and post to; a 2025 arXiv study (2510.01285) reports gains over master worker on data discovery, but shared state needs a write discipline ("a shared race condition" otherwise).
- Production systems mostly mix the two: a supervisor for the business process, shared state for facts (openlayer; Confluent event driven patterns, where a topic acts as the blackboard).
- Anthropic's own research system is orchestrator and workers, and notes it fits poorly where agents share context or depend on each other heavily.
- Layer 3 reading for this app: Michael already is the supervisor for work (P1, P2). Today's designs also made him the router for facts (customer news, sightings). Facts are the blackboard case: many writers, few readers, no decision needed. That is where the architecture risks a bottleneck.

## Decision ledger

| ID and owner | Contract and evidence | Current (decided today) | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| R1 fact routing (owner) | P2, hive.ts:6726, owner 2026-10-03 | Members report customer news and list sightings to Michael, who hands them to the keeper (referenceable decision 2; foundations decision 6) | Kept as decided (B) | approved | D2 answer 2026-11-07: "through michael as option 2 suggested"; reasons: an office manager should know outside feedback, and agents could change another agent's data by misreading a task as a fact. Scope: customer news and list sightings only |
| R2 where duties are recorded (owner) | P6, P7, P10 | A duty is a line in its holder's Work style; Michael moves lines between Work styles at each hire (referenceable decision 5) | No register and no moves: a record follows the job role (deals with Sales, invoices with Finance). A member takes a record only when its role and Work style as written cover it; otherwise Michael asks the owner to give it to an existing member (a role change the owner approves, D4), hire a role, or drop it | approved (owner's own option) | D3 answer 2026-11-07: "information is kept based on agent job role ... michael will ask owner to either hire a new agent or allow updating admin role to do finance as well". Supersedes referenceable decision 5's automatic move and report and its most contact fallback; P12 (Michael keeps records when alone) untouched by this answer |
| R3 where records live (owner) | P4, P6 | Each record is a file in its keeper's private folder; others ask the keeper | No change | settled, no question needed | Follows from D2 and D3: folder walls (hooks.ts:1316 folderCheck) already stop other members writing a keeper's file, which is the protection the owner asked for; a shared folder would weaken it |
| R4 report dedupe (owner) | P4 | Each member remembers what it last reported per customer in its own memory | No change | settled, no question needed | Small mechanic under the plan review rule; private records leave memory as the only place a reporter can check |
| R5 record list (owner) | P7 | Nine named records first, two later (foundations decision 7) | Kept as build order only: no record catalog in code; each record is whatever a job's "where it lives" foundation question names, kept by the role whose job it is | settled, no question needed | Follows from D3 (records follow roles); foundations decision 7 already makes each record a file plus job text |
| R6 member rule wording (owner) | P3, owner 2026-11-06 "not either with them or not their core job" | hive.ts:483 says "not in your own records and is not your own job to know" (AND) | "When work in your scope needs a fact that is not in your own records or mail, ask every teammate whose role could hold it, then Michael" (job clause dropped) | approved | D4 answer 2026-11-07, owner's refund example: Support checks its mail and records, then asks Finance and Sales, then Michael. Scope: hive.ts:483 sentence and its test |
| R8 member scope triage (owner) | P1, P2; owner D4 answer 2026-11-07 | Member prompt says "Do what was asked, at the scope asked" (hive.ts member rules) and "If you need someone else to do something, tell Michael"; no rule for a task outside the member's role | Three cases in the member prompt: in scope, do it and ask teammates for facts; partly in scope, do your part and tell Michael the rest (e.g. a CRM change that affects Marketing); outside your role, do none of it and return it to Michael | approved | D4 answer 2026-11-07: "If the job is fully out of scope ... this goes to michael". Scope: member prompt text and its test |
| R7b recurring work given to an existing member (owner) | P10; owner D4 answer 2026-11-07 | Michael's "When no one fits" ask offers "hand it to the closest team member" as a one off (hive.ts Michael prompt, "When no one fits") | For recurring work (a record, a standing job), giving it to an existing member means updating that member's role and Work style with the owner's approval; a one off task can still go to the closest member | approved | D4 answer 2026-11-07: "either case will then require approvals to update existing agent role and work". Scope: Michael's "When no one fits" options |
| S1 build scope (owner) | Spec review scope findings 1 and 2 | Plan items cite all foundations decisions 1 to 8 and referenceable decisions 1 to 6 without placing them | One build: agent rules (items 1 to 7), referenceable customers decisions 1 to 4 and 6, and foundations decisions 1 to 8, all with R2 applied | approved | D7 answer 2026-11-07: "One build" |
| T1 behavior replay (owner) | Outside voice O9; Section 6 no_claim | String tests only | Replay of the Masa case, a refund case and an out of role task through member sessions is a ship gate | approved | D9 answer 2026-11-07: "Ship gate (recommended)" |
| R7a Michael doing out of role work (owner) | P1, P12 | Michael's "When no one fits" ask offers "you do it yourself this once" | Removed. With one or more worker members, Michael never does a member's work: he delegates, asks members questions, tries to resolve, and asks the owner to give the work to an existing member, hire, or drop it. With no worker member at all, Michael does all the work himself and suggests growing the team; the owner may keep it that way | approved (A, widened by the owner) | D5 answer 2026-11-07: "when he is the only one, he is a do it all guy ... as soon as there is one worker agent, michael will stop doing work himself and ask owner to assign exisiting worker, hire a new or drop the task". Scope: Michael's "When no one fits" options and a solo office branch of his prompt |

## Answered: R1 (D2)

Owner chose B. The comparison below is kept for the record.

### R1 comparison
Commitment comparison:

| Commitment | Source/approval or pending | Current | A | B | C |
|---|---|---|---|---|---|
| Who receives a customer sentiment report or a list sighting | referenceable decision 2, foundations decision 6 (approved today) | Michael, who hands it to the keeper | The record's keeper, as an "inform" | Michael, who hands it to the keeper | Nobody; the keeper asks teammates when it needs to |
| What triggers a report | referenceable decision 2 (approved) | New customer, first or flipped sentiment, customer left | Same | Same | None (pull only) |
| Michael's part | P1, P2 | Routes every report | Only when no keeper exists, or the keeper needs work done or a decision | Routes every report | None |
| Turns per report | estimated | 2 (Michael, keeper) | 1 (keeper) | 2 | 0 per event; 1 query round per use |
| Marketing asks Michael when unsure whether to name a customer | referenceable decision 2 (approved) | Kept | Kept | Kept | Kept |
| Michael's report shows list changes | pending | Yes, he routed them | No; the keeper's record shows them | Yes | No |

Question: D2 — R1: Should customer news and list sightings go straight to the record's keeper instead of through Michael?
Header: Fact routing
A) Straight to the keeper (recommended)
A member that sees news for a record (an angry customer, a new supplier) tells the record's keeper with an "inform"; Michael is involved only when no keeper exists or work or a decision is needed. Effort S (human: ~2 hours / CC: ~10 min), risk low, reuses the existing inform protocol. ✅ Matches your 2026-10-03 rule that members go to Michael only when they cannot find the right teammate. ✅ Halves the agent turns per report and keeps Michael free as the office grows. ❌ Michael's report no longer lists each change; you see them in the keeper's record instead.
B) Through Michael, as decided today
Every report goes to Michael, who hands it to the keeper. Effort S (zero new work), risk medium. ✅ Michael sees every customer signal and can spot patterns across records. ✅ No change to today's decisions. ❌ Two turns per report and Michael becomes the bottleneck for facts, the known weak point of supervisor designs.
C) Pull only
Nobody reports; the keeper and Marketing ask teammates when they need a fact. Effort S, risk medium. ✅ Zero cost between uses and no reporting rules for agents to follow. ✅ Fits the one check rule already in the member prompt. ❌ A complaint can sit unseen until the next story, so a customer could be named while unhappy.

## Answered: R2 (D3)

Owner chose neither A, B nor C: records follow job roles, and a gap goes to the owner through Michael as a hire or role change. The comparison below is kept for the record.

### R2 comparison
Commitment comparison:

| Commitment | Source/approval or pending | Current | A | B | C |
|---|---|---|---|---|---|
| Duties sit with the best suited member, rechecked at each hire and archive, moved by Michael and reported | referenceable decision 5 (approved) | Kept | Kept | Kept | Kept |
| Where "who keeps what" is written | pending | A line in the keeper's Work style | A keeper field per record in the registry, written by the app when Michael sends a duty change | A line in the keeper's Work style | The "where it lives" foundation answer names the keeper |
| How a keeper knows how to keep a record | pending | Its Work style line | One generic rule in the member prompt plus a short how per record kind, kept as data | Its Work style line | Michael's hand-off message and the keeper's memory |
| Who changes Work styles | owner and pack offers today | Owner and pack offers | Unchanged | Michael too (new ability) | Unchanged |
| App can enforce that only the keeper writes a record | P13 (approved R1 reasons) | No | Yes, from the keeper field (folder rule) | No; Work style text is not machine readable | No |
| Effort | estimated | n/a | M (human: ~2 days / CC: ~1 hour) | M (human: ~2 days / CC: ~1 hour) | S (human: ~half day / CC: ~15 min) |

Question: D3 — R2: Where should "who keeps which record" be written: data the app holds, or lines in each member's Work style?
Header: Duty register
A) Keeper field, kept as data (recommended)
Each record kind has one keeper in the registry; Michael changes it with a duty message and the app writes it; the how comes from one generic member rule plus a short note per record kind. Work styles stay yours. Effort M (human: ~2 days / CC: ~1 hour), risk low. ✅ The app can stop any member other than the keeper from writing a record, which answers your worry about agents changing each other's data. ✅ A new record kind is a data entry, not new prompt text for every member. ❌ A new app field and message to build and test.
B) Work style lines, as decided today
Michael moves a duty line from one member's Work style to another's at each hire. Effort M (human: ~2 days / CC: ~1 hour), risk medium. ✅ Follows the rule that a recurring job keeps its how in a Work style. ✅ The duty reads naturally next to the member's other work. ❌ Michael would edit your Work style text, which today only you and pack updates change, and the app cannot read free text to protect a record.
C) The foundation answer names the keeper
"Where deals are kept: Sales keeps it" doubles as the register. Effort S (human: ~half day / CC: ~15 min), risk medium. ✅ No new field: reuses the "where it lives" answers already decided. ✅ Michael already reads every foundation answer. ❌ Your answers win over Michael's, so a move at a hire would need a card whenever you wrote that answer, and the keeper learns its duty only from memory.

## Answered: R6 (D4)

Owner confirmed dropping the job clause and laid out the scope model now recorded as R6, R8 and R7b. Comparison kept for the record.

### R6 comparison
Commitment comparison:

| Commitment | Source/approval or pending | Current | A | B |
|---|---|---|---|---|
| When a member asks teammates before Michael | owner 2026-11-06: "if the information is not either with them or not their core job" | Only when a fact is not in its records AND not its own job | Whenever a fact is not in its own records | As now |
| Sweep of every teammate whose role could hold it, one round, say who was asked | approved 2026-11-06 | Kept | Kept | Kept |
| Test guarding the sentence | test/ask-teammates-first.test.cjs:43 | Asserts the AND wording | Updated to the new wording | Unchanged |
| Effort | estimated | n/a | S (human: ~15 min / CC: ~2 min) | S (zero new work) |

Question: D4 — R6: Should the member rule drop "and is not your own job to know", so a member asks teammates whenever a fact is not in its own records?
Header: Ask teammates
A) Drop the job clause (recommended)
The rule becomes "When you need a fact that is not in your own records, ask your teammates before you go to Michael". Effort S (human: ~15 min / CC: ~2 min), risk low. ✅ Matches your words: ask when the fact is not with them or not their core job. ✅ Closes the Masa case, where the fact was arguably the member's own job and so the rule did not apply. ❌ Members may ask a round of teammates for facts they could have found in a system they can read.
B) Keep the wording as is
Effort S (zero new work), risk medium. ✅ No change to code or tests already written. ✅ Members skip the round for facts in their own area. ❌ A member that thinks a fact is its own job never asks, the exact gap that sent the Masa question to you.

## Answered: R7a (D5)

Owner chose A and widened the solo exception. Comparison kept for the record.

### R7a comparison
Commitment comparison:

| Commitment | Source/approval or pending | Current | A | B |
|---|---|---|---|---|
| Options on Michael's "When no one fits" ask | hive.ts Michael prompt | Hire a role; hand to the closest member; Michael does it himself this once; drop it | Hire a role; give it to an existing member (role update for recurring work, R7b); drop it | As now, with R7b applied |
| Michael does small things himself (a fact he knows, a short reply, a quick lookup) | hive.ts "Doing it yourself" | Kept | Kept | Kept |
| Michael keeps records when he is alone in the office | P12 (approved) | Kept | Kept | Kept |
| Effort | estimated | n/a | S (human: ~30 min / CC: ~5 min) | S (zero new work) |

Question: D5 — R7a: Should Michael stop offering to do out of role work himself "this once"?
Header: Michael's work
A) Remove the option (recommended)
When nobody's role covers a job, Michael's ask offers only: hire a role, give it to an existing member (with a role update for recurring work), or drop it. Michael still answers small things himself and keeps records when he is alone. Effort S (human: ~30 min / CC: ~5 min), risk low. ✅ Matches your rule that Michael orchestrates and never manages work. ✅ Every job ends up with a member whose role covers it, so the gap gets fixed instead of hidden. ❌ A one off job you would happily let Michael do waits for a member or a hire.
B) Keep the option
Effort S (zero new work), risk medium. ✅ A small one off job gets done today without hiring anyone. ✅ You still choose it on the card, so nothing happens without you. ❌ Michael doing work quietly repeats, and the office never gets the role it is missing.

## Expansion candidates (SELECTIVE EXPANSION)

| # | Candidate | Effort | Risk | Status |
|---|---|---|---|---|
| E1 | Links on Michael's "When no one fits" ask: "Hire" opens Add agent with the role named, "Give it to <member>" opens that member's job in Edit agent, using the existing place links (src/shared/settingsPlaces.ts) | S (human: ~half day / CC: ~20 min) | low | ACCEPTED (D6, 2026-11-07: "Add to scope") |

## Answered: E1 (D6)

Owner added it to scope. Comparison kept for the record.

### E1 comparison
Note: options differ in kind, not coverage — no completeness score.

Question: D6 — E1: Add links on Michael's "nobody's role covers this" card that open Add agent or the member's job directly?
Header: Card links
A) Add to this plan's scope (recommended)
Michael's ask names the role to hire or the member to extend, and each option carries a link that opens the right screen. Effort S (human: ~half day / CC: ~20 min), risk low, reuses the place links already used for mailbox access. ✅ You act on the card in one click instead of hunting for Add agent or Edit agent. ✅ Reuses an existing link mechanism, so nothing new for agents to learn beyond two link forms. ❌ Two more link forms to keep working as those screens change.
B) Defer to TODOS.md
Effort S (zero implementation work now). ✅ Keeps this build to the agent rules only. ✅ Can be added once the role gap cards are seen in real offices. ❌ Until then you find Add agent or Edit agent yourself after reading the card.
C) Skip
Effort S (zero implementation work). ✅ Nothing to build or maintain. ✅ The card text already names the role or member. ❌ Every role gap card costs a few extra clicks, every time.

## Accepted working plan (what gets built)

Spec review 1 (2026-11-07, score 5/10) found gaps; fixes below follow from approved answers unless marked pending.

Terms:
- Worker member: any team member on the roster that is not archived, other than Michael, Research and Michael's prep assistant (isAssistant). The solo office case is "no worker member".
- Covered by a role: the work is within the member's role and Work style as written. Anything beyond that is a role change, which the owner approves (R7b).
- A record's home: the keeper's own work folder (its "YOUR FOLDERS" folder under the business folder), never its hive folder. The keeper, Michael and the owner can open it; other members ask the keeper (hive.ts YOUR FOLDERS lines).
- Two roles covering one record: the role whose core job it is keeps it (owner 2026-11-06: "if later finance is hired then oscar should, and later if sales comes then sales keep it"). When a newly hired role's core job covers a record another member keeps, Michael hands it over and says so in his report. When it is unclear which role's core job it is, Michael asks the owner once with item 5's options.

Agent rules (src/main/hive.ts, with tests in test/ask-teammates-first.test.cjs, test/no-temp-workers.test.cjs and test/business-prompts.test.cjs):
1. R6, member prompt (hive.ts:483): "When work in your scope needs a fact that is not in your own records or mail, ask every teammate whose role could hold it ... all in one round ... Only when none of them has it do you tell Michael ...". Test asserts the new opening and that "is not your own job to know" is gone.
2. R8, member prompt, replacing the paragraph that starts "Do what was asked, at the scope asked" (hive.ts:477): do what was asked when it is within your role; when only part is, do your part and tell Michael what is left and whose role it touches; when none of it is within your role, do none of it and return it to Michael saying why. Work the owner assigned to you, on a "When no one fits" card or by naming you to Michael, counts as within your role for that task; Michael's hand-off says the owner assigned it, and the member prompt accepts that (outside voice O3). Keep "If a request looks mistaken" and the approval sentence. Test asserts the three cases.
3. R1 and P13, member prompt: a member that sees outside feedback about the business (a complaint, praise) or a sighting for a record another role keeps (a new customer, a supplier, a debt) tells Michael, who hands it to the role that the record's "where it lives" foundation answer names (role text only when no answer exists), dropping a report whose item he already handed on (outside voice O6, O7). This covers only outside feedback and sightings for another role's record (P13); every other fact still moves peer to peer as today (P2). Report triggers: for customers, as decided in referenceable decisions 2 and 4 (new customer, first or flipped sentiment, customer left); for every other record kind (a supplier, a debt), the first time a member sees an item not yet reported. Status changes of non customer records are not reported (outside D2's approved scope; eng outside voice E9). Each member keeps what it reported in its own memory (R4). Test asserts the sentence and that it names roles, not people.
4. R2: records follow job roles. A record is kept by the member whose role covers it. When none does, Michael asks the owner with the one option set in item 5. When a record's keeper is archived, the record goes to another member whose role covers it, or the same owner ask. The record moves as text, not as a file (outside voice O1: handOverAttachment carries only saved mail attachments): the old keeper sends the record's rows and history in its hand-over message, the new keeper writes its own files, and the old keeper renames its copy "moved to <role> <date>". For an archived keeper, Michael reads the file from the member's work folder and puts the rows in his hand-off. When the last worker member is archived, Michael takes the records back himself (P12, solo office). A hand-over to a new hire waits for that member's first turn (the app refuses files to a member that has not started, index.ts:8903), and a record that needs a capability the new member does not have yet (P8) stays with its current keeper until the owner turns it on.  How a keeper keeps a record comes from its role and Work style, which only the owner or an owner approved pack Work style update changes (never Michael), plus one generic member rule for record files (a file in your folder, a history file for changed rows, never another member's file). A custom role with no pack Work style line relies on that generic rule; if it needs more, Michael raises item 5's role change for the owner.
5. R7a and R7b, Michael's two "When no one fits" texts (michaelInstructions at hive.ts:412 and NO_FIT_LINE at hive.ts:6526): one option set everywhere: give it to an existing member (for recurring work, a role change the owner makes in Edit agent, where the existing job change review and overlap advice apply), hire a role, or drop it. "Do it yourself this once" is removed. Both texts also drop "too big to do yourself" in favour of "outside every member's role". Test asserts both texts carry the same three options and that the "do it yourself this once" option is gone; the small jobs rule in "Doing it yourself" stays.
6. Solo office branch: when there is no worker member, Michael's prompt replaces "Doing it yourself" ("Research, documents and anything longer go to a team member") and NO_FIT_LINE's "do NOT do it yourself" with: do the work yourself and suggest one hire that would take the most work off you; internet work still goes to Research when it is on, never to Michael. At the first worker hire, Michael hands each record he kept to the member whose role covers it, or asks the owner with item 5's options. The branch is delivered in Michael's hook context with the roster (not the cached system prompt, P11), so it switches on the next turn after the first hire or the last archive. Its text opens with an explicit override: "While no team member works here, this replaces the rules Doing it yourself and When no one fits: ...". When the first worker member is hired, the next roster carries one line: "A team member works here now: the solo rules no longer apply; route work again" (eng outside voice E1), and the test asserts that line. In solo mode Michael does the work his own capabilities allow; work needing mail, a connector or the internet that he has not been given is named to the owner with the hire or the access that would cover it (P8; eng outside voice E2). Test asserts the branch text appears only with no worker member.
7. E1: two new place forms in src/shared/settingsPlaces.ts, `member/<id>/job` (Edit agent opened on the job) and `hire` and `hire/<office role key>` (Add agent opened with the office's pack card for that role picked; a role with no card in the office's pack opens plain Add agent). Michael gets the role keys in NO_FIT_CAST beside each name (hive.ts:6520 builds it from OFFICE_ROLES), so he can write the link (eng outside voice E3). Renderer: App opens Edit agent on the job tab, and Add agent gains an opening card (AddAgentModal). Michael writes them in the ask text, as he does the mailbox link today (option buttons stay plain); placeLinkRule (settingsPlaces.ts:95) gains both forms so Michael learns them. Tests: test/settings-links.test.cjs parses and builds both forms.

Foundations and referenceable customers (S1: in this build), with R2 applied:
8. Referenceable customers decision 1: Marketing's foundation question "Who are our referenceable customers for marketing content" (a 300 character rule answer) and Marketing's `Reference customers.csv` plus history file in its own folder.
9. Referenceable decisions 2 to 4: reporting triggers (new customer, first or flipped sentiment, customer left; open issues are negative), reports to Michael who hands them to the role keeping the record (item 3), Marketing asks Michael when unsure whether a customer may be named, quotes only in the customer's own words.
10. Referenceable decision 6 and foundations decision 6: `current_customers`, the "who owes whom" list and the supplier list are retired; at first start the app tells Michael which lists retired, with their text; Michael hands each to the member whose role covers it, who writes it into its record (one row per item, with source "the owner's foundation answer" and its date), or points it at a connected system that holds it; with no covering member, Michael asks the owner with item 5's options, and in a solo office Michael keeps it. The retired answer stays in foundations.json, marked retired: it leaves members' job sections at once, stays readable in Michael's full document, and its unconfirmed seen items go in the same notice. The keeper confirms with a foundations message `"foundation": {"question": "<id>", "retired": "kept"}`, which the app records with the keeper's id and date (eng outside voice E4).
11. Foundations decisions 1 to 5, split:
  - 11a Rewordings and the four internal kinds (src/shared/foundations.ts, the three locale files): S (human: ~1 day / CC: ~20 min).
  - 11b Connected system as an answer source, accepted only from a member holding that connector (src/main/foundations.ts handle, src/shared/agentAccess.ts): M (human: ~2 days / CC: ~45 min).
  - 11c Connect check before a pointer switches, and the owner confirm card when it replaces an owner answer (member prompt in hive.ts, foundations.ts): M (human: ~2 days / CC: ~45 min).
  - 11d One card on disconnect asking whether the office still uses the system; lapsed login stays a reconnect card (Michael prompt, foundations.ts): S (human: ~1 day / CC: ~30 min).
  - 11e One open card per system for what a read only system is missing (Michael prompt fold rule): S (human: ~half day / CC: ~15 min).
12. Foundations decision 7: the nine records are build order only; each is kept by the role whose job covers it, with the how in that role's Work style (pack Work styles gain the lines through the existing Work style update offers; the owner approves each).
13. New foundation question "Where client work and projects are tracked".

Tests for items 8 to 13: engineering review names them; each item needs at least one test in the existing foundations suites (test/foundations*.test.cjs) or a new file, asserting the reworded text, the retired list copy, the system source grant check, and the disconnect and missing item cards.

Superseded today by this review:
- referenceable-customers decision 5 (best suited member, moved and reported at every hire and archive; most contact fallback): replaced by item 4.
- referenceable-customers "owner's model" and decision 2 phrases "best suited member, decision 5": read as "the member whose role covers it".
- foundations-rules-not-records decision 6 "Keepers follow the standing duty rule" and decision 7 "duty check at every hire and archive" and "one line in the keeper's Work style": replaced by item 4 (roles and Work styles set by the owner).
- foundations-rules-not-records decision 8 (Michael keeps a record only when alone): widened by item 6.
- referenceable-customers decision 2 "Michael routes to whoever the foundation answer names as the list's keeper": Michael routes to the role whose job covers the record (item 4); the foundation answer only says where it lives.
- referenceable-customers decision 6 "with no roster keeper hired yet, the answer stays until one is": replaced by item 10 (owner ask with item 5's options; solo office: Michael keeps it).
- foundations-rules-not-records decision 7 "one line in the keeper's Work style" written by the duty rule: the lines come only from the owner or owner approved pack Work style updates (item 12).

## Agent behavior changes (for the owner, at ship)

| Change | Rule today | Proposed | Who | What the owner sees |
|---|---|---|---|---|
| Ask teammates | Ask only for facts not in records and not your job | Ask every teammate whose role could hold a fact not in your records or mail, then Michael | Every member | Fewer questions on Ask me that a teammate could answer |
| Scope triage | Do what was asked, at the scope asked | In scope: do it; partly: do your part, tell Michael the rest; outside: return it to Michael | Every member | Out of role jobs come back as Michael's "When no one fits" cards |
| Outside feedback and sightings | Stay with whoever received them | Go to Michael, who hands them to the role keeping the record | Every member, Michael | Michael knows every complaint and praise |
| Records follow roles | Not defined | Kept by the member whose role covers it; gaps go to the owner | Every member, Michael | A card to give a record to a member, hire, or drop |
| No fit options | Hire, closest member, Michael this once, drop | Give to an existing member (role change for recurring work), hire, drop; with links | Michael | Cards with links to Add agent and Edit agent |
| Solo office | Michael routes even with nobody to route to | Michael does the work and suggests one hire; hands records over at the first hire | Michael | Work done in a one person office, plus a hire suggestion |
| Reference customers and foundations | As before | As in referenceable decisions 1 to 4 and 6 and foundations decisions 1 to 8, with item 4 | Marketing, Finance, every member, Michael | New and reworded foundation questions; fewer list cards |

## NOT in scope
- A duty register, keeper field or Michael editing Work styles (D3: owner rejected).
- Direct member to member pushes of customer news (D2: owner kept routing through Michael).
- A shared records folder (R3 settled: private folders protect records).
- A fixed catalog of record kinds in code (R5 settled: records follow job foundations).

## Answered: S1 (D7)

Owner chose one build. Comparison kept for the record.

### S1 comparison
Commitment comparison:

| Commitment | Source/approval or pending | Current | A | B | C |
|---|---|---|---|---|---|
| Agent rules, plan items 1 to 7 | approved D2 to D6 | In this build | Build 1 | One build | Build 1 |
| Referenceable customers decisions 1 to 4 and 6 (list file, history file, reporting triggers, retire the customers question) | approved 2026-11-06 | Unplaced | Build 2 | One build | Build 1 |
| Foundations decisions 1 to 8 (rewordings, kinds, system source, connect and disconnect, retire lists, nine records) | approved 2026-11-06 | Unplaced | Build 2 | One build | Build 3 |
| Effort | estimated | n/a | Build 1 S to M (human: ~2 days / CC: ~1 hour); Build 2 L (human: ~1 to 2 weeks / CC: ~4 hours) | XL (human: ~2 to 3 weeks / CC: ~5 hours) | Build 1 M; Build 3 L |

Question: D7 — S1: Ship the agent rules first, and the customer list and foundations redesign as a second build?
Header: Build scope
A) Two builds (recommended)
Build 1: the agent rules from this review (ask teammates, scope triage, news through Michael, records follow roles, Michael's options, solo office, card links). Build 2: referenceable customers and the foundations redesign, with its own engineering review. Effort as in the grid, risk low. ✅ The rules everything else depends on ship and get watched in your office first. ✅ Build 2 starts from rules already proven, so its design questions are smaller. ❌ The customer list and foundation changes wait one more release.
B) One build
Effort XL (human: ~2 to 3 weeks / CC: ~5 hours), risk high. ✅ Everything decided this week lands together. ✅ One round of release notes and behavior changes for you to read. ❌ Over 30 files at once, so a problem in one part holds back the rest.
C) Rules plus customer list now, foundations later
Effort M then L, risk medium. ✅ The customer list you asked about arrives with the rules. ✅ The foundations redesign, the largest part, gets its own review. ❌ The customer list leans on foundation answers (the rule question, the retired customers question), so part of it lands half done.

Documents approved by the owner (D8, 2026-11-07: "Approve and continue").

## Implementation sequence (0I temporal interrogation)

| Hour | What the implementer needs | Ambiguity or surprise to expect |
|---|---|---|
| 1 | The principles table (P1 to P13), the terms (worker member, covered by a role, record home, two roles), and the two older designs as superseded here | The older design docs still read as current in places; this plan wins |
| 2 to 3 | Member prompt edits (items 1 to 3), Michael's two No fit texts and the solo branch in hook context (items 5, 6) | NO_FIT_LINE (hive.ts:6526) names cast members; keep it role only. The solo branch must not touch the cached prefix |
| 4 to 5 | Place links and renderer (item 7), record hand-over as message text (item 4), foundations 11a to 11e and the list retirements (items 10, 11) | handOverAttachment carries only saved mail attachments (attachmentSave.ts:150), so records move as message text, never as files. Retiring "who owes whom" turns off list tools (seen items, Not ours) for it |
| 6+ | Tests per item, the three locale files, Work style update offers for pack roles that keep records (item 12), docs and the behavior changes table | Work style offers are pack scoped (learning pack-workstyle-relays-via-michael); ids like kelly repeat across packs |

Effort: human team ~2 to 3 weeks; CC + gstack ~5 hours.

## Review sections (implementation-ready depth)

Small mechanics below are decided under the owner's standing rule (memory plan-reviews-decide-small-choices, 2026-10-27: "take the recommendation on small mechanics (flags, rollout, test shape); ask only behavior or scope"). Each is marked DECIDED (standing rule).

### Section 1: Architecture

```
                       OWNER (Ask me board, Add agent, Edit agent)
                          ^  links (E1)            ^ role change approvals (R7b)
                          |                        |
   outside feedback  +---------+  hand-off (work)  |
   + sightings ----->| MICHAEL |------------------+------------------+
   (R1, P13)         +---------+                  |                  |
        ^              |  ^  solo branch in hook   v                  v
        |              |  |  context (item 6)  +--------+        +--------+
        |   No fit card|  |                    | Sales  | query  |Support |
        |   (item 5)   |  +---- scope triage --| member |<------>| member |  peer facts (P2)
        |              v       returns (R8)    +--------+ inform +--------+
        |       tasks.json humanQA                 | own folder      | own folder
        |                                          v                 v
        +---- member sees news ---------  Customer roster.csv   Support log.csv
                                          (record home: keeper's work folder;
                                           folder walls in hooks.ts folderCheck)
   Foundations (foundations.json) ---- hook context per job ----> members
     rule answers, "where it lives" pointers, system source (11b) checked against grants
```

Findings:
1. OK. No new store: records are files in members' own work folders, keepers come from role descriptions, the register Michael routes by is the roster he already gets (P6).
2. WARNING (accepted by owner, D2): Michael carries every outside feedback report and sighting, two turns each. Load grows with message volume, not team size. Owner accepted the cost for awareness and safety (P13). Watch item in Section 8.
3. WARNING: scope triage (R8) and "covered by a role" are agent judgment with no app enforcement. That is the design (agents judge, the owner approves role changes); the folder walls are the only hard boundary. Behavior evals would be the guard: TODO proposal in the closing sequence.
4. Coupling: NO_FIT_LINE (hive.ts:6526) and michaelInstructions "When no one fits" duplicate one rule. DECIDED (standing rule): one shared constant for the three options, used by both, so they cannot drift (item 5 test asserts it).
5. Rollback: prompt and catalog changes revert with the release. Retired foundation lists are the one data change. DECIDED (standing rule): a retired answer is never deleted; it stays in foundations.json marked retired with its copy date, so a rollback shows it again.
6. Scaling: 10x members means 10x reports through Michael (finding 2); 100x is outside the product's single office scope. Single point of failure: Michael's session; existing restart and inbox persistence cover it (messages wait in inbox).

### Section 2: Error and rescue map

```
  CODEPATH                         | WHAT CAN GO WRONG                         | CLASS
  ---------------------------------|-------------------------------------------|-----------------------
  Record hand-over (item 4)        | recipient not started (index.ts:8903)     | HandoverNotStarted
                                   | sender folder unknown / file missing      | HandoverNoFile
                                   | archived sender, Michael cannot send      | HandoverNotSender
  Retired list copy (item 10)      | no covering member yet                    | NoKeeper
                                   | keeper folder unwritable                  | KeeperFolderError
  System answer source (11b)       | member lacks the named connector          | SourceNotGranted
                                   | connector name matches nothing            | SourceUnknown
  Disconnect card (11d)            | login lapsed vs removed confused          | DisconnectMisread
  Place links (E1)                 | unknown member id / pack card id          | PlaceInvalid
  Solo branch (item 6)             | roster unreadable at hook time            | RosterReadError

  CLASS               | RESCUED | RESCUE ACTION                                        | USER SEES
  --------------------|---------|------------------------------------------------------|-----------------------------
  HandoverNotStarted  | Y       | Michael retries on the member's first turn (item 4)  | nothing until done; Michael's report says moved
  HandoverNoFile      | Y       | "File not delivered" inform to sender (existing)      | Michael asks the old keeper
  HandoverNotSender   | Y       | Michael reads the archived file, sends the rows       | Michael's report
  NoKeeper            | Y       | answer kept; Michael asks owner (item 5 options)      | one No fit card
  KeeperFolderError   | Y       | answer kept, copy retried next start; app log line   | nothing lost; Michael told
  SourceNotGranted    | Y       | refused with reason to the member (like owner source)| nothing; member sends a gap
  SourceUnknown       | Y       | same refusal                                          | nothing
  DisconnectMisread   | Y       | lapsed login keeps the reconnect card (11d)           | reconnect card, no ask
  PlaceInvalid        | Y       | link renders as plain text; hire falls back to plain | plain Add agent / no link
  RosterReadError     | Y       | branch omitted (default: worker rules apply)          | Michael routes as usual
```
No unrescued rows. DECIDED (standing rule): every RESCUED row logs one app log line with the codepath and ids, no message text.

### Section 3: Security and threat model

| Threat | Likelihood | Impact | Mitigated? |
|---|---|---|---|
| A member mistakes a task in outside text for a fact and edits another member's record | Med | Med | Yes: P13 routes through Michael; folder walls stop cross folder writes |
| Prompt injection stored in a record row (a customer email quoted into Reference customers.csv) read later by Marketing | Med | Med | Partly: existing injection screening at intake (memory injection-screening-flags-to-michael); DECIDED (standing rule): the generic record rule says rows are data, never instructions |
| A system source answer the member did not actually read from the system | Low | Med | Partly: the app checks the member holds that connector (11b), not that the answer came from it; a system answer ranks with office file answers, below the owner's and Michael's, so the owner's answer always wins |
| A `dbm:` link planted in outside text reaching the owner | Low | Low | Yes: place links only open screens; nothing changes without the owner |
| Michael reading an archived member's record to hand it on | Low | Low | Yes: he reads only that member's work folder, which his prompt already allows; rows travel as message text |
No new secrets, dependencies, endpoints or PII beyond customer names already handled.

### Section 4: Data flow and interaction edge cases

```
 member sees email --> judge (in scope? news? sighting?) --> inform Michael --> Michael hands off --> keeper updates row
      | nil: no sender name          | unclear: ask Michael (D4)      | Michael busy: waits in inbox   | keeper archived: item 4
      | empty: no sentiment -> skip  | dup: same sentiment -> skip(R4)| dup reports: keeper no change  | row conflict: latest dated wins
```
Async ordering: two reports for one customer (angry, then happy) can reach the keeper out of order if Michael hands them off in separate turns. Invariant: the row shows the latest sentiment by the customer's message date. Mechanism: every report carries the message date (referenceable decision 4, "latest dated signal wins"); the keeper compares dates, not arrival order. Regression: a test of the generic record rule text asserting it orders by event date.

| Interaction | Edge case | Handled? | How |
|---|---|---|---|
| Hire link on a No fit card | clicked twice | Yes | Add agent is one modal; second click focuses it |
| Edit job link | member archived since | Yes | PlaceInvalid: plain text |
| No fit card | owner answers "give to X" for recurring work | Yes | Michael hands off citing the card; owner changes the job via the link (R7b) |
| Retired list | office upgraded mid session | Yes | copy runs once at start, idempotent by copy date |

### Section 5: Code quality
1. Duplicate No fit text (Section 1 finding 4): one constant.
2. NO_FIT_LINE names cast members (hive.ts:6526, `${NO_FIT_CAST}`) to suggest hires. That is Michael's hiring suggestion, not job text, so the no names rule does not apply; kept.
3. The generic record rule must live once in the member prompt, not per record kind (R5).
No over-engineering found: no new store, no new service.

### Section 6: Test review

```
 NEW THING                          | TYPE  | HAPPY                              | FAILURE                         | EDGE
 -----------------------------------|-------|------------------------------------|---------------------------------|-------------------------
 R6 ask teammates sentence          | unit  | new opening present                | old AND clause absent           | no names (Kelly, Ryan)
 R8 scope triage                    | unit  | three cases present                | No fit hand-off exemption       | approval sentence kept
 R1/P13 feedback via Michael        | unit  | sentence present, roles only       | peer inform rule unchanged      |
 Item 5 shared No fit options       | unit  | both texts carry 3 options         | "this once" option gone         | small jobs rule kept
 Item 6 solo branch                 | unit  | present with no worker             | absent with one worker          | Research and assistant not workers
 Item 4 hand-over                   | unit  | rows sent as message text          | not started -> retry message    | archived keeper: Michael sends rows
 E1 place forms                     | unit  | parse/build member/<id>/job, hire  | invalid id -> null              | hire without card
 10 retired list copy               | unit  | rows written, answer kept retired  | no keeper -> answer kept + card | rerun idempotent
 11a to 11e foundations             | unit  | per eng review                     | grant refusal (11b)             | lapsed login (11d)
```
no_claim: these are static prompt and unit tests; a green run does not prove agents follow the rules (no behavior eval exists). Test ambition: the 2am test is a replay of the Masa case and a refund case through a member session; that is the TODO proposal below.

### Section 7: Performance
1. Michael turns per report (Section 1 finding 2): accepted.
2. R4 memory growth: what a member reported is kept as ordinary memory notes through the existing memory flow (inbox.md, tidied into topic files), not a new file convention (eng outside voice E8); Michael's dedupe (O7) catches what a member forgets.
3. Foundations sections shrink (pointers instead of lists), cutting the re-sent hook context per change.

### Section 8: Observability
DECIDED (standing rule): app log lines for hand-over outcomes, retired list copies, system source refusals and solo branch on/off. The owner already sees: Michael's reports (hand-overs), No fit cards, disconnect cards. Watch metric for finding 2: count of feedback and sighting messages to Michael per day in the app log, reviewed at the next CEO review.

### Section 9: Deployment and rollout
- Prompt changes take effect when each session restarts (cached prefix); the solo branch rides hook context and switches next turn.
- Existing offices: pack Work style lines arrive as Work style update offers (pack scoped), owner approved.
- Foundations: rewordings need no re-ask (decision 1); retired lists copy once at first start, idempotent, originals kept (Section 1 finding 5).
- Windows ships with the release (memory windows-ships-every-release); nothing here is platform specific except file paths, covered by existing path helpers.
- Rollback: install the previous release; retired answers reappear; record files stay as harmless files.
- Post deploy check: in the reference office, one No fit card shows links; one retired list copied with the original kept; Michael's roster shows the solo branch off.

### Section 10: Long term trajectory
- Reversibility: 4/5 (prompt text and catalog reversible; retired lists kept).
- Debt: agent judgment for scope with no behavior eval (testing debt); per member memory dedupe (R4).
- Path dependency: records as files in member folders keep a later connector (CRM) swap simple: decision 2's check switches the pointer.
- Phase 2: behavior evals for orchestration rules; a records overview only if the owner asks (less verbose UI rule).
- Retrospective on cherry-picks: E1 is the only accepted one and integrates through existing place links. Rejected R1/R2 alternatives are not load bearing for anything accepted.

### Section 11: Design and UX
UI scope is small: two place links (E1), Add agent opening with a card, reworded foundation questions. Interaction states: link valid (opens), invalid (plain text), hire without card (plain Add agent). No new screen; DESIGN.md unaffected; less verbose UI rule kept (no new visible text beyond the card's existing ask). No issues found beyond Section 4's handled cases.

### Outside voice (native fallback; Codex not used under the owner's rule that Codex is only for the adversarial pass)

OUTSIDE VOICE (Claude subagent): 11 findings (1 Critical, 4 High, 4 Medium, 2 Low); recommendation: focused revision before engineering review. Checked against code:

| # | Finding | Verified | Disposition |
|---|---|---|---|
| O1 | Critical: record hand-over cannot use handOverAttachment, which takes only files the app saved from mail into the sender's Email attachments folder, copies and quarantines them (attachmentSave.ts:150) | Yes | Fixed (standing rule, mechanic): no file transport. The old keeper sends the record's rows and history in its hand-over message; the new keeper writes its own files; the old keeper renames its copy "moved to <role> <date>". For an archived keeper, Michael reads the file (he may read member work folders) and puts the rows in his hand-off. Items 4, 6 and 10 updated; the "app moves the file" fallback is dropped, so no new app capability |
| O2 | High: retired list copy needs a keeper the app cannot know | Yes | Fixed (follows R2): at first start the app tells Michael which lists retired, with their text; Michael hands each to the member whose role covers it (or a No fit card; solo: he keeps it). The answer stays retired but kept until the keeper confirms. Columns follow the generic record rule (one row per item, its source and date) |
| O3 | High: R8 returns work the owner assigned by name (hive.ts:406 "when the owner names someone, send the work to them") | Yes | Fixed (follows D4: owner assignment is the approval): the R8 exemption covers any work the owner assigned to that member, by a No fit card or by naming them; Michael's hand-off says so |
| O4 | High: solo branch lost after compaction | Partly: Claude Code fires SessionStart after compaction, which resends the full roster (hooks.ts:960), so the branch returns | Kept in hook context; test asserts the branch is in the SessionStart roster |
| O5 | High: orchestratorMaySpawn path (hive.ts:2426, 2507) gives Michael "SPAWNING A WORKER" instead of NO_FIT_LINE | Yes (setting off by default, config.ts:589) | Noted: the spawn setting is the owner's own switch and untouched; item 5 applies wherever NO_FIT_LINE applies; spawned workers count as worker members |
| O6 | Medium: Michael re-derives the keeper from role text each time | Yes | Fixed (follows foundations decision 1): Michael routes by the record's "where it lives" foundation answer, which names the keeping role; role text only when no answer exists |
| O7 | Medium: N members report the same sighting | Yes | Fixed (standing rule, mechanic): Michael drops a report whose item he already handed to the keeper (his existing fold rule) |
| O8 | Medium: folder walls cover file tools; shell writes rely on the sandbox | Unverified here | Engineering review must confirm the sandbox blocks shell writes into another member's work folder before P13 is called enforced |
| O9 | Medium: no behavior check before an XL launch | Yes (no_claim in Section 6) | Owner decision D9 below |
| O10 | Low: hire link ids repeat across packs | Yes | Fixed: `hire/<office role key>` resolved against the office's own pack (eng E3 replaced the pack/card form Michael could not write) |
| O11 | Low: review 3 fixes not re-verified | Yes | Noted in the CEO summary; engineering review re-reads the plan |

## Answered: T1 (D9)

Owner chose the ship gate. Accepted scope item 14: before ship, replay the Masa case, a refund case and one out of role task through member sessions in a test office; each must show the expected asks and returns. Comparison kept for the record.

### T1 comparison
Note: options differ in kind, not coverage — no completeness score.

Question: D9 — T1: Make a behavior replay (the Masa case and a refund case run through real member sessions) a condition for shipping this build?
Header: Behavior check
A) Ship gate (recommended)
Before ship, replay two recorded cases through member sessions in a test office: Marketing asking about a past client (should ask every role that could know, then Michael) and Support getting a refund question (should ask Finance and Sales, then Michael), plus one out of role task (should come back to Michael). Effort M (human: ~2 days / CC: ~1 hour), risk low. ✅ Proves the rules change what agents do, which string tests cannot. ✅ Catches prompt conflicts like the ones the outside review found before your office runs them. ❌ Costs real model runs each time it is run and adds a step to /ship.
B) TODO for later
Effort S (zero implementation work now). ✅ This build ships sooner. ✅ The replay can be designed after seeing the rules in your office. ❌ Rules ship checked only by string tests; a wrong behavior shows up in your office first.
C) Skip
Effort S (zero work). ✅ Nothing to build or run. ✅ Your office is the live check. ❌ No repeatable proof; the next prompt change can quietly undo these rules.

Approval readiness: PASS. Checked rows: R1 (D2), R2 (D3), R3, R4, R5 (settled, no question: follow from D2 and D3), R6 and R8 and R7b (D4), R7a (D5), E1 (D6), S1 (D7), documents (D8), T1 (D9); small mechanics under the owner's standing rule (memory plan-reviews-decide-small-choices); outside voice fixes O1, O2, O3, O6, O7, O10 follow from D3, D4 and foundations decision 1 or the standing rule.

## What already exists (reused)
- Peer query and inform protocol and the request to Michael redirect (hive.ts:6726).
- Michael's "When no one fits" rule and NO_FIT_LINE (hive.ts:412, 6526): reworded, not rebuilt.
- Folder walls for file tools (hooks.ts:1316 folderCheck) and members' own work folders.
- Roster delivery in hook context, resent at SessionStart including after compaction (hooks.ts:960).
- Place links and placeLinkRule (settingsPlaces.ts:95), already used for mailbox access.
- Company foundations: questions, sources, owner wins, list tools (src/shared/foundations.ts, src/main/foundations.ts).
- Work style update offers, pack scoped (src/shared/workStyleUpdates.ts).
- Edit agent job change review with overlap advice; Add agent prefill.

## Dream state delta
12 month ideal: every piece of work and every record sits with the role whose job it is, Michael only routes, asks and surfaces, gaps in the team end as one click owner decisions, and foundations hold only rules and where things live. This plan delivers the rules and the foundations shape. Still missing after it: behavior evals beyond the three replay cases, connector driven pointers for systems beyond the first few, and measurement of Michael's load (Section 8 watch metric).

## Error and rescue registry
See Section 2: 10 codepath rows, 10 rescued, 0 critical gaps. Item 4's transport changed to message text (O1), which removes HandoverNotStarted's file path and HandoverNotSender; their rows now read: "keeper not started: Michael retries the hand-off on its first turn" and "archived keeper: Michael reads the file and sends the rows".

## Failure modes registry
```
  CODEPATH                 | FAILURE MODE                         | RESCUED? | TEST? | USER SEES?               | LOGGED?
  -------------------------|--------------------------------------|----------|-------|--------------------------|--------
  Record hand-over         | new keeper not started               | Y        | Y     | Michael's report, later  | Y
  Record hand-over         | archived keeper                      | Y        | Y     | Michael's report         | Y
  Retired list hand-off    | no covering member                   | Y        | Y     | one No fit card          | Y
  System answer source     | member lacks the connector           | Y        | Y     | nothing (gap instead)    | Y
  Disconnect card          | lapsed login read as removal         | Y        | Y     | reconnect card           | Y
  Place links              | invalid id or card                   | Y        | Y     | plain text / plain hire  | Y
  Solo branch              | roster unreadable                    | Y        | Y     | Michael routes as usual  | Y
  Scope triage (R8)        | agent misjudges its scope            | N/A      | Y (replay, T1) | No fit card or a returned task | Michael's report
  Feedback via Michael     | Michael overloaded                   | Y (inbox waits) | N | slower hand-offs   | Y (watch metric)
  Shell write into a peer folder | sandbox does not block         | unknown  | N     | silent                   | N  <- eng review verifies (O8)
```
The last row is an unknown, not a confirmed gap: engineering review owns the check before P13 is called enforced.

## Scope expansion decisions
- Accepted: E1 role gap card links (D6); T1 behavior replay ship gate (D9, from the outside voice).
- Deferred: none.
- Skipped: none.
CEO plan: /Users/moblizeit/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-11-07-office-architecture-review.md

## Diagrams
Produced: system architecture (Section 1), data flow with shadow paths (Section 4), error flow (Section 2). State machine: the only new state is a retired foundation answer (live -> retired kept -> confirmed by keeper; never deleted). Deployment and rollback: Section 9 (install release; rollback installs the previous release, retired answers reappear).

## Stale diagram audit
hive.ts and foundations.ts carry no ASCII diagrams on the touched paths; src/main/foundations.ts's header tree (lines 5 to 14) describes answer sources and gains "a connected system" under 11b. 1 stale diagram to update.

## Reality rows
REALITY: premise-table finding 8 claims with receipts, unverified=1 (sandbox blocks shell writes, O8) src/main/hooks.ts:1316
REALITY: already-done pass no commit on origin/main since 2026-11-05 implements this plan (hits are the shipped 0.3.6 fixes) src/main/hive.ts:483
REALITY: surface-check pass no new CLI or route; two new place forms are planned, not claimed to exist src/shared/settingsPlaces.ts:65
REALITY: binding-decisions pass branch decisions read; none contradicted (Ask me card decisions are separate scope) docs/designs/office-architecture-review.md:1
REALITY: numbers pass every effort and load figure tagged estimated; none measured docs/designs/office-architecture-review.md:1
REALITY: deferred-asks pass no linked issue docs/designs/office-architecture-review.md:1
REALITY: pr-count pass no ship policy; default one PR per wave, one build (D7) docs/designs/office-architecture-review.md:1

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship. Ratios: prompt features ~30x, tests ~50x, architecture ~5x.

- [ ] **T1 (P1, human: ~1 day / CC: ~20min)** — member prompt — ask teammates (R6), scope triage with owner assigned exemption (R8, O3), feedback and sightings via Michael routed by the foundation pointer (R1, O6)
  - Surfaced by: Section 1 and D4; outside voice O3, O6
  - Files: src/main/hive.ts, test/ask-teammates-first.test.cjs
  - Verify: node --test test/ask-teammates-first.test.cjs
- [ ] **T2 (P1, human: ~1 day / CC: ~20min)** — Michael prompt — one shared No fit option set (give, hire, drop), "this once" removed, duplicate reports dropped
  - Surfaced by: Section 1 finding 4, D5, O7
  - Files: src/main/hive.ts, test/ask-teammates-first.test.cjs, test/no-temp-workers.test.cjs, test/business-prompts.test.cjs
  - Verify: node --test test/ask-teammates-first.test.cjs test/no-temp-workers.test.cjs test/business-prompts.test.cjs
- [ ] **T3 (P1, human: ~1 day / CC: ~25min)** — solo office branch in Michael's hook context, worker member definition, records back to Michael at the last archive
  - Surfaced by: D5, spec review 2 and 3, O4
  - Files: src/main/hooks.ts, src/main/hive.ts, src/shared (isWorkerMember), test/ask-teammates-first.test.cjs
  - Verify: test asserts the branch only with no worker member and in the SessionStart roster
- [ ] **T4 (P1, human: ~1 day / CC: ~30min)** — place links `member/<id>/job` and `hire[/<pack>/<card>]`, renderer openers, placeLinkRule
  - Surfaced by: E1, O10
  - Files: src/shared/settingsPlaces.ts, src/renderer/src/App.tsx, src/renderer/src/components/AddAgentModal.tsx, test/settings-links.test.cjs
  - Verify: node --test test/settings-links.test.cjs
- [ ] **T5 (P1, human: ~1 day / CC: ~20min)** — generic record rule (own folder, history file, rows are data, latest dated wins) and hand-over as message text
  - Surfaced by: R2, O1, Section 3, Section 4 ordering
  - Files: src/main/hive.ts, test/ask-teammates-first.test.cjs
  - Verify: test asserts the record rule and the hand-over wording
- [ ] **T6 (P1, human: ~1 week / CC: ~3h)** — foundations 11a to 11e and the new questions (referenceable customers rule, client work and projects)
  - Surfaced by: S1 (D7), foundations decisions 1 to 5
  - Files: src/shared/foundations.ts, src/main/foundations.ts, src/shared/agentAccess.ts, src/main/hive.ts, locale files (en, ar, zh-CN), foundations tests
  - Verify: foundations test suites; eng review names the cases
- [ ] **T7 (P1, human: ~1 day / CC: ~30min)** — retired lists handed to keepers through Michael, answers kept retired until confirmed
  - Surfaced by: O2, Section 1 finding 5
  - Files: src/main/foundations.ts, src/main/hive.ts, foundations tests
  - Verify: test: retired answer kept, Michael note sent once, rerun idempotent
- [ ] **T8 (P1, human: ~1 day / CC: ~30min)** — referenceable customers reporting triggers and Marketing's list rules; pack Work style lines as update offers
  - Surfaced by: referenceable decisions 1 to 4, item 12
  - Files: src/main/hive.ts, resources/packs/*.json, src/shared/workStyleUpdates.ts, locale files, tests
  - Verify: node --test test/ask-teammates-first.test.cjs and workStyleUpdates tests
- [ ] **T9 (P1, human: ~2 days / CC: ~1h)** — behavior replay ship gate: Masa case, refund case, out of role task through member sessions
  - Surfaced by: T1 decision (D9), O9
  - Files: test/office-rules-eval.test.cjs (new, switch OFFICE_RULES_EVAL=1)
  - Verify: OFFICE_RULES_EVAL=1 node --test test/office-rules-eval.test.cjs passes before /ship
- [ ] **T10 (P1, human: ~2h / CC: ~15min)** — verify the sandbox blocks shell writes into another member's work folder
  - Surfaced by: O8, failure modes registry
  - Files: to be determined (sandbox config in src/main)
  - Verify: a member shell write into a peer folder is refused in a test office
- [ ] **T13 (P1, human: ~2 days / CC: ~40min)** — Windows shell wall: hook refuses shell commands naming another member's folder
  - Surfaced by: eng outside voice E7; eng D2 (R3w)
  - Files: src/main/hooks.ts, src/shared/folderAccess.ts, test/ (new or extended folder access test)
  - Verify: test with Windows path spellings refuses peer folders and allows the member's own
- [ ] **T11 (P2, human: ~2h / CC: ~15min)** — app log lines for hand-overs, retired list copies, source refusals, solo branch; feedback count watch metric
  - Surfaced by: Section 2 and Section 8
  - Files: src/main/hive.ts, src/main/foundations.ts
  - Verify: log lines appear in a test office run
- [ ] **T12 (P2, human: ~2h / CC: ~15min)** — docs: FEATURES, behavior changes table, foundations.ts header diagram
  - Surfaced by: Stale diagram audit, behavior changes section
  - Files: docs/FEATURES.md, src/main/foundations.ts
  - Verify: docs read back

## Completion Summary
```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | Michael routes facts and work; records had  |
  |                      | no home; two No fit texts; hand-over is     |
  |                      | mail-attachment only                        |
  | Step 0               | D1 mode; D2 to D7 decisions; D8 docs        |
  | Section 1  (Arch)    | 6 issues found                              |
  | Section 2  (Errors)  | 10 error paths mapped, 0 GAPS               |
  | Section 3  (Security)| 5 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 9 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 3 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 1 gap (behavior, now T9)  |
  | Section 7  (Perf)    | 3 issues found                              |
  | Section 8  (Observ)  | 1 gap found                                 |
  | Section 9  (Deploy)  | 2 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 2           |
  | Section 11 (Design)  | 0 issues                                    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 10 rows, 0 CRITICAL GAPS                    |
  | Failure modes        | 10 total, 0 CRITICAL GAPS (1 unknown, T10)  |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 2 proposed, 2 accepted (E1, T1)             |
  | CEO plan             | written                                     |
  | Outside voice        | codex unavailable (owner rule); native      |
  |                      | fallback completed, 11 findings             |
  | Lake Score           | 1/1 recommendations chose complete option   |
  | Diagrams produced    | 3 (architecture, data flow, error flow)     |
  | Stale diagrams found | 1                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 1 unverified       |
  +====================================================================+
```

### Unresolved Decisions
None.

## Engineering review (2026-11-07)

Target: docs/designs/office-architecture-review.md (this plan, CEO cleared). Report file: this file.

### Scope Challenge
Scope record: feature answers: none proposed (owner fixed scope in CEO D2 to D9); structure: B Smaller arrangement (eng D1, 2026-11-07); accepted scope: all 12 tasks as planned, with the behavior replay as a switch gated eval test following test/memory-conflict-eval.test.cjs (claude -p with the real member and Michael prompts, run before ship) and Michael's No fit checks in test/ask-teammates-first.test.cjs (no new test/michael-no-fit.test.cjs, no replay harness module); pending remedies: none.
Result: scope accepted as-is.

Findings:
1. [INFORMATIONAL] (confidence: 9/10) src/main/hive.ts:2079 — O8 resolved by reading the sandbox: `allowWrite: shellWrite ?? writableDirs`, where sandboxWritableDirs returns `[dir, root, ...extra]` (hive.ts:1978 to 1983), so on macOS and Linux a member's shell cannot write another member's work folder; on Windows there is no shell sandbox (hive.ts:2071 "Not on Windows: no sandbox there (#187)"), so only file tools are walled. Factual correction to P13 and Section 3: enforced on macOS and Linux; Windows shell writes are a known platform limit. Also: every member's shell may write the hive root, which holds other members' hive folders (learning agent-sandbox-read-open); records live in work folders, so this does not touch them. Disposition: correction recorded, no remedy question (existing platform limit, outside this plan).

### 1. Architecture

Design twice: the plan adds no new module, service or public surface (smaller arrangement, D1): every change lands in existing prompt builders, hooks, the place link module and foundations. Second shape not needed.

```
 registry.json ──> isWorkerMember(agent) [one predicate, src/shared]
      │                    │                         │
      v                    v                         v
 hooks.ts roster ──> solo branch text        hive.ts michaelInstructions / NO_FIT_LINE
 (SessionStart,      (Michael only,          (business office / legacy office)
  layout change)      no worker member)             │
                                                    v
                                          NO_FIT_OPTIONS (one constant:
                                          give to a member, hire, drop)
                                                    │
                                     placeLinkRule ─┴─> member/<id>/job, hire[/<pack>/<card>]
 foundations.ts ── toMichael("List retired", text) ──> Michael hands to covering role
 foundations.ts handle(source: system) ── grant check (agentAccess) ──> accept / refuse
```

Findings:
1. [INFORMATIONAL] (confidence: 9/10) src/main/hive.ts:2507 — `meta.isGod && !this.orchestratorMaySpawn() ? NO_FIT_LINE : ''` sits in the legacy (no business folder) prompt; business offices get "## When no one fits" from michaelInstructions. Item 5 must change both and item 6's solo branch must reach both office kinds. Disposition: carried by the approved items (D5); mechanic: both read NO_FIT_OPTIONS.
2. [INFORMATIONAL] (confidence: 8/10) src/main/hive.ts:1978 — `if (meta.isResearch) return ...` shows worker status is decided ad hoc in several places (isResearch, isAssistant, isGod, archived). "Worker member" (plan Terms) is needed by hooks (solo branch) and hive (first hire, last archive). Disposition: DECIDED (standing rule, mechanic): one predicate `isWorkerMember` in src/shared, used by both; red flag 6 (two ways to do one task) avoided.
3. [INFORMATIONAL] (confidence: 9/10) src/main/hive.ts:2079 — sandbox scope (Scope Challenge finding 1): records are protected on macOS and Linux only. Disposition: correction recorded.
4. [INFORMATIONAL] (confidence: 8/10) src/main/foundations.ts:400 — `this.toMichael('Foundation list past its shelf life', ...)` is the existing channel for foundation notices to Michael; item 10's retired list notice reuses it with the list text. Disposition: reuse, no new channel.
Realistic production failure per new path: retired list notice sent while Michael is mid task (it waits in his inbox, existing); hire link to a pack card removed in a later release (PlaceInvalid falls back to plain Add agent); solo branch after the only member is archived mid turn (switches at the next hook delivery). All handled in Section 2 of the CEO review.
Distribution: no new artifact; ships in the Mac and Windows builds as today.
Dispositions: findings 1 to 4 accepted as recorded (mechanics under the standing rule or approved D5).

### 2. Code quality

1. [INFORMATIONAL] (confidence: 9/10) src/shared/settingsPlaces.ts:95 — `placeLinkRule()` derives the sections list from PLACE_SECTIONS and hand-writes the member place inside the same function (settingsPlaces.ts:101). Adding `member/<id>/job` and `hire` by hand repeats red flag 8 (hand-synced list). Disposition: DECIDED (standing rule): placeLinkRule names every non-settings place form from one list beside the parser, and test/settings-links.test.cjs asserts parse(build(x)) round trips for each.
2. [INFORMATIONAL] (confidence: 9/10) test/no-temp-workers.test.cjs:57 — `for (const option of ['add a team member', 'hand it to the closest team member', 'you do it yourself this once', 'or drop it'])` and test/business-prompts.test.cjs:89 pin the old options. Approved D5 changes them; these tests change with it (intended difference, not a regression). Disposition: carried by D5.
3. [INFORMATIONAL] (confidence: 7/10) src/main/hive.ts:483 — the member rules paragraph is already one long template string; items 1, 2, 3 and 5 of the plan add to it. Keep each rule its own sentence group so tests can slice them, as test/ask-teammates-first.test.cjs:42 already slices by function. Disposition: accepted as implementation guidance.
No shared code extraction beyond NO_FIT_OPTIONS and isWorkerMember (two proven callers each).

### 3. Tests

Framework: node --test via tools/run-tests.cjs (package.json "test"); eval tests are switch gated (test/memory-conflict-eval.test.cjs, test/overlap-split-eval.test.cjs).

```
CODE PATHS                                              USER FLOWS
[+] hive.ts teamMemberInstructions                      [+] Owner answers a No fit card
  ├── [★★ TESTED] ask teammates sweep (ask-teammates-first:39) ├── [GAP] hire link opens Add agent with card
  ├── [GAP] R6 new opening, AND clause gone              ├── [GAP] job link opens Edit agent on job
  ├── [GAP] R8 three scope cases + owner assigned        └── [GAP] invalid id renders plain text
  ├── [GAP] P13 feedback and sightings via Michael     [+] Office goes solo / first hire
  └── [GAP] record rule (rows are data, dated wins)       ├── [GAP] solo branch present, then gone at first hire
[+] hive.ts michaelInstructions + NO_FIT_LINE            └── [GAP] records handed back at last archive
  ├── [★★ TESTED] old options (no-temp-workers:57) -> changes with D5
  ├── [GAP] NO_FIT_OPTIONS in both, "this once" gone, small jobs kept
  └── [GAP] solo override text only with no worker
[+] hooks.ts roster                                    LLM: [GAP] [→EVAL] member and Michael prompts:
  └── [GAP] solo branch in SessionStart roster            Masa case, refund case, out of role task (T9)
[+] settingsPlaces.ts
  └── [GAP] member/<id>/job, hire, hire/<pack>/<card> round trip; placeLinkRule lists them
[+] foundations.ts
  ├── [★★★ TESTED] list tools, owner wins (foundations.test.cjs)
  ├── [GAP] rewordings; retired lists kept and noticed once (idempotent)
  ├── [GAP] system source accepted only with grant; refused otherwise
  └── [GAP] disconnect ask vs lapsed login
COVERAGE: 2/19 paths tested  |  QUALITY: ★★★:1 ★★:1  |  GAPS: 17 (1 eval)
```

Required tests (proof of approved behavior, carried without asking):
- test/ask-teammates-first.test.cjs (extend): R6 opening and absent AND clause; R8 three cases and the owner assigned exemption; P13 sentence naming roles; record rule; NO_FIT_OPTIONS in both texts, "this once" absent, small jobs rule present; solo branch only with no worker member and present in a SessionStart roster. Value: protects=member and Michael rules as approved; fails_when=a sentence is reworded or dropped; why_new=only the sweep is covered; seam=none; no_claim=agents following the text (string checks only).
- test/no-temp-workers.test.cjs and test/business-prompts.test.cjs (update): the three option set replaces four. Value: protects=No fit options; fails_when=the old option returns; why_new=intended change of pinned text; seam=none; no_claim=none beyond protects.
- test/settings-links.test.cjs (extend): parse and build for the new forms, invalid ids return null, placeLinkRule lists them. Value: protects=card links; fails_when=a form stops parsing or drops from the rule; why_new=only email and settings forms covered; seam=none; no_claim=renderer opening the screen.
- test/foundations.test.cjs (extend): rewordings with no re-ask; retired answer kept and one notice; system source refused without grant; disconnect ask and lapsed login. Value: protects=foundations decisions 1 to 6; fails_when=a retired answer is deleted or a sourceless system answer is accepted; why_new=new behavior; seam=none; no_claim=a real connector's data.
- test/office-rules-eval.test.cjs (new, switch OFFICE_RULES_EVAL=1, claude -p, like memory-conflict-eval): each case rebuilds the hook context the app sends (roster with role descriptions, the job's foundations section) beside the real member or Michael prompt, plus the inbox message and a stated fact ("your records and mail hold nothing about this client"); the model answers with the JSON of its next outbox messages; assertions are on that JSON (recipients and act), one turn at a time; each case runs 3 times and passes on 3 of 3. Cases: Masa (query to every role that could know, not Michael first), refund (query Finance and Sales), out of role task (message to Michael, no work done). DECIDED (standing rule, test shape; eng outside voice E5). Value: protects=agents act on the rules; fails_when=a prompt change makes a member skip a role or keep out of role work; why_new=no behavior check exists; seam=none; no_claim=the app's live hooks and tools (print mode with no tools).
Tests made obsolete: none removed; two updated (above).
Regression contracts carried from approved answers: the small jobs rule ("Doing it yourself") stays (CEO item 5); every other fact still moves peer to peer (CEO item 3, P2); owner answers win (foundations decisions); remaining list questions keep their list tools.

### 4. Performance

1. [INFORMATIONAL] (confidence: 7/10) src/main/hooks.ts:960 — the full roster is resent at SessionStart and on layout change; the solo branch adds a few hundred characters only while no worker exists. Scale: one line per Michael session start. No issue.
2. [INFORMATIONAL] (confidence: 6/10) Medium confidence, verify: Michael turns per outside feedback report (CEO Section 1 finding 2) scale with message volume; unknown volume in real offices. Watch metric (T11) measures it. Disposition: accepted by owner D2.
3. [INFORMATIONAL] (confidence: 8/10) test/office-rules-eval.test.cjs — three model calls per run, gated off by default like the other evals, run before ship. Scale: 3 calls per ship.
No N+1, unbounded caches or blocking calls added.

Dispositions (Sections 1 to 4): all findings accepted as recorded; no new owner choices (mechanics under the standing rule, behavior carried from CEO answers D2 to D9 and eng D1).

### Outside voice (eng; native fallback, Codex not used under the owner's rule)

OUTSIDE VOICE (Claude subagent): 12 findings (5 High, 5 Medium, 2 Low); recommendation: revise before building. Dispositions:

| # | Finding | Disposition |
|---|---|---|
| E1 | High: no signal that solo rules end at the first hire | Fixed (mechanic): a revocation line in the next roster, tested |
| E2 | High: solo Michael lacks mail, connectors, internet by default | Fixed (follows P8): solo Michael does what his capabilities allow and names the hire or access for the rest |
| E3 | High: Michael cannot write pack and card ids | Fixed (mechanic, keeps E1's approved "role named"): `hire/<office role key>`, keys added to NO_FIT_CAST |
| E4 | High: no keeper confirm for retired lists | Fixed (mechanic): confirm message recorded by the app; retired answers leave job sections at once; seen items go in the notice |
| E5 | High: print mode eval cannot exercise the rules | Fixed (standing rule, test shape): rebuilt hook context, stated facts, JSON next messages, one turn per assertion, 3 of 3 runs |
| E6 | Medium: stale text from before O1 and D1 | Fixed: hour 4 to 5, Section 2 and 3 rows, test diagram, T2, T3, T9 |
| E7 | Medium: owner not asked about the Windows sandbox gap | Owner decision D2 below (reopens R3) |
| E8 | Medium: R4 duplicates Michael's dedupe | Partly: R4 is the owner's own rule (members skip a repeated sentiment), kept; the separate reported.md convention dropped for ordinary memory notes |
| E9 | Medium: status change triggers exceed D2's scope | Fixed: status changes of non customer records removed |
| E10 | Medium: system source is self reported | Corrected: threat row says partly; system answers rank with office file answers |
| E11 | Low: wrong location for the hand-written member place | Corrected |
| E12 | Low: owner assigned exemption trusts Michael's hand-off | Noted: accepted design (P1) |

## Decision ledger (eng)

### R3w: protecting records from shell writes on Windows
Finding: E7, Medium, confidence 9/10, src/main/hive.ts:2071 ("Not on Windows: no sandbox there (#187)"), eng outside voice
Plan baseline: R3 settled with no question on "folder walls protect records" (CEO review); P13 cites folder walls as enforcement.
Runtime evidence: macOS and Linux shell writes limited to the member's own folders (hive.ts:2079 allowWrite); Windows has no shell sandbox, only file tool walls (hooks.ts:1316).
Comparison grid:

| Commitment | Current | A | B | C | D |
|---|---|---|---|---|---|
| Windows shell writes into another member's folder | Possible | A Bash hook check refuses commands that name another member's folder | Possible; documented as a known Windows limit until a Windows sandbox exists (#187) | Unchanged until a bounded check of how often members' shell commands touch other folders | Unchanged; decision deferred |
| macOS and Linux | Blocked by sandbox | Unchanged | Unchanged | Unchanged | Unchanged |
| P13 routing through Michael | Approved D2 | Unchanged | Unchanged | Unchanged | Unchanged |
| Effort | n/a | M (human: ~2 days / CC: ~40 min) | S (human: ~1 hour / CC: ~5 min, docs only) | S (human: ~half day / CC: ~20 min) | S (zero) |

Question D2:
D2 — R3w: On Windows, should the app add a check that stops a member's shell commands from writing into another member's folder? <gstack-qid:plan-eng-review-windows-shell-walls>
Header: Windows walls
A) Apply this change
A PreToolUse check on Windows refuses a shell command whose text names another member's folder. Effort M (human: ~2 days / CC: ~40 min), risk medium. ✅ Closes the obvious path on Windows, where the app has no shell sandbox today. ✅ Uses the hook that already guards file tools, so no new mechanism. ❌ Text matching is easy to get around (a variable, a relative path), so it can give a false sense of safety.
B) Keep this row's current value (recommended)
Document it as a known Windows limit: records are protected by the file tool walls and by routing changes through Michael, and the shell gap closes when Windows gets a sandbox (#187). Effort S (human: ~1 hour / CC: ~5 min), risk low. ✅ Honest about the limit without a check that can be walked around. ✅ The gap is not new: it applies to everything on Windows today, not just records. ❌ A member on Windows could still write another member's record by shell command.
C) Investigate before choosing
Bounded: read one week of a Windows test office's member shell commands for any that touch another member's folder, then come back with A or B. Effort S (human: ~half day / CC: ~20 min), risk low. ✅ Decides on evidence of how members actually use the shell. ✅ No code until the answer is known. ❌ Needs a Windows office with real activity, which may not exist yet.
D) Defer this proposed change only
Leaves this row unresolved; nothing changes now. Effort S (zero). ✅ Keeps this build to the approved scope. ✅ Can come back with the next Windows sandbox work. ❌ The plan's safety claim stays unresolved in the report.

State: approved
Actual answer: A) Apply this change (eng D2 answer 2026-11-07: "Apply this change")
Accepted scope: on Windows only, the PreToolUse hook refuses a Bash (shell) command whose text names another member's work folder or hive folder, with a reason the member can act on; macOS and Linux keep the sandbox; a regression test with Windows path spellings (backslash, forward slash, quoted, relative from the business folder) asserts refusal, and that a command naming only the member's own folder passes. Known limit kept in docs: text matching can be walked around (variables), so the check narrows, not closes, the gap until #187.
History: R3 settled in the CEO review without a question on a premise that holds on macOS and Linux only.

Approval readiness: PASS (eng). Checked: eng D1 structure (B, answered); eng D2 R3w (A, answered); E1 to E6, E9 to E11 fixes carried from CEO answers D2, D5, D6, D9 and P8 or the owner's standing rule on small mechanics (test shape, mechanics); regression contracts carried from CEO items 3 and 5 and the foundations decisions.

### Worktree parallelization strategy

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Agent rules (T1, T2, T5) | src/main (hive.ts prompts), test | — |
| Solo branch and worker predicate (T3) | src/main (hooks.ts), src/shared | Agent rules (shares hive.ts) |
| Place links (T4) | src/shared (settingsPlaces), src/renderer | — |
| Foundations (T6, T7) | src/shared (foundations), src/main (foundations.ts), locales | — |
| Referenceable customers and packs (T8) | src/main (hive.ts), resources/packs, src/shared (workStyleUpdates) | Agent rules |
| Windows shell wall (T13) | src/main (hooks.ts), src/shared (folderAccess) | Solo branch (shares hooks.ts) |
| Behavior eval (T9) | test | Agent rules, Solo branch |

Parallel lanes: Lane A: agent rules -> solo branch -> Windows wall -> referenceable customers (hive.ts and hooks.ts shared, sequential). Lane B: place links. Lane C: foundations. Then the behavior eval after Lane A.
Execution order: Lanes A, B and C in parallel; merge; then T9, T10 (confirmed by eng finding 1, docs only), T11, T12.
Conflict flags: Lane A and Lane C both touch src/main/hive.ts only if foundations prompt text changes there (11c, 11d); keep those prompt lines in Lane A.

### Completion summary (eng)
- Step 0: Scope Challenge — scope accepted as-is; structure B (smaller arrangement)
- Architecture Review: 4 issues found
- Code Quality Review: 3 issues found
- Test Review: diagram produced, 17 gaps identified (all with required tests named)
- Performance Review: 3 issues found
- NOT in scope: written (CEO section, 4 items)
- What already exists: written (CEO section)
- TODOS.md updates: 0 items proposed
- Failure modes: 0 critical gaps flagged (Windows shell row now handled by T13)
- Outside voice: codex unavailable (owner rule); native Claude fallback completed, 12 findings, 11 fixed, 1 decided by owner (D2)
- Parallelization: 3 lanes, 3 parallel / 0 sequential at start
- Lake Score: 0/0 (no coverage scored question)
- Implementation tasks: 13 (11 P1, 2 P2)

### Unresolved decisions
None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 4 | CLEAR | 2 proposals, 2 accepted, 0 deferred |
| Outside Review | native Claude subagent (Codex not used: owner rule) | Independent 2nd opinion | 2 | unavailable (native fallback completed twice) | CEO pass 11 findings, eng pass 12 findings; all resolved or decided (native) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | ISSUES OPEN (resolved, mapped to tasks) | 10 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (earlier plan on this branch) | score: 6/10 → 8/10, 6 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review, unavailable twice (owner rule keeps Codex to the adversarial diff pass); native Claude fallback completed both times (CEO 11 findings, eng 12 findings), not counted as outside coverage.
- **VERDICT:** CEO CLEARED; eng review complete with all findings resolved into tasks T1 to T13 (status issues_open records mapped work, not open decisions). Ready to implement.

NO UNRESOLVED DECISIONS
