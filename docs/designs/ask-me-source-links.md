# Source links on Ask me cards and owner messages

Status: built on the running branch (2026-11-08), after CEO and eng reviews. Owner request, with the Masa Global card as the example.

## The problem

The owner's request (2026-11-08): "when agent is talking about changes from a page, email etc. they
should show the link always. it is super important to have the source links etc as business owner
do not want to spend time manually looking or searching for more info when agent already did the work."

The example card: "May Ryan take the Mark McCulloh testimonial off our HubSpot consulting page?",
with a second question about "the Masa Global post and case study". It has no link to the page,
the post or the case study, and its reason, "Nobody in the office has any record of Masa Global",
doesn't say where the team looked. The member had already opened every one of those, but the
owner has to find them again by hand.

Doing nothing costs the owner a search for every card about an outside thing, and leaves "no
record" claims impossible to check.

## What already exists

| Piece | Where | Reused? |
|---|---|---|
| Email links: a mail read returns `[Dana Ortiz, 27 Oct](email:<mailbox>/<Message-ID>)`, and the card shows an Email chip that opens the email in an office tab | `src/shared/emailLink.ts`, `src/renderer/src/markdown/EmailChip.tsx` | Yes, as one kind of source |
| Michael's ask rule: an ask built on an email keeps its link; each link reads as a few words naming what opens | `src/main/hive.ts` (Michael protocol, "Write the ask short") | Widened to every source |
| Member rule: put the email's link in any message about it; a document made from an email or file gets a Source line | `src/main/hive.ts` member instructions; `docs/designs/source-attachments.md` | Widened to every source |
| Check: an open ask about an email with no `email:` link is listed for Michael each turn (`no-email-link`), with a `noEmail` way out | `src/shared/ownerRequests.ts` `askMissesEmailLink`, `STUCK_HEADS['no-email-link']` | Generalized into the source check |
| Card text renders markdown: web links by name, `email:` links as chips, full file paths as file chips that main checks | `src/renderer/src/components/FileChip.tsx` (`FileText`), `MarkdownPreview` | Yes, the Sources row uses the same chips |
| Web links open only for `http(s)` through main | `src/main/index.ts` (`shell.openExternal` behind a scheme test) | Yes |
| File path shapes (`/…`, `~/…`, `C:\…`) recognised in shared code; main checks the folder when a file chip is opened | `src/shared/askFiles.ts` (`isAbsolutePathText`, `isFileSpan`), `fs:openAskFile` | Yes, for file sources |
| Unit counting for clipped text | `src/shared/cutText.ts` (`clipUnits`, the units `cardText` uses) | Yes, for labels |

Nothing today asks for a link to a web page, a post, a CRM record, a document or a chat thread,
and nothing records where the team looked before saying something wasn't found.

## Decisions (CEO review, 2026-11-08)

D2 was the review mode question (Selective expansion), not a scope decision.

| ID | Decision | Answer |
|---|---|---|
| SRC-1 | Rules for every source (members keep the link, Michael keeps it on the card, the email check widens to every source) **plus a Sources row**: each ask carries a short list of sources the card shows as chips under the question | Owner chose "A plus a Sources row on cards" (D1) |
| SRC-2 | Michael's replies to the owner, standups and report cards carry links the same way; report cards get the same Sources row | Add (D3) |
| SRC-3 | Link builders for connector records that come with only an id (HubSpot first) | Deferred to TODOS.md (D4) |
| SRC-4 | An ask that says nothing was found shows where the team looked ("Looked in: ...") | Add (D5) |
| SRC-5 | "Read 2 days ago" on each source | Skipped (D6) |
| SRC-6 | A source may carry the one quoted line it backs up | Deferred to TODOS.md (D7) |

## Design

### The data: `sources` on an ask or report entry

An ask or report entry in a card's `humanQA` (and a member's triage filing) may carry:

```json
"sources": [
  {"label": "Our HubSpot consulting page", "url": "https://example.com/hubspot-consulting"},
  {"label": "The Masa Global case study", "url": "https://example.com/case-studies/masa-global"},
  {"label": "Dana Ortiz, 27 Oct", "url": "email:<mailbox id>/<Message-ID>"},
  {"label": "Q3 pricing sheet", "url": "/Users/<owner>/Office/Sales/q3-pricing.xlsx"},
  {"label": "HubSpot companies and contacts", "searched": true},
  {"label": "The sales mailbox", "searched": true}
]
```

An entry is one of three kinds:

| Kind | Fields | Shown as | Counts for the check |
|---|---|---|---|
| Link | `label`, `url` | a chip that opens it | yes |
| Named only | `label` and `id`, no `url` (a CRM record a tool gave only an id for, until SRC-3) | plain text in the row, such as "Masa Global · HubSpot company 1234" | yes, only with a non-empty `id`; a label alone doesn't count |
| Searched | `label`, `searched: true` | in the "Looked in" line | for the not-found check only |

- `url` is one of three things:
  - `https://` or `http://`: a web page, or a record's own page;
  - `email:`: from a mail read, valid only when `parseEmailHref` (`emailLink.ts`) reads it, and
    marked rejected otherwise;
  - a full file path: `/…`, `~/…` or `C:\…`, the shapes `askFiles.ts` already recognises. A folder
    path counts too, and opens as folder chips do today.

  Shared code checks only the shape. Main checks the folder when the chip is opened, as file chips
  do today: a file outside every office folder reads Not found, and nothing opens.
- An entry with both `url` and `searched: true` is read as a link.
- One shared reader, `sourcesOf(entry)` in a new `src/shared/askSources.ts`, is used by the card,
  the checks and tests. It never throws:
  - it skips entries that aren't objects, or whose label is empty once trimmed;
  - it clips a label to 60 units with `cardText` (`askMeRouting.ts`, the same clip and "…" card
    titles use) instead of dropping it;
  - it marks a `url` with any other scheme (`javascript:`, `data:`, `file:`, a relative path), or
    longer than 2,048 characters, as `rejected`. The label still shows as plain text, but the entry
    doesn't count for the check, so a card whose only source was rejected is still flagged;
  - it drops duplicates: links by `url`, the others by their label in lower case.

  It keeps at most 6 links or named-only entries and 6 searched places, in the order given.
