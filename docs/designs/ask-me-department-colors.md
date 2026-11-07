# Ask me cards in their department's color

Status: Built (2026-11-05). Owner, after seeing it in the app: "i am actually not liking the colorful cards as they are not really adding the value i thought they will provide with colors. Actually keeping this same white background but adding the filter bar looks like a better idea." So the cards stay white, the person chip is back to its usual look, and the department row (with its washed chips), the filter rules and the folding of mail, schedule and Work style cards remain. Sections below that describe card washes and the accent chip ring are history. CHANGELOG and the release line in FEATURES.md Part 2 come at ship; the look check (T6) waits for the app.

## The ask

Owner, 2026-11-05: "the ask me card can have a light color background depending upon
department. this will help business owner visually recognize and focus on certain
category card like security team question or finance question."

## What is true today (receipts)

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| P1 | An ordinary Ask me card is a plain white card (`card` fill, `line` ring) | `src/renderer/src/components/AskMeTab.tsx:578-586` | verified |
| P2 | The person chip on the card is already in its department's colors (`l` fill, `m` ring) | `src/renderer/src/components/AskMeTab.tsx:334`, `:386` | verified |
| P3 | The chip's person is the card's assignee; Michael's own cards get no color (`isGod`) | `src/renderer/src/components/AskMeTab.tsx:331-334` | verified |
| P4 | A Company foundations card colors its chip by the raiser first, then the assignee | `src/renderer/src/components/AskMeTab.tsx:315-317` | verified |
| P5 | There are 9 department families, each `l` / `m` / `d` / `acc`, with a dark derivation | `src/renderer/src/design/tokens.ts:6-16`, `src/renderer/src/scene/studio/theme.ts:118-122` | verified |
| P6 | IT Security (Sadiq) and IT Engineer (Nick) share the `it` family; there is no security color | `src/shared/officeRoles.ts:20-22`, `:44-45`; `branding/DESIGN.md:268` | verified |
| P7 | The owner's 2026-09-30 rule for this card is "a plain card" | `branding/DESIGN.md:698-703` | verified; this ask changes it |
| P8 | Design rule: text 4.5:1 on every surface it can appear on; never color alone | `branding/DESIGN.md:2382-2392` | verified |
| P9 | Schedule, Work style and Mail proposal cards show a person avatar (on its department `l`, `scene/office/props.tsx:96-104`) but no department color on the card fill | `src/renderer/src/components/ScheduleRequestCards.tsx:72`, `WorkStyleUpdateCards.tsx:83`, `MailProposalCards.tsx:80` | verified |

unverified=0

## Measured: the department's `l` as the card fill fails contrast

[measured: node script over the token values in `tokens.ts:7-15` and `tokens.css:16-35,153-171`]

The card's quiet text (`ink-3`: "5h ago", the "Holding up" link, placeholders) is 5.32:1 on
white today. On each family's `l`:

- Light: 4.26 (it) to 4.79 (sales). 7 of 9 families fall under 4.5 (front-desk 4.44,
  support 4.49, marketing 4.45, people 4.40, it 4.26; finance 4.59 and operations 4.54 and
  team 4.51 pass narrowly). `coral-text` (a failed reply) also falls to 4.27 on `it`.
- Dark (`l` derived at L .36): 2.01 (operations) to 3.82 (team). All 9 fail.

A **wash** passes everywhere. Adopted mixes: light = `l` mixed 50% into `card`
(`#FFFFFF`); dark = the dark `l` mixed 30% into `card` (`#1F1E2B`).
[measured: node script, every text token on the card and the focus ring, all 9 families]

| Token on the wash | Light, lowest (family) | Dark, lowest (family) | Needs |
|---|---|---|---|
| `ink` | 15.12 (it) | 10.03 (finance) | 4.5 |
| `ink-2` | 8.10 (it) | 7.58 (finance) | 4.5 |
| `ink-3` | 4.79 (it) | 4.81 (finance) | 4.5 |
| `indigo-text` ("See full context") | 7.12 (it) | 5.17 (finance) | 4.5 |
| `amber-text` | 5.11 (it) | 6.51 (finance) | 4.5 |
| `green-text` | 4.65 (it) | 5.83 (finance) | 4.5 |
| `coral-text` (failed reply) | 4.80 (it) | 5.35 (finance) | 4.5 |
| `indigo` focus ring | 4.38 (it) | 4.47 (finance) | 3.0 |

Measured, open for Section 11 [measured: CIE76 ΔE on the light washes]: three pairs are
hard to tell apart (it vs team 2.0, support vs it 2.3, people vs team 2.8; about 2 is
barely visible), and team is 1.2 from the board. Every other pair is 3.6 or more.

Known, not new: InfoTip's ring (`ink-4`, `InfoTip.tsx:51`) is 2.09:1 on white today and
1.88 on the lightest wash (dark 4.85 to 3.53). The ring is decoration; the glyph inside is
`ink-3`, which passes (4.79). Left as is.

Washes: front-desk `#FFF2F6` / `#3B2736`, support `#EEF7FF` / `#283043`, sales `#FFF9E6` /
`#3B3530`, finance `#ECFAF4` / `#283A3B`, marketing `#FFF3EC` / `#3B2E30`, people `#F7F3FE` /
`#2F2743`, it `#F0F3FB` / `#282C43`, operations `#EAF9FA` / `#283943`, team `#F6F5FB` /
`#2B2743` (light / dark).

So "light color background" is built as this wash, not as `l`.

## Step 0

### 0A Premise

The real problem: with several cards waiting, the owner reads each title to find the ones
that matter to them now (money, security). Color lets the eye find a kind of card before
reading. The plan solves this directly for spotting. "Focus on" is only half served:
color helps you find finance cards, it does not hide the rest.

Do nothing cost: small. The chip already carries the color at 22 px; a busy board still
reads as a column of white cards.

### 0B Existing code

| Sub problem | Reuse |
|---|---|
| Which department a card is | `departmentOf` (`src/shared/officeRoles.ts:63`), same as the chip and the studio |
| The colors, both themes | `family(dept, dark)` (`theme.ts:118`); add a `wash` to it |
| Which person colors a card | the chip's own person (assignee; raiser first on Company foundations) |
| Michael's cards | stay white, as the chip does today (`!owner.isGod`) |

Nothing is rebuilt.

### 0C Dream state

