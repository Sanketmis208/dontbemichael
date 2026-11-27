# Report a problem: a form business owners can fill in

Status: CEO review complete 2026-11-26 (HOLD SCOPE); ready to build.

## Ask (owner, 2026-11-26)

"the issue link that opens from "Report a problem" in the office, is very verbose for business users. this is useful for more technical people. So, this link should open a much simpler template asking details business users can easily enter"

## System audit (static read)

| Area | Today | Receipt |
|---|---|---|
| Link | `reportProblemUrl` opens `issues/new?template=bug_report.yml` with app version, OS, OS version and up to 5 automatic report fingerprints in Logs | `src/shared/reportProblem.ts:13-24` |
| Click | top bar button and Help menu; saves a window picture to Downloads and shows it | `src/main/reportProblem.ts:1-16` |
| Form | `bug_report.yml`: required "Steps to reproduce" (numbered, from a fresh launch), required Node version (`node -v`), required OS version, three required checkboxes (latest release, re-ran `npm install` for `node-pty`, searched duplicates); Logs field rendered as shell | `.github/ISSUE_TEMPLATE/bug_report.yml` |
| OS label | Action reads the `### Operating system` heading of any issue body | `.github/workflows/issue-os-labeler.yml:24` |
| Guard | test pins the URL to `bug_report.yml` and its field ids | `test/report-problem.test.cjs:15-27` |
| Account | GitHub needs a free account; the tip says so and that reports are public | `en.json:1712` |

An owner on the packaged app cannot submit today without answering `node -v` and ticking that they re-ran `npm install`: both required, both meaningless to them.

## 0A. Premise

- Real problem: the form is written for people running from source. The owner hits required fields they cannot answer and either fakes them or gives up.
- Target outcome: an owner reports in under a minute in their own words: what they were doing, what went wrong, the picture. Everything technical the app already knows comes prefilled or is not asked.
- Do nothing cost: the business owners the product is for send fewer, worse reports.
- Proxy check: a simpler form fixes the words. The GitHub account and public repo stay (outside the ask; report-problem-top-bar.md 0A).

## 0B. Existing code

Reuse `reportProblemUrl` (one template name and param ids change), the reporter, the picture save, the OS labeler (same `os` field and label), the fingerprint line. Nothing is rebuilt.

## 0C. Dream state

```
CURRENT                         THIS PLAN                          12-MONTH IDEAL
developer bug form, required -> plain owner form from the app, -> owner describes it in the app,
node -v and npm checkbox         tech fields prefilled, hidden     no GitHub account, details attached
                                 developers keep bug_report.yml    and scrubbed by the app
```

## Decision ledger

| ID | Contract and evidence | Current | Proposed | Status | Approval |
|---|---|---|---|---|---|
| AP1 | How the link gets simple (ask) | A: new owner form `problem_report.yml`, the app opens it; bug_report.yml stays for developers | B: simplify bug_report.yml; C: in app form, no GitHub (not chosen) | approved | D1 answer A, owner 2026-11-26 |

## Mode

HOLD SCOPE (D2, owner 2026-11-26, as recommended). No expansions. Option C of D1 (report from inside the app, no GitHub account) was not chosen; it is NOT in scope, not a TODO.

## Accepted scope (AP1)