- A web chip shows its site as the hostname without `www.`, written in punycode, so a lookalike
  domain can't pass for a real one.
- The row leaves out a file the card's words already show as a chip (the question, its parts and
  its options; `sourcesBesideText`), so the draft to approve shows once (owner, 2026-11-10). Only
  the row changes: the checks still count the file. A file chip in the row shows its label, like
  "First email to Emily, 26 Oct", in place of the file name, which stays in its tooltip.

```
  member reads page / record / email / file
          |
          v
  triage filing  ── "sources": [...]  ──>  Michael checks and releases the card
                                              |
                                              v
                       humanQA entry: q, options/parts, sources
                                              |
              +-------------------------------+-------------------------------+
              v                                                               v
  Ask me card: question text,                            ownerRequests check each turn:
  Sources row (chips), Looked in line,                   names an outside thing with no usable
  then the answer fields                                 source?  says "not found" with no
                                                         searched place?  -> listed for Michael
```

### The card (SRC-1, SRC-2, SRC-4)

- A Sources row sits once per entry, right under the entry's question text and above the options.
  On an entry with several questions (`parts`), it sits above the first one. It shows on open asks
  and reports in `AskMeTab.tsx`, and on answered entries where the card's history is drawn in
  `TasksKanban.tsx` (task detail, reached from "View answers"), since the links stay useful later.
  One shared `SourceRow` component serves both. History is part of SRC-1 and SRC-2: the owner asked
  for links "always", and an answered card is where they look back. It holds one chip per link:
  - a web link shows its label, then its site's name in muted text ("Our HubSpot consulting page ·
    example.com"), so a label can't hide where it goes;
  - an `email:` link is the existing Email chip;
  - a file is the existing file chip, checked by main as today.
- Searched places read as one muted line under the chips: "Looked in: HubSpot companies and
  contacts, the sales mailbox".
- The row shows when the entry has any source the reader kept, of any kind. A rejected link shows
  as its label in plain text, so the owner still sees what it named. With nothing kept, there is no
  row: no empty state, label or explanation. Report cards (notices) get the same row.
- A link in the question text keeps working as today, so cards made before this change still read
  the same.

### The rules (SRC-1, SRC-2, SRC-4)

Team members (shared instructions and the triage filing format):
- Keep the link of anything your work rests on: a web page's address, the link a tool gave for a
  record, the `email:` link from your mail read, a file's full path.
- A filing about something outside the office lists each one in `"sources"`. When you say something
  wasn't found, list where you looked as `{"label": "...", "searched": true}`.
- Never shorten or rewrite a link, and never use a tracking link in place of the page itself.
- A tool that gave no web address for a record: write `{"label": "<the record's name>", "id":
  "<where it lives and its id, like HubSpot company 1234>"}`, with no `url` (SRC-3 adds link
  builders later).

Michael (the ask rules in his protocol):
- An ask or report about something outside the office (a web page, a post, a CRM record, a document,
  a file, an email, a chat thread) lists each one in `"sources"`. Copy them from the filing, and ask
  the member for any that are missing. There are three shapes:
  - `{"label": "...", "url": "..."}` for a link;
  - `{"label": "...", "id": "..."}` for a record with no link;
  - `{"label": "...", "searched": true}` for a place the team looked.
- An ask that says nothing was found lists where the team looked.
- Folding a filing into a card, or several asks into one, keeps every source on the ask that stays,
  without duplicates and within the caps.
- A scheduled report built from a connector (a QuickBooks money summary, say) names the report it
  read as `{"label": "<the report>", "id": "<connector, report and period>"}`. That lets it pass the
  check every run without a link.
- This replaces the email-only line. The `email:` link may still sit in the text beside the words
  naming the email.
- SRC-2: anything Michael writes the owner about an outside thing (replies in the owner's
  conversation, standups, summaries) names it with a link, like
  `[our HubSpot consulting page](https://...)`.

### The check (widening `askMissesEmailLink`)

`askMissesSource(entry, since)` replaces `askMissesEmailLink`. It reads the same fields the email
check reads today (`askWords`): the entry's `q`, each part's `q`, and the option labels. It doesn't
read the card's `description`. It flags an open ask or an open report when all of these hold:
- it was asked since the source checks started. That date is saved on first run after this ships
  (`sourcesSince`, kept beside the leftovers date), so cards made before it are never listed. The
  email check keeps its own date for the asks it already covered;
- it isn't a foundation card, and it isn't marked `noSource: true` (`noEmail: true` is still read
  the same, for cards made before);