```
  TODAY                          THIS PLAN                         12 MONTH IDEAL
  white cards, a colored   --->  each member's card washed   --->  the owner sees at a glance
  22 px chip; read every         in its department color;          which part of the business
  title to find money or         Michael's cards stay white        needs them, and can narrow
  security asks                                                    the board to it
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| R1 owner | Ordinary Ask me card fill (P1, P7) | plain white | department wash | reversed | Owner, 2026-11-05, after seeing it in the app: cards stay white; the filter row stays. Was: Owner ask, 2026-11-05 (quoted above): a light department background |
| R2 reviewer | The fill is a wash, not `l` (measured above, P8) | none | light 50% `l` over `card`, dark 30% dark `l` over `card` | approved | Small mechanic that keeps the owner's ask inside the 4.5:1 rule; decided under the plan review rule (owner 2026-10-27: take the recommendation on small mechanics) |
| R3 reviewer | Which person decides the card's color | chip: assignee; foundations chip: raiser then assignee (P3, P4) | the card takes its chip's color, always | approved | Same small mechanic rule; card and chip never name different departments. Foundations cards: the area decides both card and chip (design D2, D3, 3A); the chip still names the asker |
| R4 owner | A security question has its own color (P6) | `it` for IT Security and IT Engineer | 10th department (E1) | declined | Owner D2, 2026-11-05: Skip, over the recommendation to defer. Security stays in the IT color everywhere; no TODO |
| R5 owner | Which Ask me cards get the wash (P9) | ordinary questions only (R1) | every member card (E2) | approved | Owner D3, 2026-11-05: Add. Company foundations, schedule, Work style and mail proposal cards take their member's wash and chip color; Michael's own cards stay white |
| R7 owner (Section 4) | What the filter does so no hidden card is missed (Accepted scope 5) | none | guarded filter | approved | Owner D6, 2026-11-05: A. Cards with no department and reports stay in view; live "N more from other teams, Show all" line; pill, strip or for you chip opening a hidden card clears the filter; empty department clears it; first visible card opens; All clear only on an empty whole board |
| R9 owner (Section 4) | How long a picked department stays picked | none | reset whenever the board is hidden | approved | Owner D7, 2026-11-05: A, on a false premise (the column has no close while cards wait); reopened in the eng review, owner E1: A. Resets on minimize, a member panel or another office view; AskMeTab state plus one effect; `store.ts` is not touched |
| R8 owner (Section 11) | The three look alike wash pairs (it/team 2.0, support/it 2.3, people/team 2.8) | as measured | accent ring | approved | Owner D8, 2026-11-05: B. The person chip's ring becomes the department `acc` at 1.5 px (pairs then ΔE 17 to 57); on the schedule, Work style and mail cards the avatar's edge takes the same `acc`; washes unchanged |
| R6 owner | A way to show only one department's cards ("focus on") | none | department chips over the board (E3) | approved | Owner D4, 2026-11-05: Add, over the recommendation to defer. The hidden card risk is accepted and must be designed for (see Accepted scope). Reopened by O3 (grouping instead); owner D9: B, keep the filter |
| R10 owner (outside voice O4) | Company foundations cards under the color rule and the filter | washed and filtered by raiser (D3) | colored and filtered by the area the question is about | approved | Owner D10, 2026-11-05: B (white, always shown); reopened by the owner in the design review: D2 "foundation cards can take the same color as of which area they are rather being white"; D3: A, they filter by that area and are counted when hidden. Area = `jobsAsking(id)` (`shared/foundations.ts:188`); a question several areas share takes the asker's area when it is one of them (asker found in agents, then restorable), else the first in `FOUNDATION_JOBS` order (small mechanic). The chip's fill and ring follow the area (design 3A); its name and avatar stay the asker's |

## Mode

SELECTIVE EXPANSION (owner D1, 2026-11-05, answered the mode question with the
recommendation). No new approach decision was needed.

### HOLD checks

1. Complexity: the bare ask was about 6 files; with E2 and E3 accepted it is about 14
   [estimated]: `theme.ts`, `tokens.ts`, `AskMeTab.tsx`, `FoundationCard.tsx`,
   `ScheduleRequestCards.tsx`, `WorkStyleUpdateCards.tsx`, `MailProposalCards.tsx`,
   three locale files (`store.ts` is not touched: owner D7),
   DESIGN.md, tests, FEATURES.md and CHANGELOG. No new
   class or service; the count is mostly small edits.
2. Minimum change for the bare ask: a `wash` in `family`; the card fill in `AskMeTab.tsx`;
   DESIGN.md 3.4 and 7.8; one test. Nothing in it can be put off without losing the ask.
3. Invariants kept: 4.5:1 text on every card surface (P8); never color alone (the
   department is also given in words, Accepted scope 6); the open card still reads as the
   open one; Michael's cards white.

No deferral of current scope is proposed.

### Candidates (all answered: D2 to D4)

| # | Addition | Effort | Risk |
|---|---|---|---|
| E1 (R4) | Security as its own department: a 10th color, icon and studio pod | L (human ~2 days / CC ~1.5 h) | medium: the studio ring is tuned to nine pods (`layout.ts:1-7`) |
| E2 (R5) | The wash on every member card on Ask me, not only ordinary questions | S (human ~3 h / CC ~15 min) | low |
| E3 (R6) | Department chips over the board that show only one department's cards | M (human ~1 day / CC ~40 min) | medium: hides cards on the owner's only inbox |

## Accepted scope

1. **Wash (R1, R2).** `tokens.ts` mirrors `card` for both themes; `family(dept, dark)` in
   `theme.ts` gains `wash`, mixed in TS (light: `l` 50% into `card`; dark: the dark `l`
   30% into `card`). The studio ignores the new field. DESIGN.md 3.4 gets the wash column
   and the measured table above.
2. **The color rule (R3).** A card takes the color of the one member its chip or avatar
   names; the chip person always decides, whoever raised the ask. No single member
   (Michael, an unknown or deleted id, an assignee that is not a string) means white.
   One explicit exception, always white and always shown: silent engine cards (they
   report the engine, not a department's question; some name one member,
   `shared/silentEngine.ts:148-156`). Company foundations cards take the area their
   question is about, not the raiser (design review D2, D3; see R10).
3. **Ordinary question card (R1, R3).** Folded and open, the fill is the wash. The open card
   keeps its `line-2` ring and `shadow-md`, so open still reads as open. The chip keeps `l`
   fill and `m` ring. Inner surfaces (answer box, option rows, choice chips, file and email
   chips, buttons) keep their own `card` or `neutral-soft` fills on the wash. Reports on
   the board and the answered just now cards follow the same rule.
4. **Every member card (R5, owner D3; foundations per R10).** Schedule requests, Work
   style updates and mail proposals take their member's wash as the card fill; Company
   foundations cards take the wash of the area their question is about. Their avatar already sits on its department color; nothing else
   on them changes. FoundationCard takes a fill prop for its area's wash, and its chip changes (D8 ring);
   the other three get a fill per card. Silent engine cards stay white (rule 2). Michael's own cards (update, case study, engine setup, office break, research
   and knowledge notices) stay white.
5. **Focus filter (R6, owner D4).** One row of department chips over the board, named with
   the existing `studio.dept.*` words, one chip per department that has a member card on
   the board. Picking one shows only that department's member cards, across all card kinds
   (the schedule, Work style and mail lists are narrowed in `AskMeTab` before they are
   passed down; each card component gets a fill per member from `AskMeTab`, which knows
   `dark`); picking it again shows all. Requirement carried from the 10x check: nothing
   urgent from another team is lost behind the filter. Tasks carry no reliable urgency
   (`priority` defaults to 3, `hiveTasks.ts:56`), so every hidden card counts as possibly
   urgent: no card is ever hidden without the owner seeing that it is. The review sections
   settle how, covering at least: a new card for another department arriving through the
   poll while a filter is on; the picked department vanishing (role changed, member
   deleted); `team` cards (every custom role) under the Team chip; the always open
   Company foundations card under a filter; a focus request (pill, strip, "for you" chip) for a hidden card;
   a visible count of hidden cards against the Needs you count; whether Michael's white
   every card without a department (Michael's, silent engine, office stop, an unknown
   member) and reports stay in view; the picked department's last card leaving; which card
   opens by default under the filter; All clear, the empty state and the answered just now
   list (`AskMeTab.tsx:302`: whole board or filtered board); whether the filter outlives
   the tab; drafts on hidden cards; `aria-pressed` and keys on the chips; whether the row
   shows when only one department has cards; how the chips look (color, picked state,
   counts) and their order in Arabic.
6. **Never color alone (DESIGN.md 12, R3 mechanic).** The person's name does not say
   "Finance", so the department is also given in words: the filter chips are the legend
   (each chip its department's wash with an `m` ring and the `studio.dept.*` name), and the
   person chip's accessible name and tooltip read "Oscar, Finance". On the schedule, Work
   style and mail cards, which show an avatar and no chip, the avatar carries the same
   accessible name and tooltip.
7. **Docs and tests.** DESIGN.md 3.4 (wash column, measured table), 7.8 (the card fill and
   the filter row), 7.9 (schedule card fill); FEATURES.md and CHANGELOG. Tests: the wash
   values for all 9 families in both themes; the color rule's white cases (Michael, unknown
   id, non string assignee, silent engine); the filter narrowing every card kind; the
   hidden card guards once Section 4 settles them; the `card` values in `tokens.ts` match
   `tokens.css:16` and `:153`.

## Documents approved

Owner D5, 2026-11-05: approved this plan and the CEO summary
(`~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-11-05-ask-me-department-colors.md`)
and continued. Spec review: 3 passes (6, 7, 7 of 10), cap reached, last pass's 8 items
applied and checked, spec not re-verified.

## 0I Temporal interrogation

```
  HOUR 1 (foundations):  `card` hex for both themes in tokens.ts; `wash` in family();
                         one memberFamily(id) in AskMeTab used for chip, fill and filter.
  HOUR 2-3 (core):       fill on the ordinary card, reports, answered just now; fill prop
                         on FoundationCard and the three list cards; the filter row and
                         the narrowing of all four lists.
  HOUR 4-5 (integration): needsYouFocus for a hidden card; default open card under a
                         filter; All clear against the whole board; dark mode pass.
  HOUR 6+ (polish/tests): the measured wash table test, tokens.ts vs tokens.css, white
                         cases, filter narrowing, DESIGN.md 3.4 / 7.8 / 7.9, FEATURES.md.