1. New form `.github/ISSUE_TEMPLATE/problem_report.yml`, name "Problem in the app", label `bug`, no title prefix needed by owners (title box stays GitHub's own). Fields, in order:
   - markdown: one short line: "Tell us in your own words. The app filled in the details below. A picture of the app was saved to your Downloads: drag it into the picture box."
   - `what-doing` textarea, "What were you trying to do?", required.
   - `what-happened` textarea, "What went wrong?", description "What you saw, and what you expected instead.", required. Same id as the bug form.
   - `evidence` textarea, "Picture or recording", optional.
   - markdown: "Filled in by the app. No need to change these."
   - `app-version` input, "Don't Be Michael version", required.
   - `os` dropdown, label exactly "Operating system" (the OS labeler reads that heading), the same four options, required.
   - `os-version` input, "OS version", optional (the app fills it when it can).
   - `logs` textarea, "Details for the developers", optional, no shell render.
   - No Node version, no npm install, no pre-flight checkboxes, no numbered steps.
   All text without dashes (standing rule).
2. `reportProblemUrl` opens `template=problem_report.yml`; the same params (`app-version`, `os`, `os-version`, `logs`). Comment updated.
3. `bug_report.yml` unchanged; developers keep it from the issue chooser.
4. `test/report-problem.test.cjs`: the URL names `problem_report.yml`; every param it sets is a field id of that form; the OS options match; the form asks nothing an owner cannot answer (no `node`, no `npm`, no `checkboxes`, no required field beyond the two questions and the prefilled ones); the label "Operating system" stays for the labeler; no dashes in the form's text.

## Section 1: Architecture

```
TopBar / Help menu --> app:reportProblem --> createReporter.report
                                              |-- capture window (unchanged)
                                              |-- openExternal(reportProblemUrl) --> github issues/new?template=problem_report.yml&app-version&os&os-version&logs
                                              '-- save picture to Downloads (unchanged)
GitHub issue --> issue-os-labeler.yml (reads "### Operating system", unchanged)
```
OK: one file added, one string changed. Coupling: URL params must be field ids of the new form, pinned by the test. Rollback: point the URL back to `bug_report.yml`, one line, next release. Failure: if the template name is wrong GitHub shows the chooser, not an error; the test pins the file exists. No issues found beyond the pin.

## Section 2: Error and rescue map

| Codepath | What can go wrong | Handling | Owner sees |
|---|---|---|---|
| reportProblemUrl | template file missing on the default branch (form added on a branch not merged) | GitHub falls back to the template chooser | the chooser, still both forms; test pins file in repo |
| openExternal | no browser | existing: button says Couldn't open | existing |
| form prefill | a param id not on the form | GitHub drops it silently | test pins every param to a field id |
WARNING: the new form works only once merged to `main` on GitHub; an app built before the merge that points to it gets the chooser. Ship the form and the link in the same release (they are the same PR).

## Section 3: Security and threat model

No new input reaches the app. The URL carries the same four values as today (versions, OS, fingerprints): no paths, names or logs (`reportProblem.ts:8`). The issue stays public; the tip already warns. No issues found.

## Section 4: Data flow and interaction edge cases

- Owner submits without the picture: allowed (optional).
- Owner edits the prefilled version: allowed; harmless.
- OS unknown (an unlisted platform): `os` not set, dropdown required, owner picks. Same as today.
- Developer opens issues/new by hand: chooser shows both forms; the bug form stays the developer path.
No issues found.

## Section 5: Code quality

The form's ids reuse the bug form's ids where the meaning is the same (`what-happened`, `evidence`, `logs`, `os`, `os-version`, `app-version`), so triage reads both alike. No issues found.

## Section 6: Tests

```
reportProblemUrl
  [TESTED] params set, OS mapping, fingerprints        report-problem.test.cjs:15,170
  [GAP]    template is problem_report.yml and params are its field ids (update :15-27, :177)
problem_report.yml
  [GAP]    owner can answer every required field (no node, npm, checkboxes)
  [GAP]    "Operating system" label kept for the labeler
  [GAP]    no dashes in its text
```
Value: protects=an owner can submit with only the two questions; fails_when=a developer field or required checkbox is added back, or the URL drifts from the form ids; why_new=the test pins the developer form today; seam=none; no_claim=GitHub rendering the form.

## Section 7: Performance

No issues found: a static file and one string.

## Section 8: Observability

Reports from the app arrive through one form, so issues opened from the app are told apart from hand filed ones by the form's "What were you trying to do?" heading. No dashboard change needed. No issues found.

## Section 9: Deployment and rollout

Same PR, same release. Old app versions keep opening `bug_report.yml`, which still exists. No migration. Windows ships too (standing rule), nothing platform specific.

## Section 10: Long term

Two forms to keep in step on shared ids; the test pins the owner form, the bug form keeps its own pins. No issues found.

## Section 11: Design

The form is the owner's view. Three questions (two required, picture optional), then a "Filled in by the app" block. Short words, no technical terms above the line. OK.

## NOT in scope

- Reporting without a GitHub account (D1 option C, not chosen).
- Changing `bug_report.yml`.

## Approval readiness: PASS (AP1 D1 A, mode D2 A)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---|---|---|
| CEO Review | /plan-ceo-review | owner form for Report a problem | 1 | CLEAR | 2 decisions (D1 A, D2 HOLD), 1 warning (ship form and link together) |
| Eng Review | | | 0 | | |
| Design Review | | | 0 | | |

VERDICT: CEO CLEARED, HOLD SCOPE, ready to build.

NO UNRESOLVED DECISIONS