- its text points at something that already exists outside the office:
  - the email words used today;
  - "case study", "testimonial", "review on", "listing";
  - "page" after "our", "their", "your" or "the", with at most three words in between ("our
    HubSpot consulting page"), plus "website" and "on our site";
  - "the post", "their post" or "our post" (not after "new" or "a"), plus "the article" and "the
    thread";
  - "in HubSpot", "in Salesforce", "in QuickBooks" (a connector by name);
  - "the record", "the invoice", "the document" and "the sheet". "For the record" and "on record"
    don't count.

  Bare "message", "file", "doc", "site" and "post" don't count, so asks to send or publish
  something new aren't flagged. The old check's rule against words for sending new mail is kept.
- it has no usable source: no Link entry and no Named only entry with an `id` in `sources`, and no
  link in its text. In the text, these count:
  - a markdown link to `https://`, `http://` or `email:`;
  - a bare `https://` address;
  - a file path `askFiles.ts` recognises.

`askClaimsUnsearched(entry, since)` has the same gates (`sourcesSince`, not a foundation card) and
its own way out, `noSearch: true`. It flags these phrasings when the entry lists no searched place:
- "nobody" or "no one", followed within 30 characters by "record", "knows" or "has heard" (this
  catches "Nobody in the office has any record of Masa Global");
- "no record of";
- "couldn't find" and "could not find";
- "no trace of";
- "we found nothing". "Not found" and "nothing on" are left out because they show up in harmless text ("page not
found", "nothing on the calendar").

Both run over open asks (`openAskIndexes`) and open reports (`openReportIndexes`). Reports sit on
cards in any status (often Done), so `asksToTidy` reads open reports before its "no open ask, skip
the card" step.

The two kinds are `no-source` and `no-search`. `no-email-link` is retired: `askMissesSource`
covers email asks too. To keep asks from before the change unlisted, an email ask counts from the
old checks date, and every other ask from `sourcesSince`. Each kind goes in all three places in
`src/shared/ownerRequests.ts`:
- the `StuckCard['issue']` type;
- `STUCK_HEADS`, worded like `no-email-link` and naming the `noSource` and `noSearch` ways out;
- the order list in `stuckCardsContext`.

The checks read English words only; the rule covers other languages.

### Every rule site to edit (`src/main/hive.ts`)

| Site (line at 95118322) | Change |
|---|---|
| Michael's Ask me rule, "Every question for the owner goes on the Ask me board" (419) | Replace both email-only link sentences with the sources rule; reports carry `"sources"` too |
| Michael's notice-to-report rule (426), "then the email's link" | Reports carry `"sources"`; replace the email-only wording |
| Michael's owner conversation rule, "The owner can also ask you things directly" (435) | SRC-2: name outside things with a link |
| Michael's scheduled report shape (439) | Reports carry `"sources"`; a connector report names what it read with an `id` |
| Michael's scheduled run rule (438), which covers standups | SRC-2: standup and summary lines link what they name |
| Member filing rule in `teamMemberInstructions` (479) | Add `"sources"` to the filing shape, plus the keep-the-link and where-you-looked rules |
| Protocol, "Write the ask short" (6743) | Replace the email-only bullet with the sources and searched-place bullets |
| Protocol filing shape, "Only Michael asks the owner" (6818) | Add `"sources"` |

Find each by its quoted text; line numbers drift.

### Labels and docs

- The new locale keys (en, ar, zh-CN): the row's accessible name ("Sources"), "Looked in", and
  the chip's accessible text ("Opens <site>").
- docs/FEATURES.md gets one entry: cards open the pages, records, emails and files they talk about,
  and say where the team looked when nothing was found.

## Tests

| Test | Proves | Fails when |
|---|---|---|
| `sourcesOf` table test | The three kinds; the scheme filter; a bad `url` marked rejected with its label kept; the label clip; de-dup; the caps; `url` plus `searched` read as a link; `C:\` and `~` paths kept | Something unusable shows, or a good link is dropped |
| `askMissesSource` table test | The Masa Global card text with no sources is flagged; with a link, a Named only entry with an `id`, an inline or bare link, or a backticked path, it isn't; a Named only entry without an `id`, or only a rejected link, is still flagged; "Draft a new post" and "send the quote email" aren't flagged; `noSource` and `noEmail` opt out; an open report on a Done card is checked; an ask from before `sourcesSince` isn't | The check nags on new work or old cards, or misses a card about an existing page |
| `askClaimsUnsearched` table test | "Nobody in the office has any record of Masa Global" with no searched place is flagged, and with one it isn't; "page not found" isn't flagged; `noSearch` opts out | An absence claim slips through, or harmless text is flagged |
| Stuck-card context test | The new heads appear in Michael's turn context in order, and name the ways out | Michael never hears of a missing source |
| Card render test (the renderer test style the repo uses for AskMeTab) | `SourceRow` in both `AskMeTab.tsx` and `TasksKanban.tsx`; chips with label and site; `javascript:` never a link; the email and file chips reused; the "Looked in" line; no row when there are no sources | A label hides its site, the row shows empty, or history drops it |
| Protocol text test | Member, filing and Michael rule sites mention `sources` and searched places; the email-only line is gone | A rule site is missed |

Agent rule changes go through the behavior replay ship gate (CEO review 2026-11-07) before shipping.

## Behavior changes to approve (agent and orchestration)

| Who | Rule today | Proposed | What the owner sees |
|---|---|---|---|
| Team members | Link an email in any message about it; a Source line on documents made from an email or file | Keep and pass on the link of every page, record, post, document, file or message the work rests on; list where you looked when nothing is found | Filings and cards that open the original |
| Michael (asks) | An ask built on an email keeps its `email:` link | Every ask or report about an outside thing carries `sources`; "not found" carries where the team looked | A Sources row and "Looked in" line on cards |
| Michael (writing to the owner) | No link rule for replies or standups | Names every outside thing with a link (SRC-2). Rule only: the app checks cards, not chat | Clickable pages and records in chat and standups |
| App check | Lists asks about an email with no link | Lists asks about any outside thing with no source, and "not found" asks with no searched place | Nothing directly; Michael fixes the card |

## Build order (0I)

| Step | What the builder needs to know or decide | Human / CC |
|---|---|---|
| 1. Foundations | `sourcesOf` in `src/shared/askSources.ts`, with its table test. It reuses `cardText`, `isAbsolutePathText`, `isFileSpan` and `parseEmailHref`, and puts `new URL()` inside a try | ~3h / ~15min |
| 2. Core logic | `askMissesSource` and `askClaimsUnsearched` replace `askMissesEmailLink`; the `no-source` and `no-search` kinds go into the three places in `ownerRequests.ts`; `sourcesSince` is saved like `leftoversSince`. The surprise: open reports sit on Done cards | ~4h / ~20min |
| 3. Integration | The eight rule sites in `hive.ts`, found by their text; `SourceRow` in `AskMeTab.tsx` and `TasksKanban.tsx`; locale keys | ~5h / ~25min |
| 4. Polish and tests | A render test; a protocol text test; Arabic (right to left) host isolation; the behavior replay before ship | ~4h / ~20min |

No feasibility blockers remain.

## Review sections

### Section 1: Architecture

```
  member tools (web fetch, connector, mail read, files)
        │ link, id, email: link, path
        ▼
  triage filing JSON ──"sources"──▶ Michael (rules in hive.ts) ──writes──▶ tasks.json humanQA entry
                                                                              │
                     ┌────────────────────────────────────────────────────────┼─────────────────────┐
                     ▼                                                        ▼                     ▼
       src/shared/askSources.ts sourcesOf ◀── used by ── ownerRequests.ts checks      renderer SourceRow
       (new, pure, never throws)                         (asksToTidy, each turn)      (AskMeTab, TasksKanban)
                                                               │                            │
                                                               ▼                            ▼
                                              Michael's turn context            opens through existing paths:
                                              (no-source, no-search)            http(s) by shell.openExternal,
                                                                                email: by EmailChip in main,
                                                                                files by fs:openAskFile
```

The flow of a source, with its other paths:
- **Happy.** Every source shows as a chip.
- **Missing (`sources` absent).** No row; the check reads the text.
- **Empty (`[]` or unusable entries only).** No row, or plain labels for rejected links; the check
  flags the card.
- **Error (tasks.json unreadable).** The board read already skips the tick, as it does today.

There is no new state machine. `sourcesSince` is a saved date, written once.

Coupling: the renderer and the checks share one pure reader, and there is no new process or IPC.

Scaling: at most 12 entries per ask, read once per turn and card.

Single point of failure: none. A crash inside `sourcesOf` is ruled out because it never throws, and
its test covers garbage input.

Rollback: revert the commit. `sources` fields stay in tasks.json and old builds ignore them.

Value test: the row exists because the owner asked for it, it changes how fast the owner decides,
and it is the smallest structured version (SRC-1).

Platform: structured sources give later work an evidence trail, such as SRC-3 links, SRC-6 quotes,
and decisions or knowledge entries that cite where they came from.

Findings:
- **OK: no direct link opening.** `SourceRow` must open web links through the existing guarded
  `openExternal` path, never through `window.open` or a raw `<a target>`. Covered by T5.

### Section 2: Errors and rescue

| Codepath | What can go wrong | Rescued? | Action | Owner sees |
|---|---|---|---|---|
| `sourcesOf` | `sources` isn't an array, or entries are not objects | Y | Skipped | No row, or fewer chips |
| `sourcesOf` | `new URL()` throws on a bad address | Y (try) | Entry marked rejected | Label as plain text; Michael is told, since the card is flagged |
| `sourcesOf` | `email:` link `parseEmailHref` can't read | Y | Rejected | As above |
| `askMissesSource` and `askClaimsUnsearched` | `q`, parts or options aren't strings | Y | `askWords` ignores them, as today | Nothing |
| `sourcesSince` | The saved date is missing or unreadable | Y | Written as now on first run, like `leftoversSince` | Old cards aren't listed |
| `SourceRow` open web link | `openExternal` fails | Existing handling | No change | As today |
| `SourceRow` file chip | File gone or outside the folders | Existing (`fs:openAskFile`) | Not found | Not found |
| `SourceRow` email chip | Mailbox disconnected | Existing (`EmailChip`) | Existing message | Existing message |

No catch-alls are added, and nothing fails silently: every unusable link becomes a visible plain
label and a turn note for Michael.

### Section 3: Security and threats

| Threat | Likelihood | Impact | Mitigated? |
|---|---|---|---|
| A label hides where a link goes ("HubSpot" pointing at a lookalike domain) | Med | High | Yes: the site shows beside every web chip, in punycode |
| A phishing link from an outside email becomes a source ("Bank sign-in") | Med | High | Partly: the site shows; the existing rules require the sender's own site and no tracking links. Injection screening flags go to Michael (owner rule 2026-10-12) |
| `javascript:`, `data:` or `file:` schemes | Low | High | Yes: rejected by `sourcesOf`, and the renderer opens only through guarded paths |
| A file source pointing outside the office folders | Low | Med | Yes: main checks it on open (`fs:openAskFile`), and the chip reads Not found |
| Markdown or HTML hidden in a label | Low | Med | Yes: labels render as plain text, never as markdown (T5) |
| The app fetching or pre-checking a link (privacy or request forgery) | n/a | n/a | Not done: the app never requests a source's address |
| Prompt injection through a label into Michael's context | Low | Low | Labels are clipped to 60 units; the turn context names the card, not the label |

No new secrets, dependencies or endpoints.

### Section 4: Data flow and edge cases

```
  filing.sources ─▶ Michael copies or merges ─▶ humanQA.sources ─▶ sourcesOf ─▶ row and checks
   │ string, not an array ─▶ skipped               │ fold or merge ─▶ union, de-dup, caps
   │ 40 entries ─▶ capped at 6 links + 6 searched  │ stale page ─▶ owner opens the live page
   │ label of 300 units ─▶ clipped                 │ duplicate ─▶ one kept
   │ bad scheme ─▶ rejected, plain label           │ `email:` from a removed mailbox ─▶ existing chip error
```

There is no shared mutable state beyond tasks.json, which the board guard already orders, so there
are no async ordering concerns.

| Interaction | Edge case | Handled? | How |
|---|---|---|---|
| Click a chip | Twice | Yes | Opens twice, which is harmless |
| Row on a long card | More than 6 links | Yes | Capped; Michael's rule says at most 6 |
| Arabic interface | The site and its dots read right to left | Gap, fixed in T5 | Wrap the site in `<bdi dir="ltr">` |
| Card from before the change | No `sources` | Yes | Text links work as before; it isn't listed |
| Answered card in history | Sources still shown | Yes | `SourceRow` in `TasksKanban.tsx` |

### Section 5: Code quality

- `askMissesSource` replaces `askMissesEmailLink`, not beside it, so there is no duplicate logic.
- The trigger words are kept as named regex tables, so tests read them.
- `noEmail` stays as an alias.
- `sourcesOf` is about 60 lines, with no option flags.
- No new method branches more than 5 times. Splitting the source kinds into a small kind function
  keeps it that way.

No issues found.

### Section 6: Tests

The tests are in the plan's Tests table, and their coverage was approved with the plan. Added here
within that coverage:
- the Masa Global card run end to end, through `asksToTidy` to `stuckCardsContext`;
- garbage `sources` (a string, numbers, 40 entries) in the `sourcesOf` table;
- the Arabic site isolation in the render test.

| Behavior | Assertion | Rejects | no_claim |
|---|---|---|---|
| Sources show | Chip label, site and open path | A label with no site; a `javascript:` link | Real browser opening (renderer test, opener stubbed) |
| Missing source listed | `no-source` for the Masa Global text | A silent pass | Whether Michael acts on it (agent behavior; the behavior replay covers that) |
| No nagging on new work | "Draft a new post" isn't flagged | A false flag | Other languages (English words only) |
| Absence claims | `no-search` without a searched place | A pass with no places | Whether the places named were really searched |

- **2am test:** the end-to-end Masa Global case.
- **Hostile QA:** a label of "HubSpot" pointing at a lookalike domain shows the real site.
- **Chaos:** garbage `sources`.

There are no time or random dependencies: `sourcesSince` is passed in. The agent rule changes need
the behavior replay ship gate.

### Section 7: Performance

Regexes run over short text once per card per turn, and the reader is capped. Nothing is cached or
fetched. No issues found.

### Section 8: Observability

- What tells you it works: cards show rows, and Michael's turn context lists `no-source` and
  `no-search` until they're fixed.
- What tells you it's broken: the same list growing without being cleared.
- No new log kinds, so `failureReport` classification is unchanged.
- Debugging a report three weeks later: tasks.json holds every entry's `sources` as written.

No gaps found.

### Section 9: Deploy and rollout

- No migration. `sourcesSince` is written on first run, so no backlog floods Michael.
- New rules reach Michael and members as their instructions regenerate at spawn. Members started
  before the update keep the old rules until they restart.
- Windows ships every release; `C:\` paths are in the reader test.
- Before ship: the behavior replay ship gate for the rule changes, and the full suite.
- After deploy, check that a new card about a web page shows the row, and that an old card isn't
  listed.
- Rollback: revert. Data written meanwhile stays harmless.

### Section 10: Long term

- **Reversibility:** 4/5. The data field outlives a revert, harmlessly.
- **Debt:**
  - the checks read English words only (as the email check does today);
  - SRC-3 and SRC-6 are deferred.
- **What comes next:** SRC-3 record links, SRC-6 quotes, and decision history that cites sources.
- **The cherry-picks:** SRC-2 and SRC-4 were the right ones. The deferred SRC-3 isn't needed by the
  accepted items, since Named only covers it.

### Section 11: Design and UX

```
  card ─▶ bold question ─▶ [ Sources row: chip · site | email chip | file chip ] ─▶ Looked in: … ─▶ options ─▶ answer
                               │ none kept ─▶ (no row)
                               │ rejected only ─▶ plain labels
                               │ file gone ─▶ Not found
```

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Sources row | Email and file chips as today | No row | Not found or a plain label | Chips | Some chips, some plain labels |

- **Order on the card:** the question, then the evidence, then the answer.
- **Wording:** no visible "Sources" heading (the less-verbose-UI rule); the heading is only the
  accessible name.
- **Accessibility:** chips are focusable, each chip's accessible text names its site, and the site
  is isolated for right-to-left text.
- **Detail:** the site in muted text beside each label.

Consider /plan-design-review for a mockup of the row before building. Mockups are HTML and CSS only.

## NOT in scope

| Item | Answer | Why |
|---|---|---|
| SRC-3: link builders for connector records | Deferred (D4), in TODOS.md | Formats need checking per service |
| SRC-5: read time on chips | Skipped (D6) | Fewer words on cards |
| SRC-6: a quoted line per source | Deferred (D7), in TODOS.md | Ship links first |
| App-recorded reading history (option C of D1) | Not chosen (D1) | Noisy; ties tool calls to cards by guesswork |
| An app check on chat replies and standups | Not in SRC-2 | Rule only, as the owner approved |

## Dream state delta

Today, cards name pages and records with no way to open them. This plan gives every card a fixed
row that opens what it rests on, and says where the team looked. The 12-month ideal is every claim
traceable with no effort from members. That still needs SRC-3 link builders, and, if members prove
unreliable, the app recording what it read.

## Failure modes

| Codepath | Failure mode | Rescued? | Test? | Owner sees | Logged? |
|---|---|---|---|---|---|
| `sourcesOf` | Garbage input | Y | Y | Fewer chips | n/a |
| `sourcesOf` | Bad scheme or address | Y | Y | Plain label | Michael's turn |
| Checks | Member forgets a link | Y | Y | Fixed card after Michael asks | Michael's turn |
| Checks | Non-English card | N (rule only) | N | Card may lack links | No |
| Checks | Phrase not in the trigger list | N (rule only) | Partly | Card may lack links | No |
| `SourceRow` | Lookalike domain | Y (site shown) | Y | Real site | n/a |
| Rules | A member started before the update | N until restart | N | Old behavior | No |

No CRITICAL GAP: every unrescued row is visible to the owner on the card, not silent.

## Implementation Tasks

- [ ] **S1 (P1, human: ~3h / CC: ~15min)**: shared reader. Build `sourcesOf` with its three kinds,
  caps, scheme and email checks and clipped labels, plus the table test with garbage input.
  - Surfaced by: Section 2, rows 1 to 3.
  - Files: `src/shared/askSources.ts`, `test/ask-sources.test.cjs`.
  - Verify: `node --test test/ask-sources.test.cjs`.
- [ ] **S2 (P1, human: ~4h / CC: ~20min)**: checks. Add `askMissesSource` and `askClaimsUnsearched`,
  retire `no-email-link`, check open reports, and save `sourcesSince`.
  - Surfaced by: the plan's "The check" section; Section 4.
  - Files: `src/shared/ownerRequests.ts`, `src/main/hive.ts`, the existing email-link check test.
  - Verify: the check tables plus the end-to-end Masa Global test.
- [ ] **S3 (P1, human: ~3h / CC: ~15min)**: rules. Edit the eight rule sites for members and Michael,
  including SRC-2 and the searched places.
  - Surfaced by: the plan's rule-site table; the behavior changes table.
  - Files: `src/main/hive.ts`, protocol text tests.
  - Verify: the protocol text test, then the behavior replay ship gate.
- [ ] **S4 (P1, human: ~4h / CC: ~25min)**: `SourceRow`. Build it with chips, sites, the "Looked in"
  line, plain labels and isolation for right-to-left text, in `AskMeTab` and `TasksKanban`.
  - Surfaced by: Sections 3, 4 and 11.
  - Files: `src/renderer/src/components/SourceRow.tsx`, `AskMeTab.tsx`, `TasksKanban.tsx`, the
    locales (en, ar, zh-CN).
  - Verify: the render test, and look at a card in the dev app.
- [ ] **S5 (P1, human: ~1h / CC: ~5min)**: security. Open web chips only through the guarded
  `openExternal` path, and render labels as plain text.
  - Surfaced by: Sections 1 and 3.
  - Files: `SourceRow.tsx`.
  - Verify: the render test asserts no raw link target and no markdown in labels.
- [ ] **S6 (P2, human: ~1h / CC: ~5min)**: docs. Add the FEATURES entry, list the behavior changes in
  the CHANGELOG at ship, and update the design doc's status.
  - Surfaced by: the plan's "Labels and docs" section.
  - Files: `docs/FEATURES.md`, `docs/designs/ask-me-source-links.md`.
  - Verify: read through.

## Reality rows

REALITY: premise-table pass email link rule, check and chips exist; no rule covers pages or records (grep); unverified=2 (member had opened the example pages; HubSpot tools return ids only) src/shared/ownerRequests.ts:487
REALITY: already-done pass only the email link work and the document Source line landed since 2026-11-01, both reused a2b55eee
REALITY: surface-check pass cardText, isAbsolutePathText, isFileSpan, parseEmailHref, openReportIndexes, leftoversSince all exist src/shared/emailLink.ts:80
REALITY: binding-decisions pass follows less-verbose UI, Michael orchestrates, reuse orchestrator, highlight behavior changes; nothing overruled is reintroduced src/main/hive.ts:419
REALITY: numbers pass caps (6 links, 60 units, 2048 characters, 30 character gap) are design values [estimated]; file counts [estimated] src/shared/askMeRouting.ts:54
REALITY: deferred-asks pass no linked issue; the owner's request is covered except SRC-3 and SRC-6, deferred by answer TODOS.md:3
REALITY: pr-count pass one change on the running branch, per the one-running-branch rule docs/designs/ask-me-source-links.md:1

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | Email links exist end to end; no rule or    |
  |                      | check covers pages, records, posts or files |
  | Step 0               | D1 chose A plus a Sources row; 3 of 5       |
  |                      | proposals accepted, 2 deferred, 1 skipped   |
  | Section 1  (Arch)    | 1 issue found (guarded opening, S5)         |
  | Section 2  (Errors)  | 8 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 7 issues found, 2 High severity, mitigated  |
  | Section 4  (Data/UX) | 5 edge cases mapped, 1 unhandled (RTL, S4)  |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 2 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 2           |
  | Section 11 (Design)  | 2 issues (RTL site, plain labels)           |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 8 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 7 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 2 items (SRC-3, SRC-6)                      |
  | Scope proposals      | 5 proposed, 2 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex: unavailable (owner rule)             |
  | Lake Score           | 0/1 (D1: owner chose B, 9/10, over C)       |
  | Diagrams produced    | 4 (architecture, data flow, card flow,      |
  |                      | shadow paths)                               |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY pass), 2 unverified |
  +====================================================================+
```

Approval readiness: PASS. The checked rows and their answers:
- SRC-1: D1 "A plus a Sources row on cards";
- SRC-2: D3 "Add";
- SRC-3: D4 "Defer";
- SRC-4: D5 "Add";
- SRC-5: D6 "Skip";
- SRC-6: D7 "Defer";
- the documents: approved, "Approve and continue".

## Unresolved Decisions

None.

## Engineering review (2026-11-08)

Target: this plan, checked against the code at 95118322. Scope: accepted as is. About 12 files and
two new modules, so the complexity check fired. The arrangement (a new `src/shared/askSources.ts`
and a new `SourceRow.tsx`) is kept by the owner's standing rule that file layout is decided, not
asked. Both new modules own one thing each: reading sources, and drawing them.

### Scope challenge

| Sub-problem | Already solved by | Plan reuses it? |
|---|---|---|
| Open a web link safely | `isExternal` (`src/renderer/src/markdown/mdLinks.ts:30`) and `window.cth.openExternal`, which main allows only for http(s), mailto and two settings schemes (`src/main/index.ts:7880`) | Yes (S5) |
| Show the real site beside a label | `linkName`, `labelMismatch` and `stripWww` in `mdLinks.ts:202`, tested in `test/link-names.test.cjs` | **Not named in the plan: E1** |
| Email chip, file chip and folder chip | `EmailChip.tsx`, `FileChip.tsx`, `fs:openAskFile` | Yes |
| A start date saved once | `leftoversSince` (`src/main/hive.ts:4832`), in the private root | Yes, for `sourcesSince` |
| Reading ask text for checks | `askWords` (`src/shared/ownerRequests.ts`) | Yes |

Minimum change: everything in the plan is needed for the approved scope, and nothing can be put off
without breaking a decision. The TODOS check finds that the "Wider phrasings for the two card checks"
item overlaps the new trigger words. This change retires the email check's phrasing list, so that
item should be re-read when this lands (E5).

### 1. Architecture

```
  src/shared/askSources.ts (new: sourcesOf, kinds, caps; pure)
      ▲                         ▲
      │                         │
  src/shared/ownerRequests.ts   src/renderer/src/components/SourceRow.tsx (new)
  askMissesSource,              ├─ web:   linkName / stripWww (mdLinks.ts) ─▶ window.cth.openExternal ─▶ main app:openExternal (scheme gate)
  askClaimsUnsearched,          ├─ email: EmailChip ─▶ main parses the link again
  asksToTidy, STUCK_HEADS       └─ file:  FileChip ─▶ fs:openAskFile (folder check)
      ▲                              ▲                     ▲
  src/main/hive.ts                AskMeTab.tsx:563     TasksKanban.tsx:615
  (sourcesSince, rule text)       (open ask, report)   (card history)
```

- **Second shape.** A second shape was considered: the sources live in `askMeRouting.ts` beside
  `readAskShape`, and the row is drawn inside `FileText`. It was rejected. `FileText` is the
  markdown body renderer, so a row inside it would tie source policy to text rendering, and every
  `FileText` caller (file tabs, results) would carry it. The chosen shape hides kinds, caps and
  schemes behind one function, `sourcesOf`, and one component.
- **Red flags.**
  - Hand-synced list: the trigger words and the rule text could drift. Fixed by the protocol text
    test (S3).
  - Two ways to do one task: inline links and `sources`. Accepted, because old cards depend on
    inline links, and the check counts both.
- **Production failure.** Michael writes a `sources` entry with a lookalike domain. The chip shows
  the real site, and `labelMismatch` already marks a label that names another site (E1).

Findings:
- [INFORMATIONAL] (confidence: 9/10) docs/designs/ask-me-source-links.md, section "The card" says
  "a web link shows its label, then its site's name". The plan doesn't name the existing helpers
  `linkName`, `labelMismatch` and `stripWww` (`src/renderer/src/markdown/mdLinks.ts:202`). **E1:**
  `SourceRow` uses them for the site and the mismatch mark; the punycode rule lives in those helpers
  only. Auto-decided (DRY; mechanics).
- [INFORMATIONAL] (confidence: 8/10) The plan says web chips open through "the existing guarded
  `openExternal` path". Confirmed: `MarkdownPreview.tsx:155` (`if (isExternal(h)) { void
  window.cth.openExternal?.(h); return; }`), and main again at `index.ts:7880`. No change needed.

Dispositions: E1 accepted (mechanics, owner rule).

### 2. Code quality

- **Shared code.** `sourcesOf` has two callers, the checks and `SourceRow`. Site display stays in the
  renderer's `mdLinks.ts`, not copied into shared code.
- **Error handling.** `new URL()` sits inside a try (plan, Section 2 of the CEO review).
  `askClaimsUnsearched` is gated like `askMissesSource`.
- **Retiring `no-email-link`** means `test/ask-email-link.test.cjs` changes. Its rows move into the
  `askMissesSource` table, so no email case loses coverage (E2).
- **Diagrams.** Michael's stuck-card heads list (`STUCK_HEADS`) and the order list in
  `stuckCardsContext` are hand-synced today. Adding two kinds keeps them in step, and the context
  test checks both (S2).

Findings:
- [INFORMATIONAL] (confidence: 9/10) `test/ask-email-link.test.cjs`: retiring `no-email-link` would
  break this file. **E2:** port every row into the new table test, then delete the old kind's
  asserts in the same change. Auto-decided (a required regression; mechanics).

Dispositions: E2 accepted.

### 3. Tests

The framework is node `--test` over `.cjs` files that load TS through `test/load-ts.cjs`. Renderer
checks in this repo are source pins plus pure helper tests.

```
CODE PATHS                                              USER FLOWS
[+] src/shared/askSources.ts sourcesOf                  [+] Owner opens a source
  ├── [GAP→S1] link / named+id / searched kinds           ├── [GAP→S4] web chip shows label · site, opens
  ├── [GAP→S1] bad scheme, bad email: → rejected          ├── [★★ TESTED] email chip opens (EmailChip tests)
  ├── [GAP→S1] url+searched → link; label clip; dedupe    └── [★★ TESTED] file chip, Not found (ask-files.test.cjs)
  └── [GAP→S1] garbage (string, numbers, 40 entries)
[+] ownerRequests.ts askMissesSource                     [+] Michael fixes a card
  ├── [★★ TESTED] email words (ask-email-link.test.cjs) → ported (E2)
  ├── [GAP→S2] page / post / case study / connector words; "for the record" excluded
  ├── [GAP→S2] usable: link, named+id, inline, bare https, path; rejected-only still flags
  ├── [GAP→S2] reports on Done cards; before sourcesSince skipped
  └── [GAP→S2] noSource / noEmail
[+] askClaimsUnsearched                                    ├── [GAP→S2] Masa Global card ─▶ asksToTidy ─▶ stuckCardsContext [→E2E-lite]
  ├── [GAP→S2] "Nobody in the office has any record" flagged; with searched not
  └── [GAP→S2] "page not found" not flagged; noSearch
[+] hive.ts rules (8 sites)                                [+] Agent behavior
  └── [GAP→S3] protocol text pins                          └── [GAP] [→EVAL] behavior replay ship gate (members keep links, Michael fills sources)
[+] SourceRow (AskMeTab, TasksKanban)
  └── [GAP→S4] source pins: no raw anchor, labels as text, bdi site, Looked in, no empty row

COVERAGE today: 3/20 paths (15%), all from reused chips and the email check | GAPS: 17 (1 eval, 1 end to end)
```

Every gap maps to a task already in the plan (S1 to S4). The eval is the agreed behavior replay
ship gate (CEO review 2026-11-07); this review adds no new verification depth. Regression rule: the
email check's behavior is at risk, and E2 carries its contract over, row by row.

Value cards:
- Value: protects=a card about an existing page or record is listed for Michael until it links it;
  fails_when=a trigger word or the usable-source rule is weakened; why_new=no check covers non-email
  sources; seam=none; no_claim=Michael's follow-through (agent behavior)
- Value: protects=only http(s), email: and path sources open; fails_when=sourcesOf stops rejecting a
  scheme; why_new=new reader; seam=none; no_claim=main's own scheme gate (separate)
- Value: protects=old cards stay unlisted; fails_when=sourcesSince is not used or is reset;
  why_new=new date; seam=none; no_claim=none beyond protects

Tests made obsolete: the `no-email-link` asserts in `test/ask-email-link.test.cjs`, ported per E2.

### 4. Performance

`asksToTidy` runs on Michael's turn over every card. The new work is two regex passes per open ask
or report (text under about 700 characters per the ask rules), plus `sourcesOf` over at most 12
entries. The stuck list is capped at `LIST_MAX = 20` per kind (`ownerRequests.ts:28`). Nothing is
fetched, cached or written per turn, and `sourcesSince` is memoised like `leftoversSince`. No issues
found.

### Outside voice

Codex was not run. The owner's rule limits Codex to the adversarial pass, and the CEO review recorded
the same. Coverage: unavailable.

### Failure modes (added)

| Codepath | Failure mode | Rescued? | Test? | Owner sees | Logged? |
|---|---|---|---|---|---|
| Ported email rows | A row dropped in the port | n/a | Yes (E2 ports all) | n/a | n/a |
| `SourceRow` | `labelMismatch` disagrees with the shown site | Y | Yes (link-names tests) | Mismatch mark | n/a |

No critical gaps.

### Eng tasks (added to the plan's list)

- [ ] **E1 (P1, human: ~30min / CC: ~5min)**: renderer. Use `linkName`, `labelMismatch` and
  `stripWww` from `mdLinks.ts` in `SourceRow` for the site and the mismatch mark.
  - Files: `SourceRow.tsx`.
  - Verify: `test/link-names.test.cjs` still passes, and a source pin shows the import.
- [ ] **E2 (P1, human: ~1h / CC: ~10min)**: tests. Port every `test/ask-email-link.test.cjs` row into
  the `askMissesSource` table, then remove the `no-email-link` asserts.
  - Files: `test/ask-email-link.test.cjs`, the new source check test.
  - Verify: the row count is no lower than before.
- [ ] **E5 (P3, human: ~10min / CC: ~2min)**: TODOS. Re-read "Wider phrasings for the two card checks"
  against the new trigger tables when this lands.
  - Files: `TODOS.md`.
  - Verify: the item is updated or closed.

REALITY: premise-table pass every reuse claim checked against code; unverified=0 for eng claims src/renderer/src/markdown/mdLinks.ts:202
REALITY: already-done pass nothing in origin/main builds sources; only the email link work a2b55eee
REALITY: surface-check pass app:openExternal scheme gate and isExternal exist as named src/main/index.ts:7880
REALITY: binding-decisions pass file layout decided under the no-arrangement-questions rule; Codex limited to adversarial src/main/hive.ts:4832
REALITY: numbers pass LIST_MAX 20 measured; 700 character asks from the ask rule; 12 files [estimated] src/shared/ownerRequests.ts:28
REALITY: deferred-asks pass no linked issue; SRC-3 and SRC-6 deferred by owner answer TODOS.md:3
REALITY: pr-count pass one change on the running branch docs/designs/ask-me-source-links.md:1

### Eng completion summary

| Item | Result |
|---|---|
| Scope challenge | Scope accepted as is; layout kept (owner rule) |
| Architecture | 2 findings, E1 accepted |
| Code quality | 1 finding, E2 accepted |
| Tests | Diagram produced, 17 gaps, all mapped to tasks; 1 eval (behavior replay) |
| Performance | No issues |
| Outside voice | Unavailable (owner rule) |
| Failure modes | 0 critical gaps |
| Unresolved decisions | 0 |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | 5 proposals, 2 accepted, 2 deferred |
| Outside Review | `codex` plan review | Independent 2nd opinion | 0 | unavailable | Owner rule: Codex only for the adversarial pass; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 3 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Not run; the Sources row would benefit from an HTML mockup |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

- **OUTSIDE COVERAGE:** codex, plan-review (CEO and eng), unavailable (owner rule); no completed
  external review.
- **VERDICT:** CEO + ENG CLEARED. Ready to implement.

NO UNRESOLVED DECISIONS

## Change after the first build (2026-11-08)

The owner restarted the app and the Masa Global card still had no Sources row. Two gaps kept the
check from ever reaching it, so Michael was never told to add the links:

- **The start date skipped it.** The card was asked on 2026-11-06, before `sourcesSince`. The
  checks only ever read open asks and open reports, which are still in front of the owner, so the
  date hid exactly the cards the owner was looking at. `sourcesSince` is removed (with its file,
  its factory reset entry and its office move entry); the wider words count at any age. The email
  words keep their own start, `leftoversSince`, as before. On the reference office this lists two
  cards, not a flood.
- **The old `noEmail` flag silenced it.** Earlier rules told Michael to set `"noEmail": true` on an
  ask with no email behind it, and the first build read that as "nothing outside the office". The
  Masa Global ask carries it. `noEmail` now quiets only the email words; `noSource` is the way out
  for the whole check.

Behavior change: Michael is now listed older open asks and reports that name a page, record or
post with no link, or say nothing was found without saying where the team looked.