```

Effort: human ~1.5 days / CC ~1 h. Feasibility blockers: none. Measured: the look alike
wash pairs cannot be fixed by more chroma at the same lightness (the blues leave sRGB), and
less lightness breaks `ink-3` contrast, so they are a design choice (Section 11).

## Review sections

### Section 1: Architecture

```
  tokens.ts  card {light #FFFFFF, dark #1F1E2B}  (new, mirrors tokens.css:16,153)
      |
  theme.ts   family(dept, dark) -> { l, m, d, acc, lit, litM, wash }   (wash new)
      |                                   ^ studio callers ignore wash
  AskMeTab   memberFamily(id) = id -> agents (not isGod) -> departmentOf -> family
      |        |-- chip style (ordinary, foundations, answered just now)
      |        |-- card fill (all member cards)
      |        `-- filter key (same member as the color, R3)
      |-- filter state: ALL | DEPT(d)
      |-- narrows: waiting rows, scheduleRequests, offers, proposals
      `-- passes fillFor(agentId) to FoundationCard / ScheduleRequestCards /
          WorkStyleUpdateCards / MailProposalCards
  untouched: SilentEngineCards, EngineSetupCard, UpdateCard, CaseStudyCard,
             OfficeBreakCard, notices (white, always shown)
```

Data flows (member to fill):
- Happy: member id found, not Michael -> department -> wash.
- Nil: no id, Michael, deleted member, non string assignee -> white, no filter key, always shown.
- Empty: no member cards -> no chip row.
- Error: agents not loaded yet (empty list at start) -> every card white until they load,
  then the color appears; the chip row appears with them. Accepted: one frame of white.

Filter state:
```
  ALL --pick d--> DEPT(d)
  DEPT(d) --pick d again | "Show all" | d has no cards left | focus request for a
            hidden card | (R9: column closes?) --> ALL
  DEPT(d) --pick e--> DEPT(e)
  invalid: DEPT(d) with no card of d on the board (prevented by the "no cards left" edge)
```

Findings:
- A1 OK, decided (small mechanic): the department is worked out in two places today
  (`AskMeTab.tsx:317`, `:334`); one `memberFamily(id)` serves chip, fill and filter, so
  the color and the filter can never disagree.
- A2 OK: new coupling is one optional `fillFor` prop on four card components; justified.
- Scaling: a handful of cards, a map lookup each. Security surface: none. Rollback: revert
  the commit; nothing is stored on disk.

### Section 2: Error and rescue map

```
  CODEPATH                    | WHAT CAN GO WRONG                    | HANDLING
  ----------------------------|--------------------------------------|---------------------------
  memberFamily(id)            | id unknown / deleted / not a string  | white, always shown (R3)
                              | agent is Michael (isGod)             | white
  family(dept, dark).wash     | dept outside the 9 (cannot: typed    | departmentOf falls back
                              | union, officeRoles.ts:63-70)         | to 'team'
  needsYouFocus effect        | target card hidden by the filter     | GAP until R7: lookup fails,
  (AskMeTab.tsx:131-152)      |                                      | focus falls to the heading
  default open card           | idx 0 is a hidden row                | GAP until R7: no card open
  (AskMeTab.tsx:361-362)      |                                      |
```

No new IPC, file or network call; nothing can throw beyond today's code. The two GAPs are
filter behavior and go to Section 4.

### Section 3: Security and threat model

No new input, endpoint, file path, secret or dependency. Department names come from the
locale files; member text never reaches a style value. Filter state is in memory only.
No issues found.

### Section 4: Data flow and interaction edge cases

```
  board feed (5 s poll) -> rows + lists -> memberFamily -> [filter DEPT(d)?] -> shown
                                              |                  |
                       nil/unknown -> white, no key   hidden rows -> count (R7)
  shadow paths: card for another dept arrives while filtered -> joins hidden count (R7);
  picked dept loses its last card -> filter clears; member deleted or role changed ->
  its cards move or go white, and the "no cards left" edge clears a stale filter
```

```
  INTERACTION            | EDGE CASE                          | HANDLED? | HOW
  -----------------------|------------------------------------|----------|-----------------------------
  pick a chip            | double click                       | yes      | toggle is idempotent per click
  pick a chip            | its department's last card answered| yes      | filter clears (state edge)
  pill / strip / for you | target card hidden                 | yes (D6) | filter clears, the card opens
  open card default      | newest row is hidden               | yes (D6) | first visible card opens
  All clear              | filtered board empty, whole not    | yes (D6) | All clear only on an empty whole board
  answered just now      | shown only when whole board empty  | yes      | uses the unfiltered lists
  draft on a hidden card | owner switches department          | yes      | drafts live in the store
  new card while filtered| other department                   | yes (D6) | joins the live hidden count
  one department only    | chip row adds nothing              | yes      | row shows only with 2+ departments (decided, small)
  Team cards             | every custom role                  | yes      | its own Team chip (decided, small)
  Company foundations    | always open card                   | yes (R10)| its question's area: washed, filtered, counted when hidden
  keyboard / reader      | chips                              | yes      | buttons with aria-pressed, Tab order, Enter/Space
  Arabic                 | chip order                         | yes      | flex row follows dir; order of first appearance
```

### Section 5: Code quality

- Q1 OK, decided (no code arrangement questions, owner rule): the filter's pure parts
  (department per card, narrowing the four lists, hidden count, the "no cards left" clear)
  go in a small `askMeFilter.ts` beside `askMeOrder.ts`, so they test in node with
  `load-ts`; the chip row is a small component next to `AskMeTab`. `AskMeTab.tsx` is 651
  lines already.
- Q2 OK: `memberFamily(id)` replaces the two inline family lookups (`AskMeTab.tsx:317`, `:334`).
- No method over 5 branches expected; the narrowing is one filter per list.

### Section 6: Tests

```
  NEW                              | TEST (unit, node, load-ts)                      | FAILURE / EDGE
  ---------------------------------|-------------------------------------------------|------------------------------
  family().wash, 9 x 2 themes      | equals the measured table hex                   | dark uses 30%, not 35%
  card hex in tokens.ts            | equals tokens.css:16 and :153                   | drift after a theme edit
  color rule (memberFamily)        | member -> wash                                  | Michael, unknown, deleted,
                                   |                                                 | non string, engine -> white;
                                   |                                                 | foundations -> its question's area
  silent engine                    | never washed (source check)                     | one member card stays white
  filter narrowing                 | DEPT(d) keeps d's rows, schedule, offers, mail  | no department cards and
                                   |                                                 | reports kept (D6)
  hidden count                     | counts every hidden card of every kind          | new card arriving counts
  auto clear                       | d has no cards left -> ALL                      | member deleted mid filter
  focus request for hidden card    | filter clears, card opens (source check)        | pill, strip, for you chip
  default open card                | first visible row                               | newest row hidden
  All clear                        | whole board empty only                          | filtered view empty, board not
  filter memory (D7)               | state in AskMeTab, not the store (source check) |
  chip row                         | shows with 2+ departments; aria-pressed         | one department: no row
```

Assertions and no_claim: each row asserts the exact value or list named above and rejects
the wrong one (a 35% dark wash, a hidden Michael card, a stale filter). no_claim = how it
looks on screen (unit and source checks only; no render). The 2am check: open the board in
both themes with one card per department and look (`/run`, screenshot), then
`/design-review` after build. Hostile QA: answer the last Finance card while filtered and
confirm the board is whole again. No time, randomness or network in these tests.

### Section 7: Performance

A few cards, nine families, two themes: the washes can be computed once per theme. No
issues found.

### Section 8: Observability

Renderer only, no new failure path that logs could explain; no usage stat for the filter
(the owner declined telemetry growth before; nothing here needs it). Debuggability: the
color follows the visible chip, so a wrong color is reproducible from the card itself.
No issues found.

### Section 9: Deployment and rollout

Ships in the next release (0.3.7, both Mac and Windows; Windows untested by rule). No
migration, no stored data, no flag: the owner asked for it on by default. Rollback: revert
the commit and ship. Post ship check: open Ask me in light and dark with several
departments. No issues found.

### Section 10: Long term trajectory

- Debt: the `card` hex lives in tokens.css and tokens.ts (guarded by the test above).
- Reversibility: 5/5, renderer only, nothing stored.
- Path: a later security color (declined now, D2) would add one family and one chip; the
  filter needs no change. Retrospective: the D2 skip means the IT chip filters security
  and IT together, so "security team question" cannot be singled out; the owner chose this.
- Platform: `wash` and `memberFamily` are reusable wherever a member's item is listed
  (the task board, for example), not planned here.

### Section 11: Design and UX

Information architecture: the chip row (only with 2+ departments) -> the count line when
filtered -> Michael's and engine cards -> member cards, each in its wash.

```
  FEATURE      | LOADING            | EMPTY              | ERROR            | SUCCESS          | PARTIAL
  wash         | white until agents | n/a                | unknown -> white | wash             | some white
  chip row     | absent until agents| absent (<2 depts)  | n/a              | chips with names | n/a
  filtered     | n/a                | auto clears        | n/a              | dept + no dept   | count line
```

```
  open Needs you -> all cards -> tap Finance -> Finance + white cards + "3 more, Show all"
       ^                                |-> answer last Finance card -> all cards
       |                                |-> pill opens a Support card -> all cards, it opens
       `---- close column (D7) ---------'-> Show all / tap Finance again -> all cards
```

- DESIGN.md: 7.8's "a plain card" (owner, 2026-09-30) is replaced by the owner's
  2026-11-05 ask; 7.8 records both dates.
- Less verbose UI: the chip row and one count line are the only additions; no help text.
- Accessibility: contrast measured (table above); never color alone (Accepted scope 6);
  chips are buttons with `aria-pressed` and visible focus.
- Look alike pairs: R8, owner D8: the chip ring (and the avatar edge on avatar only cards)
  becomes the department `acc` at 1.5 px.
- Recommend `/plan-design-review` for the chip row and count line before building.

## Last answered decision (R8, owner D8: B)
Commitment comparison:

```text
Commitment                       | Source  | Current          | A Accept         | B Accent ring on chip      | C Team cards white
Washes as measured               | R2      | approved         | same             | same                       | team wash dropped
it/team, support/it, people/team | measured| dE 2.0, 2.3, 2.8 | unchanged        | unchanged on the fill      | it/team, people/team gone;
 card fills                      |         |                  |                  |                            | support/it 2.3 stays
Person chip ring                 | P2      | m, 1 px          | m, 1 px          | acc, 1.5 px (dE 17 to 57)  | m, 1 px
White means                      | R3      | no single member | same             | same                       | also every custom role
```

Question: D8 — R8: What about the three wash pairs that look alike?
Header: Close colors
A) Accept as measured
B) Accent ring on the chip (recommended)
C) Team cards stay white

## Outside voice (native fallback, Claude Plan subagent)

Codex not run: the owner rule (2026-10-01, 2026-10-25) keeps Codex to the DeepSeek
adversarial diff pass; any other use needs a yes. The bounded native fallback completed
inside five minutes. It is native coverage, not outside coverage.

| # | Finding (severity) | Disposition |
|---|---|---|
| O1 | R8 puts "which department" back on the 22 px chip; fills still alike; a 3 to 4 px `acc` edge on the card would do more (High) | Not reopened: the owner saw the pairs' numbers in D8, and a side rule was ruled out by the owner on 2026-09-30 (DESIGN.md 7.8, "No side rule"). Recorded as reviewer disagreement |
| O2 | IT is the hardest wash and holds security (High) | Not reopened: put to the owner in D8's stakes ("IT was one of your two examples") |
| O3 | Department grouping would serve "focus on" with nothing hidden; never offered at D4 (High) | Reopens R6: D9 |
| O4 | Company foundations cards are company questions, misfiled by color and filter (Medium) | Reopens R5 for foundations only: D10 |
| O5 | Spec approved without a pass; four Section 4 rows had no HOW (Medium) | Fact: the owner approved knowing the cap (D5). The four rows are filled from D6 |
| O6 | Tests cannot see the colors; `acc` ring unmeasured (Medium) | Measured: `acc` on its wash 2.36 (sales) to 4.90 (team); the ring is decoration, 3:1 not required, and the name sits beside it. The look check stays a screenshot pass in both themes plus `/design-review` (no_claim kept honest) |
| O7 | `store.ts` listed though D7 says untouched (Low) | Fixed |
| O8 | Open card on a tinted fill told apart only by `line-2` (Low) | Kept as a screenshot check item; the open card also keeps `shadow-md` and is the only one with the reply box |
| O9 | Dark wash is a TS hex, not a CSS variable (Low) | Matches today's dark family derivation (`theme.ts:118-122`); the tokens.ts vs tokens.css test guards `card` |

## Answered (R6 reopened by O3, owner D9: B)
Commitment comparison:

```text
Commitment                         | Source  | Current (D4)            | A Apply grouping        | B Keep the filter | C Investigate | D Defer
How "focus on" works               | D4      | filter with D6 guards    | cards grouped by dept   | filter (D4, D6)   | unchanged     | unchanged
Cards ever hidden                  | D4      | yes, counted (D6)        | never                   | yes, counted      | unchanged     | unchanged
Board order                        | owner 2026-10-04, askMeOrder.ts | newest first | by department, newest first inside | newest first | unchanged | unchanged
D6 / D7 guards                     | D6, D7  | needed                   | dropped                 | kept              | kept          | kept
```

Question: D9 — R6: Keep the hiding filter, or group cards by department instead?
Header: Focus way
A) Apply: group by department
B) Keep the filter (recommended)
C) Investigate before choosing


- Security as its own color or department (R4, owner D2: Skip). Security questions stay
  in the IT color. No TODO.

## Answered (R10 reopened by O4, owner D10: B)
Commitment comparison:

