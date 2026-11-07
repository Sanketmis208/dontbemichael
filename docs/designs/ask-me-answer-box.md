# Ask me answer box: a readable hint, and files attached on the card

Status: Built (2026-11-05), not yet seen in the running app.

## The ask

Owner, 2026-11-05, with a screenshot of the card "Twilio account suspended but still charging"
(option 2 "It showed an error" picked): "the box to write details has placeholder text cut off and
no way to read it. also in this case there should be option to attach screenshots directly from
here to send rather putting in a folder".

## What is true today (receipts)

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| P1 | The answer box grows from its value only: `el.style.height = 'auto'`, then `scrollHeight`, with `rows={1}`. An empty box is one line, so a hint longer than one line is clipped | `src/renderer/src/components/GrowingTextarea.tsx:20-24`, `:31` | verified (the owner's screenshot) |
| P2 | The hint in the screenshot is the option's `note`, written by Michael, shown as the placeholder; it vanishes once typing starts | `src/renderer/src/components/AskMeTab.tsx` (`placeholder={... pickedNote ?? ...}`); `src/main/hive.ts:415` ("picking it shows that question in the answer box") | verified |
| P3 | Reply waits for words when the picked option has a note | `AskMeTab.tsx` (`toSend = pickedNote && !draft.trim() ? '' : ...`) | verified |
| P4 | Talk to Michael already attaches: paste a screenshot, drop or pick files; files go by path as "Attached files:" lines | `src/renderer/src/shell/BottomBar.tsx:131-141`, `src/renderer/src/components/pasteAttachments.ts`, `src/shared/ownerRequests.ts:825-828` | verified |
| P5 | A pasted screenshot is saved in the app's own folder, kept 14 days, readable by agents | `src/main/pastes.ts:1-35`, `src/main/index.ts:6946-6954` | verified |
| P6 | The OS picker returns the original paths; it does not copy | `src/main/index.ts:6927-6940` | verified |
| P7 | Company foundations cards already take a file (their own route into company knowledge) | `docs/designs/foundation-card-upload.md` | verified |
| P8 | An ordinary card taking a file is a deferred TODO from that review | `TODOS.md:330-342` ("Ordinary Ask me cards take a file") | verified |
| P9 | Michael is told to put a note on an option that needs the owner's words; nothing tells him the card can take a file | `src/main/hive.ts:415` | verified |

unverified=0

## Step 0

### 0A Premise

Two real pains on the owner's only inbox. The hint carries Michael's actual question, so a clipped
hint means the owner cannot read what is being asked. And a screenshot today takes five steps
(save it, find a folder, name it, type the name, hope it is found) when the owner already has it
on the clipboard. Do nothing: the owner keeps guessing at hints and typing paths.

### 0B Existing code

| Sub problem | Reuse |
|---|---|
| Box height | `GrowingTextarea` itself (one fix serves every box that uses it) |
| Paste, drop, pick | `attachmentsFromPaste`, `window.cth.attachFiles`, `pathForFile` |
| Files in the answer | `withAttachments` (the "Attached files:" format Michael already reads) |
| Files agents can read across restarts | `pastes.ts` (the app's own folder, 14 day keep) |
| Chips with a remove control | the Talk to Michael chip (`BottomBar.tsx:198-213`) |

### 0C Dream state

```
  TODAY                          THIS PLAN                          12 MONTH IDEAL
  hint clipped; a screenshot     hint fully readable; paste,  --->  every card answers with
  is saved, named and typed --> drop or pick a file on the          words, picks and files the
                                 card, sent with the answer          way a chat does
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| A1 owner | The answer box shows its whole hint (P1) | clipped | the box grows to its hint | approved | Owner ask, 2026-11-05 (quoted above) |
| A2 owner | Files attached on an Ask me card (P4 to P8) | none | paste, drop or pick, sent with the answer | approved | Owner ask, 2026-11-05 (quoted above) |
| A3 owner | Michael's question stays readable while the owner types (P2) | placeholder only, gone once typing | a line above the box | approved | Owner D2, 2026-11-05: A. The picked option's note shows as a small line above the box while that option is picked; the box hint reads "Your answer" |
| A4 owner | Michael asks for files on the card, not saved in a folder (P9) | not told | one sentence in Michael's card rules | approved | Owner D3, 2026-11-05: A. When an ask needs a screenshot or file from the owner, Michael asks for it to be attached on the card, never saved in a folder and named; Michael only |

## Mode

HOLD SCOPE (owner D1, 2026-11-05). No new approach decision was needed.

HOLD checks: about 7 files [estimated] (`GrowingTextarea.tsx`, `AskMeTab.tsx`, `hive.ts`, three locale
files, tests, DESIGN.md, TODOS.md), no
new service. Minimum change: the box fix in the shared component; attach on ordinary Ask me cards
reusing Talk to Michael's parts; Michael's instruction. Nothing proposed for deferral.

Decided as small mechanics (owner rule 2026-10-27):
- Files go by their original path, as Talk to Michael sends them (`BottomBar.tsx:131-141`); a
  pasted screenshot is saved in the app's own folder as today (`pastes.ts`). (First decided as a
  copy into that folder; reversed after the outside voice: copies are swept after 14 days, the
  original lasts, and the copy needed a new IPC, a size cap and a name sanitizer.)
- With a file attached, Reply is enabled even when the picked option asks for words: the file is
  the answer (P3).
- Only ordinary Ask me cards (plain, options, several questions) take a file; Company foundations
  cards keep their own route (P7).

## Answered (A3, owner D2: A)
Commitment comparison:

```text
Commitment                         | Source | Current              | A Above the box          | B In the box only
Hint fully readable before typing  | A1     | approved             | yes                      | yes (box grows to it)
Michael's question while typing    | pending| gone                 | stays, a line above      | gone
Placeholder of a noted option      | pending| the note             | "Your answer"            | the note
Lines on the card                  | pending| none                 | one short line more      | none
```

Question: D2 — A3: Should Michael's question stay readable while you type?
Header: Hint
A) A line above the box (recommended)
B) Only in the box

## Answered (A4, owner D3: A)
Commitment comparison:

```text
Commitment                          | Source | Current                                   | A Tell Michael               | B Leave Michael as is
Attach on the card (paste, drop, pick) | A2  | approved                                  | same                         | same
Michael asking for a screenshot     | pending| may say "save it in your documents, name it here" | "attach it on this card" | unchanged
Michael's card rules (hive.ts:415)  | pending| no word on files                          | one sentence on attaching    | unchanged
Who changes                         | pending| none                                      | Michael only                 | none
```

Behavior change (owner rule 2026-10-12: listed as its own decision):

| Who | Rule today | Proposed rule | What the owner sees |
|---|---|---|---|
| Michael | Writes an option note asking for the owner's words; nothing says the card takes a file, so he may ask the owner to save a screenshot in a folder and name it | When an ask needs a screenshot or a file from the owner, the note or the ask says to attach it on the card (paste, drop or Add a file); never to save it in a folder and type its name | Cards that ask for a screenshot say "attach it here" |

Question: D3 — A4: Should Michael tell you to attach files on the card instead of saving them in a folder?
Header: Michael
A) Tell Michael (recommended)
B) Leave Michael as is

## Accepted scope

1. **The box shows its whole hint (A1).** `GrowingTextarea` measures its placeholder while empty
   on a hidden copy of itself (same width and style, `visibility: hidden`, removed right after),
   never by writing into the box's own value, so any box using it grows to show its hint up to
   `maxHeight`. Needed even with A3: the plain card's "Your answer, or done if you handled it"
   (38 characters) clips beside Reply on a narrow column.
2. **Michael's question above the box (A3).** While an option with a `note` is picked, the note
   shows above the box in full, wrapping as needed, never clamped (12 / 18, `ink-2`,
   `dir="auto"`); the box hint reads "Your answer". Parts with their own fields are unchanged.
3. **Files on the card (A2).** On an ordinary Ask me card (plain, options, several questions):
   paste a screenshot or Finder files into the box (`attachmentsFromPaste`), drop files on the
   card (the card's `onDragOver` prevents the default, as `BottomBar.tsx:253` does), or press a
   quiet paperclip "Add a file" beside Reply (`attachFiles`). Each file shows as the Talk to
   Michael chip (name, remove). Files go by their original path; a pasted screenshot by the path
   it was saved at. Reply sends the words with the "Attached files:" lines (`withAttachments`),
   so the raiser's memory note and Michael's request both carry the paths. A file alone is a
   full answer, also for an option that asks for words: `answerFor`'s result is wrapped with
   `withAttachments` before `sendAnswer`'s empty check (`AskMeTab.tsx:288-289`), and Reply's
   enabled checks count files (`toSend` on option and parts cards, `:447`; `!draft.trim()` on the
   plain card, `:603`). Files wait in the store beside the draft, keyed by the card's row, and are
   cleared when the answer lands. The answered just now card shows the words and the file names,
   not the paths.
4. **Michael's rule (A4).** One sentence in his card rules (`hive.ts:415`): when an ask needs a
   screenshot or a file from the owner, ask for it to be attached on the card (paste, drop or Add
   a file), never saved in a folder and named.
5. **Copy** in en, ar, zh-CN, no dashes: "Your answer" and "Add a file"; "Remove {{name}}"
   (`shell.removeAttachment`) exists.
6. **Docs and tests**: DESIGN.md 7.8 (the line above the box, the paperclip, the chips); TODOS.md
   removes "Ordinary Ask me cards take a file"; tests below.

## NOT in scope

- Files on mail approval, schedule change or Work style cards (HOLD SCOPE, owner D1).
- A file preview on the card: the chip names the file; Michael and the member open it.

## 0I Temporal interrogation

```
  HOUR 1:   GrowingTextarea placeholder measure; the note line above the box.
  HOUR 2-3: attachments in the store; paste, drop, paperclip; chips; Reply rules.
  HOUR 4:   Michael's sentence.
  HOUR 5+:  tests, copy in three locales, DESIGN.md, TODOS.md.
```
Effort: human ~1 day / CC ~45 min. Blockers: none.

## Review sections

### Section 1: Architecture

```
  Ask me card (renderer)                        Main
  paste ──► attachmentsFromPaste ─► saveClipboardImage ─► pastes/paste-<t>.png
  drop  ──► pathForFile ───────► original path
  clip  ──► attachFiles ───────► original path
  (Finder files pasted in the box: original paths, from attachmentsFromPaste)
  store answerFiles[rowKey] = [{ path, name }]
  Reply ─► text = withAttachments(words, files) ─► hivePatchTask (answer on the card)
                                               ─► hiveRememberOwnerAnswer (raiser memory)
                                               ─► answerMessages ─► Michael's request
```

Findings:
1. [INFORMATIONAL] A pasted screenshot named in an answer can be swept after 14 days while a
   memory note still names it (`pastes.ts:20`). Accepted as today's Talk to Michael behavior.
2. [INFORMATIONAL] A file picked from a folder a team member may not read (another member's
   folder, Michael's own files, `shared/folderAccess.ts`) reaches Michael, who can read it and
   hand it on. Accepted, as in Talk to Michael.
Coupling: none new; renderer only. Rollback: revert; nothing stored changes shape.

### Section 2: Error and rescue map

```
  CODEPATH              | WHAT CAN GO WRONG              | RESCUE                         | USER SEES
  attachFiles           | picker cancelled               | nothing added                  | nothing
  saveClipboardImage    | no image (a text paste)        | ordinary text paste            | the text
  sendAnswer            | card changed, not landed       | draft and files kept           | "Couldn't save" (today)
  memory note / message | fails after landing            | today's resend path            | nothing new
```
No catch all swallows a failure: each refused file is named on the card.

### Section 3: Security
No new IPC or main code: paths the owner picked, dropped or pasted go into the answer text, as in
Talk to Michael; agents read them under their existing folder rules. No new secret or network.
No issues found.

### Section 4: Data flow and interaction edge cases

```
  INTERACTION          | EDGE CASE                         | HANDLED
  paste                | text and image both on clipboard  | text wins (attachmentsFromPaste)
  paste / drop / pick  | same file twice                   | kept once (by path)
  drop                 | a folder                          | sent by path; Michael reads it
  Reply                | files only, option needs words    | sends (decided)
  Reply                | double click                      | `sending` guard (today)
  switch cards / tabs  | files chosen, not sent            | kept in the store by row
  answer lands         | files                             | cleared with the draft
  card withdrawn       | files chosen                      | the row leaves; its files stay in pastes until swept
```

### Section 5: Code quality
Reuse over new code: the chip, paste, pick and text format come from Talk to Michael. The chip
markup is the second copy of `BottomBar.tsx:200-211`; small enough to repeat, not worth a shared
component yet. No issues found.

### Section 6: Tests
- Unit (`withAttachments`, existing): words plus files, files alone.
- Unit (`GrowingTextarea` cannot render in node): source check that an empty box measures its
  placeholder.
- Source checks (`AskMeTab.tsx`): the note line above the box, placeholder "Your answer", paste,
  drop and paperclip wired, files in the store, Reply with files only, `withAttachments` in the
  sent text.
- Michael's rule: `hive.ts` holds the sentence (prompt test pattern, as other rules).
- no_claim: real paste and drop in Electron (manual check in the dev app).

### Section 7: Performance
Paths only; no file is read or copied by the app. No issues found.

### Section 8: Observability
A refused file is shown by name on the card; a failed copy is an expected owner error, not an
auto failure report. No issues found.

### Section 9: Deployment
Ships with the next release; no migration, no flag. Michael's rule reaches him at his next
start. No issues found.

### Section 10: Trajectory
Reversibility 5/5. Path: other card kinds can reuse the same paperclip and chips later.

### Section 11: Design
- The note line: 12 / 18 `ink-2`, 6 px above the box, `dir="auto"`, the agent's words as written.
- The paperclip: a 28 px quiet icon button (`ink-3`, `neutral-soft` on hover), "Add a file" as its
  label and tooltip, beside Reply; dropping on the card shows the `indigo` focus ring on the box.
- Chips: the Talk to Michael chip (`neutral-soft`, 20 px, name, remove), in a row under the box.
- The answered just now card: the words, then the file names in the chip style, never paths.

## Outside voice (native fallback, Claude Plan subagent)

Codex not run (owner rule). The bounded native fallback completed inside five minutes; native
coverage only.

| # | Finding | Disposition |
|---|---|---|
| O1 High | Copying files into `pastes/` makes them last less (14 day sweep) and adds IPC, cap and sanitizer | Applied: files go by original path, as Talk to Michael; the copy mechanic was mine to decide and is reversed |
| O2 High | A3 makes the `GrowingTextarea` change pointless, and writing into a controlled value is risky | Partly applied: the fix stays (the plain card's 38 character hint clips beside Reply, en `answerPlaceholder`), but measures on a hidden copy, never the box's value |
| O3 Medium | The note line could clamp | Applied: it wraps in full, never clamped |
| O4 Medium | Finder files pasted skip the copy | Moot after O1 |
| O5 Medium | Reply during a copy | Moot after O1 |
| O6 Medium | The two Reply checks and where `withAttachments` goes | Applied: named in Accepted scope 3 (`AskMeTab.tsx:288-289`, `:447`, `:603`) |
| O7 Low | Paths shown in the answered list | Applied: words and file names, never paths |
| O8 Low | Drop needs `onDragOver` | Applied: named in Accepted scope 3 |
| O9 Low | The sanitizer strips Arabic and Chinese names | Moot after O1 |

## Approval readiness

Approval readiness: PASS. A1, A2 (owner ask), A3 (D2), A4 (D3); mechanics decided under the
owner's 2026-10-27 rule. No pending choice.

## Reality rows

REALITY: premise-table pass 9 premises with code receipts, unverified=0 src/renderer/src/components/GrowingTextarea.tsx:20-24
REALITY: already-done pass no Ask me attach on origin/main; the TODO is still open TODOS.md:330
REALITY: surface-check pass reuses attachFiles, saveClipboardImage and pathForFile, all present src/preload/index.ts:1229-1235
REALITY: binding-decisions pass the foundations upload review deferred this exact item docs/designs/foundation-card-upload.md:85
REALITY: numbers pass the 38 character hint is counted from the locale file src/renderer/src/i18n/locales/en.json:93
REALITY: deferred-asks pass no linked issue; both owner asks covered docs/designs/ask-me-answer-box.md:7
REALITY: pr-count pass one PR on the running branch 9c6c6cfe

## What already exists

`attachmentsFromPaste`, `attachFiles`, `pathForFile`, `saveClipboardImage`, `withAttachments`, the
Talk to Michael chip, the store drafts; `GrowingTextarea` itself.

## Failure modes

| Path | Failure | Covered | User sees |
|---|---|---|---|
| hint measure | the hidden copy differs in width | measured at the box's own width | the full hint |
| paste | text and image both | text wins | the text |
| Reply | card changed before landing | draft and files kept | "Couldn't save" |
| file alone | Reply disabled by a missed check | source checks on both checks | Reply enabled |

Critical gaps: 0.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.
Run with Claude Code or Codex; checkbox as you ship.

- [x] **T1 (P1, human: ~2h / CC: ~5min)** — GrowingTextarea — grow to the placeholder while empty, measured on a hidden copy
  - Surfaced by: A1, O2
  - Files: src/renderer/src/components/GrowingTextarea.tsx
  - Verify: source check; the plain card hint at a 320 px column in the dev app
- [x] **T2 (P1, human: ~2h / CC: ~10min)** — Ask me — the note above the box in full; "Your answer" in the box
  - Surfaced by: A3, O3
  - Files: src/renderer/src/components/AskMeTab.tsx, locales
  - Verify: source check; the Twilio card in the dev app
- [x] **T3 (P1, human: ~4h / CC: ~15min)** — Ask me — paste, drop and paperclip; chips; files in the store; Reply counts files; `withAttachments` before the empty check; names in the answered list
  - Surfaced by: A2, O6, O7, O8
  - Files: src/renderer/src/components/AskMeTab.tsx, src/renderer/src/store/store.ts, locales
  - Verify: source checks; paste a screenshot and send in the dev app
- [x] **T4 (P1, human: ~30min / CC: ~5min)** — Michael — the attach sentence in his card rules
  - Surfaced by: A4
  - Files: src/main/hive.ts
  - Verify: prompt test
- [x] **T5 (P2, human: ~1h / CC: ~5min)** — docs — DESIGN.md 7.8; TODOS.md drops the done item; FEATURES.md line
  - Surfaced by: Accepted scope 6
  - Files: branding/DESIGN.md, TODOS.md, docs/FEATURES.md
  - Verify: read through

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | HOLD SCOPE                                  |
  | System Audit         | hint clipped by GrowingTextarea; attach     |
  |                      | parts exist in Talk to Michael; TODO open   |
  | Step 0               | D1 hold; D2 note above box; D3 Michael rule |
  | Section 1  (Arch)    | 2 issues found (accepted)                   |
  | Section 2  (Errors)  | 5 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 8 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | 0 issues (decisions specified)              |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 5 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 4 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 1 removed (done by this plan)               |
  | Scope proposals      | 0 proposed (HOLD SCOPE)                     |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex unavailable (owner rule); native      |
  |                      | fallback completed, 9 findings              |
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
| Outside Review | native fallback (Claude Plan subagent); Codex not run by owner rule | Independent 2nd opinion | 1 | unavailable (native completed) | 9 native findings; 9 resolved; 0 unresolved; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan review: unavailable (owner rule keeps Codex to the DeepSeek adversarial diff pass). Native Claude Plan subagent completed with 9 findings; no external coverage.
- **VERDICT:** CEO CLEARED. eng review required

NO UNRESOLVED DECISIONS