```text
Commitment                          | Source | Current (D3)          | A Keep as D3          | B White and always shown
Foundations card fill               | D3     | raiser's wash         | raiser's wash         | white
Foundations chip                    | D8     | raiser, acc ring      | raiser, acc ring      | raiser, acc ring
Under another department's filter   | D6     | hidden, counted       | hidden, counted       | stays in view
Under the raiser's filter           | D6     | shown as that dept    | shown as that dept    | stays in view
Other member cards                  | D3     | washed                | washed                | washed
```

Question: D10 — R10: Should Company foundations cards stay white and always shown?
Header: Foundations
A) Keep as D3: washed and filtered
B) White and always shown (recommended)

## TODOS.md

No TODO proposals remain: E1 was skipped (no TODO by the owner's choice) and nothing else
was deferred.

## Approval readiness

Approval readiness: PASS. Rows checked: R1 (owner ask), R2 and R3 (small mechanics under
the 2026-10-27 review rule), R4 declined (D2), R5 (D3, narrowed by D10), R6 (D4, kept by
D9), R7 (D6), R8 (D8), R9 (D7), R10 (D10). Documents: D5. No accepted work lacks an answer.

## Reality rows

REALITY: premise-table pass 9 premises, all with code receipts, unverified=0 src/renderer/src/components/AskMeTab.tsx:334
REALITY: already-done pass nothing on origin/main since the ask touches the card fill or a department filter src/renderer/src/components/AskMeTab.tsx:578-586
REALITY: surface-check pass no CLI command, flag or route is added; locale keys reused from studio.dept src/renderer/src/i18n/locales/en.json:2248-2258
REALITY: binding-decisions pass the 2026-09-30 plain card rule is replaced by the owner's own ask; no branch decision conflicts branding/DESIGN.md:698-703
REALITY: numbers pass every contrast and distance number is measured from token values and tagged src/renderer/src/design/tokens.ts:7-15
REALITY: deferred-asks pass no linked issue; the owner's chat ask is fully covered docs/designs/ask-me-department-colors.md:7
REALITY: pr-count pass no ship policy file; one PR on the running branch 9c6c6cfe

## What already exists

- Department per member: `departmentOf` (`src/shared/officeRoles.ts:63`), reused.
- Department colors in both themes: `family()` (`theme.ts:118`), extended with `wash`.
- Person chip in department colors (`AskMeTab.tsx:334`, `:386`), reused; ring changes (D8).
- Department names: `studio.dept.*` in all three locales, reused for the chips.
- Drafts that survive a hidden card: the store (`store.ts:444`), reused unchanged.

## Dream state delta

The owner sees which team each card belongs to and can narrow the board to one team with
nothing silently hidden. Left for later: security apart from IT (declined, D2), and a
measured look at whether the faint washes are enough on real boards.

## Error and rescue registry

| Codepath | Failure | Rescue | User sees |
|---|---|---|---|
| `memberFamily(id)` | unknown, deleted, Michael, non string id | white, no filter key | a white card, always shown |
| `family().wash` | dept outside the 9 | cannot happen (typed union, `team` fallback) | n/a |
| focus request | target hidden | filter clears (D6) | the card opens |
| default open card | newest hidden | first visible opens (D6) | an open card |
| picked department empties | last card answered or member gone | filter clears | every card |

## Failure modes registry

```
  CODEPATH            | FAILURE MODE                | RESCUED? | TEST? | USER SEES?            | LOGGED?
  --------------------|-----------------------------|----------|-------|-----------------------|--------
  memberFamily        | no single member            | Y        | Y     | white card            | n/a
  wash in dark theme  | wrong mix (35%)             | Y        | Y     | measured wash         | n/a
  tokens.ts card hex  | drifts from tokens.css      | Y        | Y     | test fails            | n/a
  filter              | hidden card from pill       | Y (D6)   | Y     | card opens            | n/a
  filter              | new card for another team   | Y (D6)   | Y     | count goes up         | n/a
  filter              | department empties          | Y        | Y     | all cards             | n/a
```

CRITICAL GAPS: 0.

## Scope expansion decisions

From the CEO plan (`~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-11-05-ask-me-department-colors.md`):
- Accepted: E2 every member card washed (D3, foundations excepted by D10); E3 focus filter (D4, kept by D9).
- Deferred: none.
- Skipped: E1 security as its own department (D2).

## Diagrams

Produced: system architecture and data flow (Section 1), filter state machine (Section 1),
data flow with shadow paths (Section 4), interaction edge table (Section 4), user flow
(Section 11), error flow (Section 2 map), 0I sequence. Deployment and rollback are one
step (ship, or revert and ship), so no diagram.

## Stale diagram audit

Files this plan touches (`AskMeTab.tsx`, `theme.ts`, `tokens.ts`, `FoundationCard.tsx`,
`ScheduleRequestCards.tsx`, `WorkStyleUpdateCards.tsx`, `MailProposalCards.tsx`) hold no
ASCII diagrams. None stale.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.
Run with Claude Code or Codex; checkbox as you ship. Ratios: features ~30x, tests ~50x.

- [ ] **T1 (P1, human: ~2h / CC: ~5min)** — theme — add `card` hex for both themes and `wash` to `family()`
  - Surfaced by: Measured section and Accepted scope 1 (R2)
  - Files: src/renderer/src/design/tokens.ts, src/renderer/src/scene/studio/theme.ts
  - Verify: unit test of all 9 washes in both themes against the measured table
- [ ] **T2 (P1, human: ~3h / CC: ~10min)** — Ask me — one `memberFamily`, wash on ordinary cards, reports and answered just now; chip ring in `acc` 1.5 px; "Oscar, Finance" name and tooltip
  - Surfaced by: Section 1 A1; Accepted scope 2, 3, 6; D8
  - Files: src/renderer/src/components/AskMeTab.tsx
  - Verify: unit test of the white cases; screenshot in light and dark
- [ ] **T3 (P1, human: ~3h / CC: ~10min)** — member cards — wash fill on schedule, Work style and mail cards; avatar edge in `acc` with the same name; foundations stays white, chip ring only
  - Surfaced by: Accepted scope 4 (D3, D10); D8
  - Files: src/renderer/src/components/ScheduleRequestCards.tsx, src/renderer/src/components/WorkStyleUpdateCards.tsx, src/renderer/src/components/MailProposalCards.tsx, src/renderer/src/components/FoundationCard.tsx, src/renderer/src/components/AgentAvatar.tsx
  - Verify: source checks that each takes the fill; screenshot
- [ ] **T4 (P1, human: ~1 day / CC: ~25min)** — filter — pure narrowing and guards in `askMeFilter.ts`; chip row (2+ departments, `aria-pressed`); count line with Show all; focus request clears; empty clears; first visible opens; All clear on the whole board; state in AskMeTab only (D7)
  - Surfaced by: Section 4; D4, D6, D7, D9, D10
  - Files: src/renderer/src/components/askMeFilter.ts (new), src/renderer/src/components/AskMeTab.tsx, a chip row component beside it, src/renderer/src/i18n/locales/en.json, ar.json, zh-CN.json
  - Verify: unit tests from the Section 6 table; copy has no dashes
- [ ] **T5 (P1, human: ~2h / CC: ~5min)** — tests — the Section 6 table, including tokens.ts vs tokens.css
  - Surfaced by: Section 6
  - Files: test/askme-department-colors.test.cjs (new)
  - Verify: `npm test` green
- [ ] **T6 (P2, human: ~2h / CC: ~10min)** — docs — DESIGN.md 3.4 (wash and measured table), 7.8 (fill, chip ring, filter row, both owner dates), 7.9 (schedule fill); FEATURES.md; CHANGELOG
  - Surfaced by: Accepted scope 7; Section 11
  - Files: branding/DESIGN.md, docs/FEATURES.md, CHANGELOG.md
  - Verify: read through; no dashes in user facing copy
- [ ] **T7 (P2, human: ~1h / CC: ~10min)** — look check — one card per department in both themes; open card still reads as open; then `/design-review`
  - Surfaced by: outside voice O6, O8; Section 6 no_claim
  - Files: none
  - Verify: screenshots attached to the PR

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | chip already in dept color; `l` fill fails  |
  |                      | 4.5:1 (7/9 light, 9/9 dark); 3 wash pairs   |
  |                      | look alike                                  |
  | Step 0               | D1 mode; D2 skip security; D3 all member    |
  |                      | cards; D4 filter; D5 docs approved          |
  | Section 1  (Arch)    | 2 issues found (both decided)               |
  | Section 2  (Errors)  | 5 error paths mapped, 2 GAPS (closed by D6) |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 13 edge cases mapped, 0 unhandled           |
  | Section 5  (Quality) | 2 issues found (both decided)               |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1           |
  | Section 11 (Design)  | 1 issue (look alike pairs, D8)              |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (1 item)                            |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 5 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 6 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 3 proposed, 2 accepted (SEL)                |
  | CEO plan             | written                                     |
  | Outside voice        | codex unavailable (owner rule); native      |
  |                      | fallback completed, 9 findings              |
  | Lake Score           | 2/2 recommendations chose complete option   |
  | Diagrams produced    | 7 (arch, data flow, state, shadow paths,    |
  |                      | edge table, user flow, 0I)                  |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 0 unverified       |
  +====================================================================+
```

### Unresolved Decisions

None.

## Eng review (plan-eng-review, 2026-11-05)

Target: this plan, `docs/designs/ask-me-department-colors.md` (CEO cleared, D1 to D10).
Report file: this file. Eng questions are numbered E1, E2 and so on, to keep them apart
from the CEO review's D numbers.

### Scope Challenge

A. What exists: `departmentOf` and `family` (reused); `PersonAvatar` already takes a `ring`
(`scene/office/props.tsx:83-85`); `AgentAvatar` looks a member up in `agents`, then
`restorableAgents` (`AgentAvatar.tsx:9`); `studio.dept.*` names; drafts in the store.
Minimum change: as the CEO plan lists; no cut proposed (every item is an owner answer).
Complexity: about 14 changed files [estimated], 1 new module (`askMeFilter.ts`), 1 new
component (the chip row). Search check: no new architectural pattern (a pure filter over
in-memory lists, inline styles); no search needed. TODOS: nothing in TODOS.md blocks or
overlaps this. Distribution: no new artifact.

B. Complexity gate tripped (8+ files). Feature cuts: none proposed. Structure: decided
under the owner's standing rule (no code arrangement questions; take the recommended
one): Original arrangement kept (pure `askMeFilter.ts` beside `askMeOrder.ts`, a chip row
component beside `AskMeTab`, a `fillFor` prop on the three list cards). The smaller
arrangement (everything inline in `AskMeTab.tsx`, 651 lines) would leave the filter
untestable in node. Scope record: feature answers: CEO D1 to D10; structure: Original
arrangement (owner rule 2026-10-27, no code arrangement questions); accepted scope: as the
CEO plan; pending remedies: R9 (reopened).

C. Findings:

1. [CRITICAL] (confidence: 9/10) src/renderer/src/shell/NeedsYouBoard.tsx:18-20 — D7's
   premise is wrong. Quote: "While anything waits it stays open and has no close; the x
   appears only when nothing waits". Minimize only hides it: `display: columnView &&
   !minimized ? 'flex' : 'none'` (`App.tsx:644`), so `AskMeTab` stays mounted. Under D7 as
   built (AskMeTab state), a picked department stays picked for as long as cards wait
   and the board is in view: hours, through minimize and restore. It resets only when a
   member panel replaces the board (`App.tsx:654`). Reopens R9: E1.
2. [INFORMATIONAL] (confidence: 9/10) src/renderer/src/scene/office/props.tsx:101 — the
   avatar is `aria-hidden="true"`, so "the avatar carries the accessible name" (Accepted
   scope 6) cannot work. Correction, same behavior: the department goes into the card's
   own `aria-label` (for example "Schedule change from Oscar, Finance") and a `title` on
   the avatar's wrapper. No question: same approved outcome, a working mechanism.
3. [INFORMATIONAL] (confidence: 8/10) src/renderer/src/components/AgentAvatar.tsx:9 —
   quote: `s.agents.find((a) => a.id === id) ?? s.restorableAgents.find((a) => a.id === id)`.
   A `memberFamily` that reads `agents` only would leave a not yet restored member's card
   white while its avatar is colored. Decided (small mechanic, matches `nameFor` at
   `AskMeTab.tsx:154-155`): `memberFamily` uses the same two rosters; not on either means white.
4. [INFORMATIONAL] (confidence: 8/10) src/renderer/src/scene/office/props.tsx:83-85,103 —
   `ring` already exists and draws `0 0 0 1.5px var(--cth-card), 0 0 0 3px ${ring}`. D8's
   avatar edge reuses it through an optional `ring` on `AgentAvatar`; on a washed card the
   gap must use the wash, not `--cth-card`, or a white halo shows. Decided as part of D8.

### Decision ledger (eng)

### R9: How long a picked department stays picked (reopened)
Finding: 1, CRITICAL, 9/10, src/renderer/src/shell/NeedsYouBoard.tsx:18-20, reviewer: eng review
Plan baseline: owner D7 (CEO review), A "Until the column closes": AskMeTab state only; closing Needs you or switching tabs shows every card again
Runtime evidence: the column has no close while anything waits (NeedsYouBoard.tsx:18-20); minimize hides with display none and keeps AskMeTab mounted (App.tsx:644); a member panel replaces the board and unmounts it (App.tsx:654)
Comparison grid:

```text
Commitment                      | Source  | Current (D7 as built)     | A Reset when hidden       | B Hidden or 10 min idle   | C Keep D7 as built
Guarded filter (D6)             | D6      | approved                  | same                      | same                      | same
Count line always shown         | D6      | approved                  | same                      | same                      | same
Member panel replaces the board | runtime | resets (unmount)          | resets                    | resets                    | resets
Minimize, then restore          | pending | stays picked              | resets                    | resets                    | stays picked
Office view switch hides board  | pending | stays picked              | resets                    | resets                    | stays picked
Board in view, no use 10 min    | pending | stays picked              | stays picked              | resets                    | stays picked
Where the state lives           | D7      | AskMeTab                  | AskMeTab + effect on hide | AskMeTab + effect + timer | AskMeTab
```

Question E1:
E1 — R9: When should a picked department reset, now that the column rarely closes? <gstack-qid:plan-eng-review-filter-reset>
Project/branch/task: department colored Ask me cards, on mit/ask-me-card-dept-colors-91cfea.
ELI10: In D7 you chose "until the column closes", and I said clicking outside closes it. That was wrong. While any card waits, the Needs you column has no close at all. Minimize only hides it, and the board underneath keeps its state. So as written, Finance would stay picked for hours: through minimize and restore, until you open a team member's panel. A resets the filter whenever the board is hidden: minimize, a member panel, or a switch to another office view. B also resets it after 10 minutes with no clicks on the board. C keeps it as built.
Stakes if we pick wrong: with C, a Finance filter picked this morning is still on this afternoon, and only the count line says other teams are waiting.
Recommendation: A because it keeps your D7 intent (each time you come back to the board you see every card) with one effect and no timer, explicit over clever; the count line from D6 covers the time the board stays in view.
Completeness: A=9/10, B=10/10, C=6/10
Pros / cons:
A) Reset when hidden (recommended)
  ✅ Minimize, a member panel or another office view brings every card back next time you look
  ✅ One effect on state the app already has (minimized, column mode); no timers to test
  ❌ A filter left on while the board stays in view lasts until you tap it off, count line showing
B) Hidden or 10 min idle
  ✅ Also clears a filter forgotten on a board that never leaves the screen
  ✅ Closest to "each visit starts from the whole board" in every case
  ❌ A timer that can reset mid task after a long read; more to test (human ~3h / CC ~10min)
C) Keep D7 as built
  ✅ No extra code: the filter lives only in the board's own state
  ❌ The filter survives minimize and restore, against what you chose in D7
Net: A keeps D7's promise for every way the board leaves the screen without adding a timer.
Header: Filter reset
Options:
A) Reset when hidden (recommended)
Minimize, a member panel or another office view resets to every card; no timer. Effort S (human ~1h / CC ~5min), risk low. ✅ Each return shows the whole board. ✅ No timer. ❌ A filter on a board left in view stays until tapped off.
B) Hidden or 10 min idle
As A, plus a reset after 10 minutes with no clicks on the board. Effort S (human ~3h / CC ~10min), risk low. ✅ Clears a forgotten filter. ✅ Covers every case. ❌ A timer can reset mid task; more to test.
C) Keep D7 as built
State in the board only; resets only when a member panel replaces it. Effort S, zero extra work. ✅ Simplest. ✅ No new code. ❌ Survives minimize, against D7.

State: approved
Actual answer: A) Reset when hidden (owner E1, 2026-11-05)
Accepted scope: the picked department resets to every card whenever the board is hidden: the column minimized, a member panel replacing the board, or another office view; state stays in AskMeTab with one effect on the store's existing `columnMinimized`, column mode and `floorView` (`file` counts as visible, `App.tsx:361`); no timer. (Mechanism corrected after the eng outside voice: the approved outcome already named another office view.) The D6 guards and count line are unchanged.
History: D7 (CEO review, 2026-11-05) answered A on the premise that clicking outside closes the column; reopened because that premise is false (NeedsYouBoard.tsx:18-20).

### Eng Section 1: Architecture

Two shapes (new module `askMeFilter.ts` and the chip row):
- Shape 1 (picked): filter state in `AskMeTab`; a pure `askMeFilter.ts` owns the card to
  department rule, the narrowing, the hidden count and the "no cards left" clear.
- Shape 2: the picked department lives in the `useNeedsYou` feed beside `count`, so the
  pill could show a filtered count. Rejected: E1 wants the filter to reset whenever the
  board is hidden, which is board state, and the pill must always count every card (D6).
Depth: shape 1 hides the whole policy (exceptions for Michael, engine, foundations,
reports; roster lookup) behind `cardDepartment(card, roster)` and `narrow(board, dept)`.

```
  AskMeTab (state: dept | null; resets on minimize / member panel / other view, E1)
     |  board = { rows, requests, offers, proposals }   roster = agents ++ restorable
     v
  askMeFilter.ts
     cardDepartment(card, roster) -> dept | null      (null: Michael, engine, unknown member;
     narrow(board, dept)          -> shown + hidden     foundations: its area; reports keep dept
     departmentsOnBoard(board)    -> chip list          for color but are never hidden)
     |
     v
  AskMeTab maps dept -> family(dept, dark).wash / .acc for fills, chip ring, avatar ring
```

Findings:
1. [INFORMATIONAL] (confidence: 8/10) docs/designs/ask-me-department-colors.md (Section 1,
   "memberFamily(id) in AskMeTab") — red flag 2, information leakage: the plan keeps the
   member rule in `AskMeTab` and the filter key in `askMeFilter.ts`, two homes for one
   decision. Decided (small mechanic, same behavior): one `cardDepartment` in
   `askMeFilter.ts` serves color, chip ring and filter.
2. Red flag 8, hand synced list: `card` hex in `tokens.ts` and `tokens.css`; kept with the
   planned test that fails on drift (already in Accepted scope 7).
No other red flag: no pass through, one owner for filter state, no importable internals.
Production failure: at launch the roster is empty until members load, so cards are white
and the chip row is absent for a moment; handled (Section 1 of the CEO review).

Dispositions: 1 decided (small mechanic); 2 already covered by an accepted test.

### Eng Section 2: Code quality

1. [INFORMATIONAL] (confidence: 8/10) src/renderer/src/components/AskMeTab.tsx:296,302 —
   the All clear and answered just now conditions repeat the same long expression
   (`!engineCard && !updateShown && ... proposals.length === 0`). With a filter they must
   read the whole board (D6). Decided (small mechanic): compute `boardEmpty` once from
   the unfiltered lists and use it in both places.
Shared code: `AgentAvatar.tsx:9` and `AskMeTab.tsx:154-155` already share the roster
lookup pattern; `cardDepartment` takes the roster as an argument. No extraction: saving
about two lines does not justify a helper. Error gaps: none beyond Section 2 of the CEO
review. Touched files have no ASCII diagrams.

Dispositions: 1 decided (small mechanic).

### Eng Section 3: Tests

Framework: `node tools/run-tests.cjs` (`package.json:26`), node:test files in `test/`,
TypeScript through `test/load-ts.cjs`. No test reads `family()` today.

```
CODE PATHS                                              USER FLOWS
[+] theme.ts family(dept, dark)                         [+] Spot a department
  ├── [GAP] wash light, 9 families                        ├── [GAP] each member card in its wash (source)
  ├── [GAP] wash dark (30%), 9 families                   └── [GAP] chip and avatar ring in acc (source)
  └── [GAP] l, m, d, acc unchanged (regression)         [+] Focus on one department
[+] tokens.ts card                                        ├── [GAP] pick a chip: only its cards + no dept cards
  └── [GAP] equals tokens.css:16, :153                    ├── [GAP] count line counts every hidden card
[+] askMeFilter.ts                                        ├── [GAP] pill opens a hidden card: filter clears
  ├── cardDepartment                                      ├── [GAP] last card answered: filter clears
  │   ├── [GAP] member -> dept (agents, restorable)       ├── [GAP] minimize or member panel: resets (E1)
  │   └── [GAP] Michael, unknown, non string,             └── [GAP] one department: no chip row
  │             foundations, engine -> null
  ├── narrow
  │   ├── [GAP] no dept picked -> board unchanged (regression, D9 newest first)
  │   ├── [GAP] dept -> its rows, requests, offers, proposals; null dept and reports kept
  │   └── [GAP] hidden count across all four lists
  └── departmentsOnBoard
      └── [GAP] order of first appearance, Team included
[+] AskMeTab wiring (source checks)
  ├── [GAP] first visible card opens
  ├── [GAP] All clear and answered just now use boardEmpty
  └── [GAP] filter state not in the store (D7, E1)

COVERAGE: 0/22 paths tested today (all new)  |  planned: 22/22
QUALITY (planned): unit ★★★ for askMeFilter and family; source ★★ for wiring
```

Value cards (planned, one test file `test/askme-department-colors.test.cjs`):
- Value: protects=narrow keeps every card when no dept is picked; fails_when=the filter drops or reorders cards with no pick; why_new=askme-order.test covers sort only; seam=none; no_claim=render order on screen (unit only)
- Value: protects=a picked dept shows its cards plus no dept cards and reports; fails_when=Michael or engine cards are hidden; why_new=new behavior; seam=none; no_claim=none beyond protects
- Value: protects=hidden count equals the hidden cards of all four kinds; fails_when=a kind is left out of the count; why_new=new; seam=none; no_claim=the line's wording
- Value: protects=cardDepartment white cases; fails_when=a foundations or engine card gets a dept; why_new=new; seam=none; no_claim=none beyond protects
- Value: protects=wash hex for 9 families x 2 themes; fails_when=the mix ratio changes; why_new=no family test exists; seam=none; no_claim=how distinct the colors look (screenshot check, T7)
- Value: protects=existing family fields unchanged; fails_when=adding wash alters l, m, d or acc used by the studio; why_new=no family test exists; seam=none; no_claim=studio rendering
- Value: protects=tokens.ts card equals tokens.css card in both themes; fails_when=one side is edited; why_new=new duplicate; seam=none; no_claim=none beyond protects
- Value: protects=filter resets on hide and on focus requests (source check); fails_when=the effect or the clear is removed; why_new=new; seam=none; no_claim=real Electron behavior (source check only)
Regression (iron rule): newest first order and the default open card with no filter are
existing behavior the filter touches. Contract carried from D9 (the board keeps newest
first) and the plan's "nothing else changes": the no pick identity test above protects it.
Tests made obsolete: none.

Findings: none beyond the planned tests. Dispositions: test list carried into T5.

### Eng Section 4: Performance

A board holds a handful of cards; `narrow` is one pass over four short lists per render;
washes are 18 precomputed values. No issues found.

### Eng outside voice (native fallback, Claude Plan subagent)

Codex not run (owner rule: Codex only for the DeepSeek adversarial diff pass). The bounded
native fallback completed inside five minutes; native coverage, not outside coverage.
Every finding was checked against the code and holds. Each is how to build an approved
outcome, so none needed a new answer.

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| V1 High | Narrowing the arrays unmounts hidden mail and Work style cards and drops typed edits | `MailProposalCards.tsx:44-53` (`useState(p.subject)`, `useState(p.body)` ...), `WorkStyleUpdateCards.tsx:28` | Applied: hidden cards stay mounted and are hidden (`hidden` attribute), never filtered out of the arrays; Section 4's "drafts kept" outcome now holds for every card kind |
| V2 High | Focus lookup reads `rowsRef` built from the shown list, so a hidden target never opens | `AskMeTab.tsx:135-136`, `:174-175` | Applied: the focus effect looks the target up in the whole board, clears the filter and sets `openId` in the same effect (D6) |
| V3 Medium | Five existing source tests pin code this plan rewrites | `schedule-edge-cases.test.cjs:190`, `inbox-zero.test.cjs:166`, `silent-engine-wiring.test.cjs:112`, `case-study-ask-me-card.test.cjs:60`, `askme-card.test.cjs:86-87` | Applied: listed in T5 as updates (same behavior, new expressions) |
| V4 Medium | `theme.ts:7` imports `@/design/tokens`; `load-ts.cjs:57` resolves only relative and `@shared/` | quoted | Applied: the `family()` test stubs `@/design/tokens` with `Module._resolveFilename` (pattern at `research-core.test.cjs:104-117`); `askMeFilter.ts` imports `departmentOf` from `@shared/officeRoles` |
| V5 Medium | E1 reset named column state only; another office view hides through `floorView` | `App.tsx:361` | Applied: mechanism corrected in R9's accepted scope (the approved outcome already named it) |
| V6 Medium | The chip row and count line scroll away inside the AskMeTab scroller | `AskMeTab.tsx:278` (root `overflowY: 'auto'`) | Applied: the chip row and count line are sticky at the top of the scroller, so D6's count stays in view |
| V7 Low | A new chip row file trips the field style guard | `field-style-guard.test.cjs:25-34` | Applied: add the new file to `FILE_EXCEPTIONS` beside `AskMeTab.tsx` |
| V8 Low | The empty department clear can fire on a passing roster gap | plan, Accepted scope 5 | Applied: the clear runs only once the roster has loaded |

## Approval readiness (eng)

Approval readiness: PASS. Checked: R1 to R10 (CEO answers D1 to D10, unchanged), R9
reopened and answered (E1: A, mechanism corrected by V5 within that outcome). Decided small
mechanics (owner rule 2026-10-27): scope findings 2 to 4, Section 1 finding 1, Section 2
finding 1, V1 to V8. Regression contract carried from D9 (newest first, unchanged with no
pick). No pending choice.

## NOT in scope (eng)

- Security as its own color (CEO D2).
- A shared roster lookup helper: two lines saved, not worth a helper (Section 2).

## What already exists (eng)

`departmentOf`, `family`, `PersonAvatar` `ring`, `AgentAvatar` roster lookup, `studio.dept.*`,
the store drafts, `askMeOrder.ts` as the pattern for a pure tested module, the
`Module._resolveFilename` stub pattern for alias imports in tests.

## Failure modes (eng)

| New path | Realistic failure | Covered by | User sees |
|---|---|---|---|
| hidden card kinds | edits lost on filter switch | V1 (mounted, hidden) + source test | nothing lost |
| focus on hidden card | opens folded or not at all | V2 + source test | the card open |
| reset on hide | survives an office view switch | V5 + source test | every card on return |
| count line | scrolled away | V6 sticky | count always in view |
| roster gap | filter cleared by a blip | V8 + unit test | choice kept |
| wash mix | ratio drifts | unit test | measured colors |

Critical gaps: 0.

## Worktree parallelization strategy

Sequential implementation, no parallelization opportunity: every step converges on
`AskMeTab` and the renderer components around it.

## Implementation Tasks (eng, supersedes the CEO review's list)

Synthesized from this review's findings. Each task derives from a specific finding above.
Run with Claude Code or Codex; checkbox as you ship. Ratios: features ~30x, tests ~50x.

- [x] **T1 (P1, human: ~2h / CC: ~5min)** — theme — `card` hex for both themes in tokens.ts; `wash` in `family()`
  - Surfaced by: CEO Measured section (R2)
  - Files: src/renderer/src/design/tokens.ts, src/renderer/src/scene/studio/theme.ts
  - Verify: wash table and unchanged l/m/d/acc test, with the `@/design/tokens` stub (V4)
- [x] **T2 (P1, human: ~3h / CC: ~10min)** — filter core — `askMeFilter.ts`: `cardDepartment` (agents then restorable; null for Michael, engine, unknown; a foundations card takes its question's area via `jobsAsking`), `narrow` (shown and hidden, nothing removed), `departmentsOnBoard`, hidden count, empty clear gated on roster loaded
  - Surfaced by: Eng Section 1 finding 1; scope finding 3; V8
  - Files: src/renderer/src/components/askMeFilter.ts (new)
  - Verify: unit tests from the Eng Section 3 table
- [x] **T3 (P1, human: ~4h / CC: ~15min)** — Ask me wiring — washes on member cards; chip ring and avatar ring in `acc` (ring gap in the wash); department in the card `aria-label`; sticky chip row and count line; hidden cards kept mounted with `hidden`; focus lookup in the whole board; `boardEmpty`; first visible card opens; reset on minimize, member panel or `floorView`
  - Surfaced by: D3, D6, D8, D10, E1; scope findings 2 and 4; Eng Section 2 finding 1; V1, V2, V5, V6
  - Files: src/renderer/src/components/AskMeTab.tsx, a chip row component beside it, src/renderer/src/components/AgentAvatar.tsx, src/renderer/src/components/FoundationCard.tsx, src/renderer/src/components/ScheduleRequestCards.tsx, src/renderer/src/components/WorkStyleUpdateCards.tsx, src/renderer/src/components/MailProposalCards.tsx, src/renderer/src/i18n/locales/en.json, ar.json, zh-CN.json
  - Verify: source checks; copy has no dashes; screenshot both themes
- [x] **T4 (P1, human: ~2h / CC: ~10min)** — tests — new test/askme-department-colors.test.cjs; update the five pinned source tests to the new expressions (same behavior); add the chip row file to `FILE_EXCEPTIONS`
  - Surfaced by: Eng Section 3; V3; V7
  - Files: test/askme-department-colors.test.cjs (new), test/schedule-edge-cases.test.cjs, test/inbox-zero.test.cjs, test/silent-engine-wiring.test.cjs, test/case-study-ask-me-card.test.cjs, test/askme-card.test.cjs, test/field-style-guard.test.cjs
  - Verify: `npm test` green
- [ ] **T5 (P2, human: ~2h / CC: ~10min)** — docs — DESIGN.md 3.4, 7.8, 7.9; FEATURES.md; CHANGELOG
  - Surfaced by: CEO Accepted scope 7
  - Files: branding/DESIGN.md, docs/FEATURES.md, CHANGELOG.md
  - Verify: read through; no dashes in user facing copy
- [ ] **T6 (P2, human: ~1h / CC: ~10min)** — look check — one card per department, light and dark; open card still reads as open; then `/design-review`
  - Surfaced by: CEO outside voice O6, O8
  - Files: none
  - Verify: screenshots on the PR

## Eng reality rows

REALITY: premise-table pass every eng claim quotes code (NeedsYouBoard, App, props, AgentAvatar, load-ts) unverified=0 src/renderer/src/shell/NeedsYouBoard.tsx:18-20
REALITY: already-done pass origin/main has no card fill, filter or wash work since the ask src/renderer/src/components/AskMeTab.tsx:578-586
REALITY: surface-check pass the only command named is npm test, which maps to tools/run-tests.cjs package.json:26
REALITY: binding-decisions pass CEO D1 to D10 kept; D7 reopened only on a false premise and answered E1 src/renderer/src/shell/NeedsYouBoard.tsx:18-20
REALITY: numbers pass contrast and distance numbers carried from the CEO measurements; effort marked estimates src/renderer/src/design/tokens.ts:7-15
REALITY: deferred-asks pass no linked issue; the owner's chat ask is covered docs/designs/ask-me-department-colors.md:7
REALITY: pr-count pass one PR on the running branch 9c6c6cfe

## Eng completion summary

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 1 issue found
- Code Quality Review: 1 issue found
- Test Review: diagram produced, 0 gaps left (22 planned paths)
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex unavailable (owner rule); native Claude Plan fallback completed, 8 findings, all applied
- Parallelization: 1 lane, 0 parallel / 1 sequential
- Lake Score: 0/1 (E1 chose A, 9/10, over B, 10/10)

### Unresolved decisions

None.

## Design review (plan-design-review, 2026-11-05)

Target: this plan. DESIGN.md: `branding/DESIGN.md` (all decisions calibrated against it).
Mockup (HTML and CSS with the app's tokens, owner rule: never the image designer):
`docs/designs/ask-me-department-colors-mockup.html`. Outside voice: Codex not run (owner
rule); an independent Claude design reviewer ran (8 findings, all handled below).
Step 0: 6/10 (colors measured; chip row, count line and sticky look unspecified). Focus:
all 7 passes (D1).

Owner decisions in this review (each asked on its own):
- D2 (mockup direction): "foundation cards can take the same color as of which area they
  are rather being white". D3: A, foundations cards filter by that area and are counted
  when hidden. (R10 updated above.)
- 1B: chips sit in the order their departments first appear on the board (newest first).
- 2A: while a department is picked, a team whose new card arrives gets a 7 px accent dot on
  its chip ("new since you picked" to screen readers), cleared by tapping that chip or
  Show all.
- 3A: on a Company foundations card the person chip's ring and spoken label follow the
  question's area ("Finance question, from Dwight"); the name and avatar stay the asker's.
- 4A: chips wrap onto more pinned lines when they do not fit; the pinned area can grow to
  about 115 px at a 320 px column with the count line (eng W7, estimated).

Decided as small mechanics (owner rule 2026-10-27: take the recommendation on small
mechanics), each from the design reviewer's findings:
- Count line: one string, "Showing {x} of {y}" plus "Show all" (DESIGN.md 7.20 wording),
  with plural forms in en, ar, zh-CN; y is every card on the board; `role="status"`
  announces only when the pick changes, never on the 5 s poll.
- Chip row stays while a department is picked even if only that one is left (so it can
  always be unpicked); it hides only when nothing is picked and fewer than 2 departments
  have cards.
- Chips are 28 px tall (DESIGN.md 12: 28 px desktop minimum), 6 px accent key, name, mono
  count. Picked: the department `m` fill, a 2 px `acc` ring and weight 600 (the `m` fill
  carries the state where `acc` on a wash is under 3:1); the 2 px `indigo` focus ring sits
  2 px off the chip.
- Auto clear (the picked department's last card answered): the newest card opens, and the
  status line says "Showing every team".
- Tags on a washed card (Draft, Report) keep their soft fill and gain a 1 px `line-2`
  ring so the pill reads on any wash; the failed reply line keeps `coral-text`
  (measured 4.80 on the lightest wash).
- Sticky row: the board ground (`bg`) behind it and a 6 px soft bottom shadow from
  `shadow-sm` (dark uses the dark `shadow-sm`).
- Company foundations cards keep DESIGN.md 7.27a (always open, no extra help text); the
  first mockup drew one folded with a help line, fixed.

### Pass 1: Information architecture: 6/10 -> 8/10
Order on screen: pinned chip row, then the count line while a department is picked, then
Michael's and engine cards, then member cards newest first. Chip order: first appearance
(1B), so the row can shift as cards come and go: the owner's choice, kept.

```
  Needs you  [8]                         (i)  [_]
  +-------------------------------------------+   pinned while scrolling
  | (IT 2)(Finance 3)(Support 1)(Sales 1)     |   chips, wrap when needed (4A)
  | Showing 4 of 8   Show all                 |   only while one is picked
  +-------------------------------------------+
  [ Michael: Version 0.3.7 is ready      ]  white
  [ IT wash: Two logins from a new country ] open, newest
  [ Finance wash: Invoice over the limit   ]
  ...
```

### Pass 2: Interaction states: 6/10 -> 9/10

```
  FEATURE      | LOADING            | EMPTY                  | ERROR            | SUCCESS               | PARTIAL
  washed card  | white until the    | n/a                    | unknown member:  | wash, chip ring       | some white (Michael,
               | roster loads       |                        | white            |                       | engine)
  chip row     | absent until the   | absent with <2 depts   | n/a              | chips with counts     | stays while picked,
               | roster loads       | and nothing picked     |                  |                       | even with 1 dept left
  count line   | n/a                | hidden with no pick    | n/a              | Showing x of y        | dot on a chip with a
               |                    |                        |                  |                       | new card (2A)
  auto clear   | n/a                | last picked card gone: | n/a              | newest card opens,    | n/a
               |                    | every card returns     |                  | "Showing every team"  |
```

### Pass 3: Journey: 7/10 -> 8/10

```
  STEP | USER DOES                     | USER FEELS                 | PLAN SPECIFIES
  1    | opens Needs you               | sees teams at a glance     | washes, chip rings, chip legend
  2    | taps Finance                  | focused, nothing lost      | Showing x of y, Show all, white alarms stay
  3    | an IT question arrives        | alerted, not interrupted   | dot on the IT chip (2A)
  4    | answers the last Finance card | done, back to the whole    | newest card opens, "Showing every team"
  5    | minimizes, comes back later   | fresh start                | reset when hidden (E1)
```
5 seconds: color says which team. 5 minutes: one tap narrows, the dot and count keep the
rest in view. Long term: the same colors as the office floor.

### Pass 4: AI slop: 8/10 -> 8/10
Mode: OPERATE (app UI). No hard rejection: the cards are the interaction (each holds a
reply), no side stripes (owner, 2026-09-30, "No side rule"), no gradients, no icon tiles.
Litmus: brand in first screen yes (the office's own department colors); one anchor yes (the
open card); scannable by titles yes; one job per section yes; cards necessary yes; motion
none added; premium without shadows yes (fills carry the grouping). No issues found.

### Pass 5: Design system: 7/10 -> 9/10
New component: the department chip, a variant of the 7.20 count chip at 28 px. New token:
`wash` per family (3.4). Foundations chip follows the area (3A). DESIGN.md 7.8 gets the fill,
chip ring, chip row, count line and dot; 3.4 the wash table; 7.20 notes the shared chip.

### Pass 6: Width and accessibility: 6/10 -> 8/10
Widths: 420 px default, 320 px minimum, chips wrap (4A), so the pinned area grows on narrow
columns (accepted). Keyboard: chips are buttons in a `role="group"` labelled "Show one
department", Tab order, Enter or Space toggles, `aria-pressed`. Screen readers: card
`aria-label` carries the department; the dot is "new since you picked" in the chip label;
the count line is `role="status"`. Contrast: as measured; picked state by `m` fill.
Kept below 10: the pinned row can take about 80 px at 320 px wide (owner's 4A).

### Pass 7: Unresolved design decisions
None. The Team chip uses `studio.dept.team` ("Team"); the dark sticky shadow uses the dark
`shadow-sm`.

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope: Ask me board   |
  | Step 0               | 6/10; focus: all 7 passes                   |
  | Pass 1  (Info Arch)  | 6/10 → 8/10 after fixes                     |
  | Pass 2  (States)     | 6/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 7/10 → 8/10 after fixes                     |
  | Pass 4  (AI Slop)    | 8/10 → 8/10 after fixes                     |
  | Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 6/10 → 8/10 after fixes                     |
  | Pass 7  (Decisions)  | 6 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 1 generated (HTML), direction approved      |
  | Decisions made       | 6 added to plan                             |
  | Decisions deferred   | 0                                           |
  | Overall design score | 6/10 → 8/10                                 |
  +====================================================================+
```

NOT in scope (design): a fixed chip order (owner chose 1B); a one line scrolling chip row
(owner chose 4A).

What already exists (design): the 7.20 count chip, the 3.4 families, `PersonAvatar` ring,
7.27a foundations card, `studio.dept.*` names.

Unresolved Decisions: none.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Needs you, Ask me board | /Users/moblizeit/Documents/GitHub/personal/dontbemichael/.claude/worktrees/local-instance-version-de4202/docs/designs/ask-me-department-colors-mockup.html | washes, accent chip ring, pinned chip row and count line, dot on a new arrival | HTML and CSS with app tokens (owner rule); updated with D2, D3, 1B, 2A, 3A, 4A |

## Implementation Tasks (design additions to the eng list)

Synthesized from this review's findings. Each task derives from a specific finding above.
Run with Claude Code or Codex; checkbox as you ship. These extend eng T2, T3 and T5.

- [x] **T7 (P1, human: ~3h / CC: ~10min)** — filter core — foundations card department from `jobsAsking(id)` (asker's area when shared, else first); "new since you picked" set per department, cleared by picking it or Show all
  - Surfaced by: design D2, D3, 2A
  - Files: src/renderer/src/components/askMeFilter.ts
  - Verify: unit tests: bank question is finance; a shared question takes the asker's area; an arrival while filtered marks its department; picking clears it
- [x] **T8 (P1, human: ~4h / CC: ~15min)** — chip row and cards — 28 px chips with `m` fill when picked, first appearance order, wrap, row kept while picked, dot, one count string with plurals, "Showing every team" on auto clear, tags with a `line-2` ring, foundations chip ring and label by area
  - Surfaced by: design 1B, 2A, 3A, 4A and the decided mechanics
  - Files: src/renderer/src/components/AskMeTab.tsx, the chip row component, src/renderer/src/components/FoundationCard.tsx, src/renderer/src/i18n/locales/en.json, ar.json, zh-CN.json
  - Verify: source checks; no dashes in copy; screenshot both themes against the mockup
- [x] **T9 (P2, human: ~1h / CC: ~5min)** — docs — DESIGN.md 7.8 chip row, count line, dot and foundations chip; 7.20 shared chip note
  - Surfaced by: Pass 5
  - Files: branding/DESIGN.md
  - Verify: read through

## Eng review, second pass (plan-eng-review, 2026-11-05, after the design review)

Target: this plan, checked against the code for design decisions D2, D3, 1B, 2A, 3A, 4A and
the design mechanics. Scope Challenge: scope accepted as-is; complexity unchanged in kind
(same files plus the design tasks T7 to T9); structure carried from the first pass.

Verified against code (no finding):
- D2/D3 area: `jobsAsking(id)` (`shared/foundations.ts:188`) is in `@shared`, so
  `askMeFilter.ts` can use it and stay loadable in node; `FOUNDATION_JOBS` excludes `team`,
  so a raiser in Team never matches and the first area is used.
- 2A keys: every card kind has a stable key: rows `${t.id}#${index}` (`AskMeTab.tsx:164`),
  schedule `req.id` (`ScheduleRequestCards.tsx:61`), Work style `decisionId(offer.key,
  offer.agentId)` (`WorkStyleUpdateCards.tsx:70`), mail `p.id` (`MailProposalCards.tsx:19`).
  "New since you picked" = keys not in the snapshot taken at pick time.
- 3A: `FoundationCard` already takes `chipStyle` (`AskMeTab.tsx:322`); the area ring goes
  through it, and the chip's label needs one more prop.
- Picked chip on `m`: text `ink` 9.78 light / 6.30 dark lowest, `ink-2` 5.24 / 4.76.

Findings (all decided as small mechanics under the owner's 2026-10-27 rule; each serves an
approved outcome):
1. [INFORMATIONAL] (confidence: 8/10) src/renderer/src/components/AskMeTab.tsx:284-286 —
   schedule, Work style and mail cards render above every question, whatever their time.
   1B "first appearance" therefore means the board's top to bottom order (those three lists,
   then the rows), not timestamps. Decided: chip order follows the rendered order.
2. [INFORMATIONAL] (confidence: 8/10) src/renderer/src/components/AskMeTab.tsx:147 —
   `cardEl.scrollIntoView({ block: 'nearest' })` ignores the sticky chip row (V6, wrapping
   per 4A), so a focused card can land under it. Decided: the scroller gets
   `scroll-padding-top` equal to the row's measured height (one ResizeObserver).
3. [INFORMATIONAL] (confidence: 8/10) plan, design mechanics ("role=status announces only
   when the pick changes") — a visible count line inside a live region announces on every
   5 s poll change. Decided: the visible line is not a live region; a separate visually
   hidden `role="status"` changes only on pick, Show all and auto clear.

Sections:
- 1 Architecture: the three findings above; no new module or boundary (`askMeFilter.ts`
  gains the area rule and the snapshot). 3 issues, decided.
- 2 Code quality: no issues found.
- 3 Tests: added to the planned file: foundations area (bank is finance; shared question
  takes the asker's area; Team asker takes the first); arrival snapshot (a key absent at pick
  marks its department; picking it or Show all clears); chip order follows rendered order;
  source checks for `scroll-padding-top` and the separate status node. 0 gaps.
- 4 Performance: a key snapshot of at most a few dozen strings. No issues found.

Outside voice: see below. Approval readiness: PASS (no new owner choice; R1 to R10, E1,
design D1 to D4 and 1B, 2A, 3A, 4A unchanged).

### Eng second pass outside voice (native fallback, Claude Plan subagent)

Codex not run (owner rule). Bounded native fallback completed inside five minutes; native
coverage only. Each finding checked against the code; each is how to build an approved
outcome, so none needed a new answer.

| # | Finding | Evidence | Disposition |
|---|---|---|---|
| W1 High | V1's `hidden` attribute cannot hide three card kinds: their sections set inline `display: 'flex'` and global.css has no `[hidden]` rule | `ScheduleRequestCards.tsx:66`, `WorkStyleUpdateCards.tsx:80`, `MailProposalCards.tsx:76` | Applied: each card component takes a `hiddenIds` set and sets inline `display: 'none'` on those sections; a unit test in node cannot see this, so a source check asserts the `display: 'none'` branch in all four components |
| W2 Medium | Two definitions of the 2A dot (snapshot vs per department set) | plan, eng second pass and T7 | Applied: one set per department; a key absent from the pick time snapshot marks its department; picking that department clears only its set; the picked department's own arrivals are never marked; Show all and the E1 reset clear every set |
| W3 Medium | 3A left R3, R10 and the chip fill stale | `AskMeTab.tsx:322`, `props.tsx:99` | Applied: on foundations cards the chip's fill (`l`) and ring (`acc`) follow the area; the avatar inside keeps its own look; R3 and R10 updated |
| W4 Medium | "Showing x of y" had no y matching the pill | `useNeedsYou.ts:125-137` | Applied: y is `feed.count` (the pill's number), x is y minus the hidden cards; reports and notices stay visible and are in neither number |
| W5 Medium | The pill's no target focus can pick a hidden open card | `AskMeTab.tsx:144-145`, `FoundationCard.tsx:287` | Applied: the selector skips hidden cards, and an open card that becomes hidden hands "open" to the first visible card |
| W6 Low | `aria-label` on a plain span is ignored | `FoundationCard.tsx:292` | Applied: the department words go in the card's group label and in visually hidden text beside the name |
| W7 Low | 4A height understated | 9 chips of 28 px at 320 px wrap to about 3 lines | Corrected: about 96 px of chips, about 115 px with the count line [estimated]; measured in the mockup before DESIGN.md is written |
| W8 Low | The shared question's asker looked up in `agents` only | `AskMeTab.tsx:316` | Applied: agents then restorable, as eng finding 3 (R10 cell updated) |

Second pass totals: Architecture 3 issues (decided), Code quality 0, Tests 0 gaps, Performance
0; outside voice 8 findings, all applied. Unresolved: 0. Critical gaps: 0.

## Implementation Tasks (eng second pass additions)

Synthesized from this review's findings. Each task derives from a specific finding above.
Run with Claude Code or Codex; checkbox as you ship. These refine eng T3 and design T7, T8.

- [x] **T10 (P1, human: ~2h / CC: ~10min)** — hiding and focus — `hiddenIds` with inline `display: 'none'` in all four card components; focus selector skips hidden cards; a hidden open card hands "open" to the first visible; `scroll-padding-top` from the chip row's measured height; visually hidden status node changed only on pick, Show all and auto clear
  - Surfaced by: eng second pass findings 2 and 3; W1, W5
  - Files: src/renderer/src/components/AskMeTab.tsx, src/renderer/src/components/FoundationCard.tsx, src/renderer/src/components/ScheduleRequestCards.tsx, src/renderer/src/components/WorkStyleUpdateCards.tsx, src/renderer/src/components/MailProposalCards.tsx
  - Verify: source checks for each `display: 'none'` branch, the selector and the status node; manual check in the app with a filter on
- [x] **T11 (P1, human: ~2h / CC: ~10min)** — filter rules — chip order from the rendered order; per department arrival sets (W2); y = `feed.count`, x = y minus hidden (W4); foundations chip fill and ring by area (W3); asker lookup in agents then restorable (W8)
  - Surfaced by: eng second pass finding 1; W2, W3, W4, W8
  - Files: src/renderer/src/components/askMeFilter.ts, src/renderer/src/components/AskMeTab.tsx
  - Verify: unit tests for each rule in test/askme-department-colors.test.cjs

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 3 proposals, 2 accepted, 0 deferred |
| Outside Review | native fallback (Claude Plan subagent), CEO and two eng phases; Codex not run by owner rule | Independent 2nd opinion | 3 | unavailable (native completed) | CEO: 9 native findings, 9 resolved. Eng 1: 8, 8 resolved. Eng 2: 8, 8 resolved; 0 unresolved; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | ISSUES OPEN | 3 issues, 0 critical gaps (second pass; all decided and mapped, nothing unresolved) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 6/10 → 8/10, 6 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan review (CEO and both eng phases): unavailable, owner rule keeps Codex to the DeepSeek adversarial diff pass; native Claude Plan subagent completed all three (9, 8 and 8 findings). Design phase: an independent Claude design reviewer completed (8 findings). No external coverage.
- **VERDICT:** CEO + DESIGN CLEARED. Eng ISSUES OPEN: the second pass found 3 issues, all decided and mapped to tasks; 0 unresolved, 0 critical gaps. eng review required

NO UNRESOLVED DECISIONS
