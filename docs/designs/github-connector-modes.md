# GitHub through Claude's connector, with per member modes

Status: CEO reviewed 2026-11-21 (owner). Not built.
Research: `reports/Git access for sandboxed agents.md`, `reports/GitHub connection access modes.md` (worktree root, untracked).

## Problem

A SaaS office's IT member (Nick) was asked to add a blog page to the company site
(Firebase Hosting, code in a GitHub repo). He failed: "The team's terminal is cut off
from the internet by the office's rules (only Pete may go online), so Nick's git pull
was refused." Every member's shell has an empty strict `sandbox.network`
(`src/shared/webAccess.ts:43`), on the owner's rule that only Research uses the open
internet (owner 2026-10-13, D16).

Doing nothing: no office member can ever touch code or the website, a common need
for tech businesses.

## Binding decisions (this review)

| ID | Decision | Answer |
|---|---|---|
| D1 | GitHub is a per member grant with modes Pull only / Pull and push / Push on approval and a repo list, like email's per mailbox modes; modes enforced outside the agent's reach, not by command matching; Pull and push means `agent/` branches plus a pull request, never main, never merge; the list covers reads too; API writes outside the modes refused. | Owner chose "Your design, adjusted" (D1 validated). Route part superseded by D8. |
| D2 | Review mode SCOPE REDUCTION. | Owner, D2. |
| D3 | Push on approval stays in the first land. | Owner, "Keep it in the first land". |
| D4 | Package installs (npm) kept. | Owner, D4. Superseded by D8: no local build in this land, npm dropped with it (TODO). |
| D5 | App-built GitHub tools like md-mail. | Owner, D5. Superseded by D8. |
| D6 | Behavior changes: Nick's job text for members with GitHub (work through the connector, write only `agent/` branches, open a PR with a plain summary, never main, never merge); held writes are decided by the owner, not Michael, as Send on approval is; Michael brings the PR and its preview link, the owner merges on GitHub and that deploys; a refusal says to ask Michael for the GitHub connector, not "only Pete". | Owner, "Accept as listed". |
| D7 | Deny known credential files (gh `hosts.yml`, `.git-credentials`, `.netrc`, `.npmrc`) to every member's shell and file tools. | Owner, "Deny them for every member". |
| D8 | No app-built git: GitHub is Claude's GitHub connector, granted in Capabilities, with the D1 modes and repo list enforced by the PreToolUse hook the way QuickBooks Read only is (`src/shared/quickbooks.ts:110-123`); Push on approval refuses the call into an owner card and then allows that exact call once; deploy by the site's GitHub Action on merge; local build and npm become a TODO. | Owner: "go with recommendation". |
| D9 | Standing rule: for any future outside service, first reuse a Claude connector; agents check whether Claude has a connector and suggest enabling it. | Owner, in the D8 answer (memory `prefer-claude-connectors`). |
| D10 | GitHub goes through the app's own token integration (MCP server with a token, GitHub template). The app never suggests Claude's GitHub connector: rule 11 sends GitHub straight to Settings, Connections, Integrations, and the ungranted connector line leaves GitHub out. The hook still applies the modes if a Claude GitHub connector is granted. | Owner, 2026-11-23: "app should not suggest claude based git as we are supporting our own integration". Narrows D8 and D9 for GitHub. |

## The design

```
  OWNER (Settings > Connections, member Capabilities)          GITHUB.COM
     |  turns on "GitHub" connector (claude.ai, OAuth)             ^
     |  per member: rows [owner/repo | Pull only | Pull and push | Push on approval]
     v                                                             |
  CONFIG (agentCapabilities[id].github) ----------------+          |
                                                        |          |
  NICK (Claude Code)                                    v          |
   shell: no network (unchanged)        PreToolUse HOOK (app, outside agent)
   calls mcp__claude_ai_GitHub__<tool> ---> githubAccess(cap, tool, input, visibility)
                                           | allow  ----------------------> connector -> API
                                           | refuse (reason to agent)
                                           | hold   -> githubProposals (card) -> owner
                                                         approve -> one-time allow(hash)
                                                         -> Nick told to run it again
  GitHub Action (owner's repo): PR -> preview channel link; merge to main -> live deploy
```

Nick's shell, sandbox and Research rule are unchanged. No token is ever in the office:
the connector holds the owner's GitHub sign-in inside Claude.

### Mode rules (hook, pure function `githubAccess` in `src/shared/github.ts`)

Fails closed: an unknown tool name is refused in every mode (QuickBooks pattern,
`READ_TOOLS` allow list). Tool lists are taken from the connector's live catalog at build
time, like QuickBooks' (2026-09-29).

| Tool class (examples from GitHub's MCP server) | Pull only | Pull and push | Push on approval |
|---|---|---|---|
| Read, repo on list (`get_file_contents`, `list_branches`, `list_commits`, `get_commit`, `get_pull_request*`, `list_pull_requests`, `search_code` with `repo:` on list) | allow | allow | allow |
| Write to an `agent/` branch, repo on list (`create_branch` new name `agent/...`, `create_or_update_file`, `push_files`, `delete_file` on `agent/...`) | refuse | allow | hold |
| Open or edit a PR from `agent/...` (`create_pull_request`, `update_pull_request`) | refuse | allow | hold |
| Any write touching a path under `.github/` (workflows, actions, dependabot), repo on list, `agent/` branch (eng D2) | refuse | hold | hold |
| Reading Actions runs, jobs and job logs (`actions_list`, `actions_get`, `get_job_logs`; owner 2026-11-26, connection asks for the `actions` toolset; a job log comes back as its last 150 lines unless the call asks for more, up to 5000), repo on list | allow | allow | allow |
| Merge, repo create/fork, gists, issues and comments writes, starting, rerunning, cancelling or deleting Actions runs (`actions_run_trigger`), settings, secrets, any repo not on the list, any branch not `agent/`, any unknown tool | refuse | refuse | refuse |

Grant path (eng outside voice V2): the member must hold the GitHub connector through the
existing connector grant (`agentCapabilities[id].connectors`, `src/shared/claudeConnectors.ts:165`)
and the Settings switch. The repo rows (`agentCapabilities[id].github`) narrow it.
`connectorAccess` runs first, then `githubAccess`.

Repo match: `owner/repo` from the tool input, trimmed and lowercased, against the
member's rows. A search without a listed `repo:` qualifier is refused (it reads other repos).

Visibility: the main process asks `GET https://api.github.com/repos/<o>/<r>` with no
token (200 = public, 404 = private or missing), cached 10 minutes, on adding a row and
before every write or hold. A row added for a public repo defaults to Push on approval.
A repo seen private at adding that is now public refuses writes until the owner
confirms the row again. A failed check refuses writes (fail closed) with a "try again" reason.

### Push on approval

Mirrors Send on approval (`src/shared/mailProposals.ts`, `docs/designs/send-on-approval.md`):

```
 Nick write call --hook--> HELD: proposal saved {id, agent, tool, input, hash, repo, visibility, flags}
      refuse reason: "Held for the owner's approval; you'll be told when to run it again."
 Ask me card --> owner: Approve | Decline (note)
   Approve  -> APPROVED: one-time allow {hash, expires 24h}; inbox message to Nick: run it again
   Decline  -> DECLINED: inbox message with the owner's note
 Nick repeats the call --hook--> hash matches an unused allow -> allow, mark USED
 Expired or member removed -> EXPIRED (card gone, allow dropped)
 Invalid: USED -> allow again (refused; one use), APPROVED for another hash (no match).
```

The hash is SHA-256 over the tool name and canonical JSON of the input, so an edited
call needs a new approval. Card shows: repo with a Public or Private badge (checked
live), branch, Nick's summary labelled as his words, files changed, and flags the app
computes from the input. The flags are: workflow files (`.github/workflows/`), secret
shapes (`src/shared/dataClasses.ts` patterns), `.env` or key files, content over 1 MB,
deletes, public repo, and visibility changed. The card looks different when a flag
fires. The full content sits behind a details link.

### Owner setup (help text, shown once in Connections)

1. Add GitHub's official connector to the Claude account (claude.ai > Connectors).
2. On GitHub: a ruleset on the default branch requiring a pull request, blocking force pushes and deletions, with no bypass list. The connector acts as the owner, so an admin bypass would let it through (eng V7).
3. In the site repo, `firebase init hosting:github`: preview link on every PR, live deploy on merge.

## Review sections

### Section 1: Architecture
Current scope: SCOPE REDUCTION (owner D2). Accepted: D1 modes and list, D3 Push on approval, D6, D7, D8, D9. Superseded: D4 npm, D5 app tools. Deferred: local clone and build (TODO).

The new pieces are the pure rule `githubAccess`, the visibility check, the held-call
store and card, the Capabilities rows and the prompt lines. They reuse the existing
connector gate (`connectorAccess`, `src/shared/claudeConnectors.ts:258`), the hook
(`src/main/hooks.ts:720` QuickBooks branch), the mail proposal flow and the Ask me board.
Coupling: one new branch in the hook beside QuickBooks, which is justified because it is
the same kind of rule. Scaling: hook decisions are pure and in memory; the visibility
check is one cached GET. Single point of failure: the hook. It fails closed today
(`CONNECTOR_UNDECIDED`), and this keeps that.

Data flows (hook decision): happy = allow; nil input (no `owner`/`repo`) = refuse
"name the repo"; empty repo list = refuse "no repos given"; error (config unreadable,
visibility check fails) = refuse with retry reason.

Rollback: one build flag `SHOW_GITHUB` (beside `SHOW_MAILBOXES`,
`src/shared/buildFeatures.ts:54`). Off means GitHub calls are refused like any ungranted
connector. That takes one release.

Finding A1 (resolved D8): no member's shell can reach the broker today (only MCP servers
get `MD_BROKER_URL`, `src/main/index.ts:3918`). The connector route needs no shell path.

### Section 2: Error and rescue map

| Codepath | What goes wrong | Rescue | Agent or owner sees |
|---|---|---|---|
| hook `githubAccess` | config unreadable | refuse, fail closed | "could not confirm access, try again" |
| | unknown tool name | refuse | "not allowed in your GitHub mode; tell Michael" |
| | input lacks owner/repo/branch | refuse | names the missing field |
| visibility check | network error, 403 rate limit | refuse writes and holds, reads allowed; retry after 1 min | "could not check the repo, try again shortly" |
| | 404 for a repo the owner called public | treat as private, card notes it | badge "Private or not found" |
| held-call store | write fails | refuse the call (nothing held silently) | "could not hold this for approval; try again" |
| one-time allow | expired, already used | refuse | "approval expired or used; ask again" |
| connector | GitHub refuses (ruleset, 422) | pass GitHub's error through | GitHub's message |

No catch-all: each refusal names its cause.

### Section 3: Security and threat model

| Threat | Likelihood | Impact | Mitigated |
|---|---|---|---|
| Push to a repo not on the list | Med | High | yes: hook repo match; unknown tools refused |
| Leak through an allowed public repo (content, PR text) | Med | High | partly: public badge, default Push on approval, flags; residual (D1 research) |
| Agent writes `main` or merges | Med | High | yes: hook branch rule plus GitHub ruleset |
| Owner's own GitHub token copied out | Low | High | yes: D7 deny list |
| Workflow file edit runs CI with secrets | Low | High | flag on card; owner's workflow approval for outside pushes (setup text) |
| Prompt injection from repo or issue text | Med | Med | existing outside text screening (memory `injection-screening-flags-to-michael`); hold mode |
| Approved hash replayed | Low | Med | one use, 24 h expiry |
| Connector tool names change upstream | Med | Low | fail closed on unknown names |
| Search across GitHub reads other repos | Med | Low | search needs a listed `repo:` |

Audit: every allow, refuse and hold goes to `log.jsonl` with agent, tool, repo, branch,
mode and decision. Refusals add a pulse refusal gate `github` (`src/shared/pulseSafety.ts:21`).

### Section 4: Data flow and interaction edge cases

```
 tool_input -> parse owner/repo/branch (missing -> refuse)
           -> match member rows (none -> refuse; case/whitespace normalized)
           -> mode table (unknown tool -> refuse)
           -> visibility (fail -> refuse write; flip -> refuse until reconfirm)
           -> allow | hold(persist proposal; dup hash waiting -> reuse same card) | refuse
```

Async ordering: the invariant is that one approval allows exactly one matching call.
Two retries of the same call race. The allow is consumed by a synchronous
check-and-mark in the main process before the hook replies. The second retry finds it
USED and is refused. Test with two hooks resolved in both orders.

| Interaction | Edge case | Handled | How |
|---|---|---|---|
| Approve card | double click | yes | decide is idempotent by id |
| Approve card | member removed meanwhile | yes | card dropped like mail (`memberPresent`) |
| Repo rows | zero rows with GitHub on | yes | every call refused, row says "add a repo" |
| Repo rows | same repo twice | yes | refused at save |
| Mode change | while a call is held | yes | held card stays; the allow is checked against the mode at retry |

### Section 5: Code quality
Fits existing patterns: a pure rule in `src/shared/`, wired in `hooks.ts` beside
QuickBooks, a store mirroring `mailProposals`. Do not copy the mail proposal store
wholesale. Share its card and decide flow where the shapes match, and keep GitHub
fields separate. Keep `githubAccess` branch count low with a table lookup (mode x tool class).

### Section 6: Tests

| Behavior | Test | Wrong result it rejects |
|---|---|---|
| Pull only allows listed reads, refuses every write | unit `test/github-access.test.cjs` | a write tool allowed in Pull only |
| Unknown tool refused in all modes | unit | a new upstream tool slipping through |
| Repo not listed refused, case and whitespace normalized | unit | `Owner/Repo ` bypass |
| Branch must start `agent/`; `main`, `agent` alone, `agentx/` refused | unit | prefix bypass |
| Merge, gists, fork, issue writes refused in Pull and push | unit | merge allowed |
| Search without listed `repo:` refused | unit | cross-repo read |
| Push on approval holds, approve allows exactly once, second retry refused | unit plus race test (both orders) | double use |
| Edited input after approval needs a new approval | unit | hash ignores input |
| Visibility: public default hold, flip refuses writes, check failure refuses writes | unit with stubbed fetch | fail open on network error |
| Hook fails closed on unreadable config | hook test | allow on error |
| D7 deny paths present for every member | `test/folder-access.test.cjs` | token file readable |
| Job text lines only for members with GitHub | prompt test | lines leaking to others |

`no_claim`: GitHub's real connector tool names and argument shapes are not proven by
these unit tests (fixture catalog). A live probe with the real connector is required
before ship (Live probes 1 and 2).

Friday 2am test: Nick in Pull only tries every write tool in the live catalog; all
refused, all logged.

### Section 7: Performance
The hook adds a table lookup per call. The visibility check is cached for 10 minutes
per repo: at most 60 uncached GETs an hour per office (the unauthenticated limit). If
that limit is hit, writes are refused until it resets, which is visible. No issues found
beyond that.

### Section 8: Observability
Log every decision (Section 3). Show a "GitHub" refusal tile on Pulse via the refusal
gate. Held cards show their age. Debuggability: the log line carries the proposal id and
hash, so a three-week-old report can be traced. No dashboard beyond Pulse.

### Section 9: Deploy and rollout
No data migration: the new config keys are optional and absent means off. Behind
`SHOW_GITHUB`. Ships Mac first. Windows: the hook works there, since connector calls
are gated on every platform, but the shell is not sandboxed (existing known limit,
TODOS "Take the internet from team members' shells on Windows"). Ships on Windows per
the standing rule. Other engines (Codex and the rest) get no Claude connectors, so this
is Claude members only. Post-ship check: one Pull and push run to an `agent/` branch,
one held write approved, one refused merge.

### Section 10: Long-term trajectory
Reversibility 5 of 5: config and a hook branch. The debt is a fixed tool catalog that
needs refreshing when GitHub adds tools; it fails closed, so the cost is friction, not a
leak. D9 makes this the template for future services: connector, per member modes,
hook rule.

### Section 11: Design and UX
Screens:
- Capabilities > GitHub: one row per repo, with a `owner/repo` text field and a mode select.
- Connections: the GitHub connector row, plus setup help behind an info icon.
- Ask me: the held write card.

Fields only, with explanations behind info icons (memory `less-verbose-ui`). One
visible line stays for a public repo row, because the risk is not readable otherwise.
States:

| Feature | Empty | Error | Success | Partial |
|---|---|---|---|---|
| Repo rows | "Add a repo" | invalid name inline | row saved | visibility unknown badge |
| Held card | n/a | decide failed, retry | approved / declined | expired |

Superseded by the design review below (2026-11-22).

### Design review decisions (2026-11-22)

Mockup (HTML with app tokens, memory `design-mockups-html-css-only`):
`~/.gstack/projects/agentvivekkumar-dontbemichael/designs/github-connector-20261122/mockup.html`.

| ID | Decision | Answer |
|---|---|---|
| UI-D3 | Repo rows nest under the GitHub row in the member's Connectors card. They show only while GitHub is on, like QuickBooks Read only (`CapabilitiesTab.tsx:473`). Each row has the `owner/repo` name in IBM Plex Mono, a badge, the three-way choice in the existing `RadioRows`, and a remove ×. An `owner/repo` field and an Add button sit below. | Owner, "Under the GitHub row" |
| UI-D4 | Card order: title "{name} wants to write to GitHub"; warning lines; repo with badge; branch; "{name} says" block; changed files; "Show the changes"; buttons. The folded summary shows repo, branch and file count, like the mail card. | Owner, "Warnings first" |
| UI-D5 | Buttons: Decline, Ask for changes, Approve, in the mail card's order and style (`MailProposalCards.tsx:240`). Ask for changes opens a note that goes to the member, and the card closes. The revised write files a new card. | Owner, "Add Ask for changes" |
| UI-D6 | States. Badge: Checking, Private (also not found), Public, Not checked (InfoTip: writes wait until checked). Field errors: "Use owner/repo", "Already added". Empty hint: "Add a repo {name} may use". Card error: "Couldn't save. Try again." An expired card leaves the board, and the member gets an inbox note. | Owner, "Use these words" |
| UI-D7 | A warning is a coral-text line (`--cth-coral-text`) with a ⚠ mark at the top of a white card. No tint, no border, no extra confirm (memory `askme-cards-stay-white`). | Owner, "Red warning lines" |
| UI-D8 | Accessibility and narrow widths: each repo's choice is a radio group labelled "{name}'s access to {repo}"; remove buttons are named; badges are words, never color alone; warnings use `role="alert"`; buttons are at least 32px high; the choice wraps under the repo name; long names break (`overflow-wrap: anywhere`). | Owner, "Apply this checklist" |
| UI-7 | "Show the changes" expands inline in the card, since the change is not on GitHub yet. | Small mechanics, decided under memory `plan-reviews-decide-small-choices` |

Tokens and parts: the row `Toggle`, `RadioRows`, `FoldHeader`, `PixelButton`, `InfoTip`, the amber caution chip for Public (`AskMeTab.tsx:760`), `--cth-coral-text`, Sora, and IBM Plex Mono for repo, branch and file names.

Setup help (Connections, the InfoTip on the GitHub row) has three steps:
1. Add GitHub's connector to your Claude account.
2. On GitHub, protect main: require a pull request, with no bypass.
3. In the site's repo, run `firebase init hosting:github`.

Journey:

| Step | Owner does | Owner feels | Plan specifies |
|---|---|---|---|
| 1 | Turns GitHub on for Nick | unsure what it allows | the three modes, with short labels and an InfoTip each |
| 2 | Adds acme/website | wants to know it is safe | live badge: Checking, then Private or Public |
| 3 | A card arrives | cautious | warnings first, then plain facts, then Nick's words |
| 4 | Approves or asks for changes | in control | the email card's buttons, one click |
| 5 | Merges the PR on GitHub | confident | the preview link from the GitHub Action |

## Outside voice (DeepSeek V4 Pro adversarial pass, 2026-11-21)

Seven findings. Each was checked against the code; all are repairs that make the approved
D1/D3/D8 contract hold (enforced, fail closed, the owner approves what actually runs).
None changes approved behavior, so all are applied below:

| # | Finding (severity) | Verified | Applied repair |
|---|---|---|---|
| O1 | Big MCP inputs reach the hook trimmed (`tool_input_trimmed`, `src/main/hive.ts:6488`), so a hash and card would miss the file content (Critical) | yes | A GitHub write or hold with `tool_input_trimmed` is refused in every mode: "Too large for one call; push fewer or smaller files at a time." The hash covers the full input only. |
| O2 | Marking USED at PreToolUse burns an approval when the write then fails (High) | yes, by design of the draft | Allow states: APPROVED -> IN_FLIGHT (Pre) -> USED (PostToolUse success) or back to APPROVED (PostToolUseFailure). A second call while IN_FLIGHT is refused. (Time release removed by eng V5.) |
| O3 | The hook is synchronous (`src/main/hooks.ts:355`); a network check cannot run inside it (High) | yes | The hook reads only a visibility cache. The app refreshes it when a row is added, every 10 min while GitHub is granted, and on a miss. A missing or older than 30 min entry refuses writes: "Checking the repo; try again in a minute." Visibility is advisory (badge and public default), not a trust boundary. |
| O4 | GitHub resource list/read calls skip tool rules (High) | yes (QuickBooks closes it, `src/shared/quickbooks.ts:43`) | GitHub resource calls are refused in every mode. |
| O5 | Branch fields differ per tool (`head`/`base`, optional `branch`) (High) | plausible; needs the live catalog | Live probe 1 becomes task T0 before T1. Per tool field map from the catalog. A write with a missing or ambiguous branch field is refused. A PR needs head `agent/...` on a listed repo, with any base. |
| O6 | A local server named like the connector could pass the prefix match (`src/shared/claudeConnectors.ts:225`) (High) | partly: owner servers are denied at start, but the prefix alone decides | The GitHub rule applies only when the connector's recorded URL is GitHub's official one; any other server with that prefix is refused. |
| O7 | `search_code` query can name other repos (Medium) | yes | The query must contain exactly one `repo:` naming a listed repo, and no other `repo:`, `org:` or `user:` and no `OR`/`NOT`. Otherwise refused, with negative tests. |

Outside coverage: completed (codex exec, profile deepseek-review, model deepseek-v4-pro).

### Eng outside voice (second DeepSeek pass, 2026-11-21)

| # | Finding (severity) | Verified | Disposition |
|---|---|---|---|
| V1 | `.github/workflows` writes on `agent/` branches run CI with repo secrets with no card (Critical) | yes, mode table | Owner eng D2: hold any `.github/` write in every write mode |
| V2 | Plan's rows bypass the existing grant path; the generic gate would deny or strip GitHub (Critical) | yes, `src/shared/claudeConnectors.ts:165`, `src/main/hooks.ts:702` | Applied: grant through `connectors`, rows narrow it |
| V3 | `~/.claude.json` readable by members (Critical) | yes, `src/shared/folderAccess.ts:134` walls only projects and history | Owner eng D3: wall it for every member |
| V4 | `SHOW_GITHUB` off would only hide UI; calls fall through `connectorAccess` (High) | yes, `src/shared/claudeConnectors.ts:305` | Applied: off drops GitHub from `spawnConnectorPlan` and refuses it in `connectorAccess` |
| V5 | A 2 min release lets one approval run twice when the call is slow (High) | yes, plan text | Applied: no time release. IN_FLIGHT leaves only on PostToolUse (R1 flag), PostToolUseFailure, the member's session ending, or the 24 h expiry |
| V6 | Own folder early allow precedes credential walls (Medium) | yes, `src/shared/folderAccess.ts:211` | Applied: D7 and eng D3 paths are checked before the own folder allow |
| V7 | Owner admin bypass defeats the main ruleset (Medium) | plausible | Applied: setup says no bypass list |

## NOT in scope
- Local clone, build and test: deferred by D8, in TODOS.md "Local build and test for members with GitHub".
- App-built git tools, broker git proxy, local held-push copy (D5, superseded by D8).
- Read-only npm mirror (D4, superseded by D8): only useful with a local build.
- Per office GitHub App identity: not proposed this land.

## What already exists
- Connector gate and deny rules: `src/shared/claudeConnectors.ts`, `src/main/hooks.ts`.
- QuickBooks per member Read only, with a fail-closed tool list: `src/shared/quickbooks.ts`.
- Send on approval store, card and decide IPC: `src/shared/mailProposals.ts`, `src/main/index.ts:6582`.
- Secret shape patterns: `src/shared/dataClasses.ts`.
- Credential walls: `src/shared/folderAccess.ts`.
- Nick's pack card connection `github`: `resources/packs/saas-consulting.json`. Today this points at the REST integration; switch it to the Claude connector.

## Dream state delta
12 month ideal: any member can work on code safely, with outside services through
Claude's connectors under per member modes and owner approvals, and local builds where
needed. This land delivers GitHub under modes. Still missing: local builds (TODO), and
the generic "suggest a connector" path for every service (D9, started here with the
prompt lines).

## Failure modes registry

| Codepath | Failure | Rescued | Test | User sees | Logged |
|---|---|---|---|---|---|
| hook rule | config unreadable | Y | Y | retry reason | Y |
| visibility | network/rate limit | Y | Y | retry reason | Y |
| held store | write fails | Y | Y | retry reason | Y |
| allow | double use race | Y | Y | second refused | Y |
| connector | upstream tool renamed | Y (refused) | Y | "not allowed" | Y |

No CRITICAL GAPS.

## Live probes before ship
1. Add GitHub's official connector to Claude and grant it to a test member. Record the
   exact tool names and argument shapes (`owner`, `repo`, `branch`) into the catalog.
2. In each mode, call every write tool; confirm allow, refuse or hold matches the table.
3. Confirm the anonymous visibility GET distinguishes a public from a private repo.
4. Run Firebase `hosting:github` on a test repo: preview link on PR, deploy on merge.
5. Confirm a GitHub ruleset on main refuses a direct write made through the connector.

## Implementation Tasks
- [ ] **T0 (P1, human: ~2h / CC: ~20min)** — catalog — add GitHub's official connector to a test Claude account, record every tool's name, URL and branch/repo fields
  - Surfaced by: outside voice O5, O6
  - Files: `src/shared/github.ts` (catalog constant)
  - Verify: live probe 1
- [ ] **T1 (P1, human: ~1d / CC: ~1h)** — github rule — `githubAccess` mode table, repo and branch match, fail-closed catalog
  - Surfaced by: D1, D8, outside voice O1, O4, O6, O7
  - Also: refuse trimmed writes, GitHub resource calls, non-official URL, loose search queries
  - Files: `src/shared/github.ts`, `test/github-access.test.cjs`
  - Verify: `node --test test/github-access.test.cjs`
- [ ] **T2 (P1, human: ~1d / CC: ~45min)** — hook — wire GitHub beside QuickBooks, log every decision, pulse gate `github`
  - Surfaced by: Sections 1, 3, 8, eng V2 (grant path), eng R1 (shim keeps one error flag for GitHub calls)
  - Files: `src/main/hooks.ts`, `src/main/hive.ts` (hook shim), `src/shared/claudeConnectors.ts`, `src/shared/pulseSafety.ts`
  - Verify: hook tests, plus live probe 2
- [ ] **T3 (P1, human: ~1d / CC: ~45min)** — visibility — background anonymous repo check, cache read by the hook only, flip rule, stale cache refuses writes
  - Surfaced by: D1, Section 2, outside voice O3
  - Files: `src/main/github.ts` (new)
  - Verify: unit test with stubbed fetch
- [ ] **T4 (P1, human: ~2d / CC: ~1.5h)** — push on approval — held store, Ask me card, one-time allow (hash, 24 h, single use), inbox notes
  - Surfaced by: D3, D6, outside voice O2, eng R1 (error flag), eng V5 (no time release), eng D2 (`.github/` held)
  - Files: `src/shared/githubProposals.ts`, `src/main/index.ts`, Ask me card component
  - Verify: race test in both orders, live probe 2
- [ ] **T5 (P1, human: ~1d / CC: ~1h)** — capabilities UI — repo rows with mode, public line, connector setup help
  - Surfaced by: Section 11, design review UI-D3, UI-D6, UI-D8, plus the held card per UI-D4, UI-D5, UI-D7, UI-7
  - Files: `src/renderer/src/components/CapabilitiesTab.tsx`, Connections settings component, a new GitHub card beside `MailProposalCards.tsx`, `en.json`
  - Verify: `/design-review` on the screen
- [ ] **T6 (P1, human: ~2h / CC: ~15min)** — walls — deny gh, git, netrc, npmrc credential files and `.claude.json` (both locations) for every member, checked before the own folder allow
  - Surfaced by: D7, eng D3, eng V6
  - Files: `src/shared/folderAccess.ts`, `test/folder-access.test.cjs`
  - Verify: test
- [ ] **T7 (P1, human: ~3h / CC: ~20min)** — job text — Nick's GitHub lines (D6); every member's prompt lists Claude connectors that exist but are not granted, and says to ask Michael (D9)
  - Surfaced by: D6, D9
  - Files: `src/main/hive.ts` (injectedPrompt), `resources/packs/saas-consulting.json`
  - Verify: prompt test; behavior replay (memory `office-orchestration-principles`)
- [ ] **T8 (P2, human: ~2h / CC: ~15min)** — flag and docs — `SHOW_GITHUB`, `docs/FEATURES.md`, CHANGELOG behavior changes section
  - Surfaced by: Sections 9, 10
  - Files: `src/shared/buildFeatures.ts`, `docs/FEATURES.md`
  - Also: off removes GitHub from `spawnConnectorPlan` and refuses it in `connectorAccess` (eng V4)
  - Verify: test with the flag off proves a granted GitHub call is refused

## Unresolved decisions
None.

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| D1 owner | modes and list, enforced outside agent | modes + list + agent/ + PR | none | approved (route superseded by D8) | "Your design, adjusted" |
| D2 owner | review mode | SCOPE REDUCTION | none | approved | "Scope reduction" |
| D3 owner | Push on approval in first land | kept | none | approved | "Keep it in the first land" |
| D4 owner | npm | kept | dropped by D8 | superseded | D8 answer |
| D5 owner | app tools route | app tools | Claude connector | superseded | D8 answer |
| D6 owner | behavior changes | as listed | none | approved | "Accept as listed" |
| D7 owner | credential file walls | every member | none | approved | "Deny them for every member" |
| D8 owner | Claude connector with hook modes | connector | none | approved | "go with recommendation" |
| D9 owner | prefer Claude connectors, agents suggest them | standing rule | none | approved | D8 answer text |

Approval readiness: PASS (D1, D3, D6, D7, D8, D9 checked against their answers; D4 and D5 superseded by D8).

## Eng review (2026-11-21)

Target: this file. Scope record: feature answers D1, D3, D6 to D9 (CEO review); structure: smaller arrangement, auto-decided under the owner's standing rule against file layout questions (memory `no-code-arrangement-questions`): `src/shared/github.ts` (pure mode rule and held-call state machine) and `src/main/github.ts` (visibility cache and held-call store), 2 new modules instead of 3; accepted scope: as reviewed by CEO; pending remedies: R1.

### Decision ledger (eng)

### R1: How an approved write learns it really succeeded
Finding: 1, CRITICAL, confidence 9/10, `src/main/hive.ts:6408` (`if (ev === 'PostToolUse' || ev === 'PostToolUseFailure') { delete payload.tool_response; delete payload.error; }`), reviewer Claude.
Plan baseline: outside voice O2 repair: APPROVED -> IN_FLIGHT at PreToolUse -> USED on PostToolUse success, back to APPROVED on PostToolUseFailure.
Runtime evidence: the hook shim drops tool_response, so the app sees only the event name. Whether Claude Code sends PostToolUse or PostToolUseFailure when an MCP tool returns an error result (GitHub 422) is unknown (needs live probe 2).
Comparison grid:

| Choice | Current | A | B |
|---|---|---|---|
| R1 success signal | event name only | keep one boolean `is_error` from the MCP tool_response for GitHub calls; USED only when false | event name only; USED on any PostToolUse |
| One use per approval | approved (O2) | unchanged | unchanged |
| Failed write | returns approval (O2) | returns approval | needs a new approval card |

Question D1:
D1 — R1: How should an approved GitHub write know it really went through? Approved held writes may run once. The app marks the approval used when the call ends, but the hook strips the result (`src/main/hive.ts:6408`), so a write GitHub refused (for example a ruleset or a stale branch) can look like a success. A: keep one yes/no "was it an error" flag for GitHub calls only. B: treat any finished call as used. Recommendation: A, because the owner should not have to approve the same write twice for a GitHub hiccup. Completeness: A=9/10, B=7/10.
Header: Write success
Options:
A) Keep an error flag (recommended)
For GitHub connector calls only, the hook shim keeps a single boolean from the tool result (is it an error) and drops the rest; USED only on a non-error result, otherwise the approval returns. Effort S (human ~3h / CC ~20min), risk low. Needs live probe 2 to confirm the flag's field name.
B) Any finished call counts
No shim change; a refused write still uses up the approval and Nick must ask again, which files a new card. Effort S (zero implementation work), risk low.

State: approved
Actual answer: A, "Keep an error flag (recommended)", owner 2026-11-21
Accepted scope: for GitHub connector calls only, the hook shim keeps one boolean (is the MCP result an error) from tool_response and drops the rest; the app correlates Pre and Post by tool_use_id; USED only on a non-error PostToolUse; an error result or PostToolUseFailure returns the approval to APPROVED; live probe 2 confirms the field name; tests for both flag values.
History: none

### OV1: Workflow file writes (eng D2)
Finding: V1, CRITICAL, confidence 9/10, mode table, reviewer DeepSeek V4 Pro (verified by Claude).
State: approved
Actual answer: A, "Hold them in every mode (recommended)", owner 2026-11-21
Accepted scope: any write touching `.github/` is held for the owner card in Pull and push and Push on approval, refused in Pull only; tests for each mode.

### OV3: Claude account file (eng D3)
Finding: V3, CRITICAL, confidence 9/10, `src/shared/folderAccess.ts:134`, reviewer DeepSeek V4 Pro (verified by Claude).
State: approved
Actual answer: A, "Wall it for every member (recommended)", owner 2026-11-21
Accepted scope: `~/.claude.json` and its `CLAUDE_CONFIG_DIR` location added to every member's sandbox read deny and file tool deny rules, checked before the own folder allow; test.

### Section 1: Architecture

- [INFORMATIONAL] (confidence: 8/10) `src/main/hive.ts:6408`: Post events carry no result. Resolved by R1.
- [INFORMATIONAL] (confidence: 8/10) `src/main/hooks.ts:1505` (`toolUseId: typeof p.tool_use_id === 'string' ? p.tool_use_id : undefined`): tool_use_id is already parsed. The IN_FLIGHT state keys on it, so a crashed call is released when its session ends (eng V5), never on a timer.
- Design twice. Shape 1, picked: GitHub-specific `githubAccess(cap, tool, input, visibility)` beside `quickbooksAccess`. Shape 2: one table-driven `connectorModes` gate, with QuickBooks as a two-mode entry and GitHub as a three-mode entry with repo and branch argument rules. Shape 1 is picked because GitHub's argument rules (repo, branch prefix, search query) have no QuickBooks counterpart, so a shared gate would be a shallow wrapper today.
- Red flags:
  - Flag 6, two ways to do one task: QuickBooks Read only and GitHub modes are two mode gates. Accept for now, and revisit when a third connector gets modes (D9 makes that likely).
  - Flag 8, hand-synced list: the GitHub tool catalog in `github.ts` mirrors the live connector. It fails closed, and T0 records it from the real catalog.
- Distribution: no new artifact. The build flag `SHOW_GITHUB` rides the normal Mac and Windows release.

Dispositions: R1 approved (D1). The rest need no change.

### Section 2: Code quality

- [INFORMATIONAL] (confidence: 8/10) `src/shared/mailProposals.ts:319` (`SENDING_NAME`): the held-call card can share the Ask me card frame and decide IPC shape with mail proposals. The states differ, though: mail is sent by the app, while GitHub is re-run by the agent. Keep separate stores. No extraction, because the shared code is UI only.
- [INFORMATIONAL] (confidence: 7/10) `src/shared/quickbooks.ts:110`: keep refusal reasons in the same "Do not try another way; tell Michael" voice, with no dashes in user-facing text (memory `no-dashes-in-user-facing-copy`).

Dispositions: no change needed.

### Section 3: Tests

```
CODE PATHS                                         USER FLOWS
[+] src/shared/github.ts githubAccess              [+] Owner sets repo rows
  ├── [GAP] mode x tool class table (all cells)      ├── [GAP] add row, duplicate, invalid name
  ├── [GAP] unknown tool refused                     └── [GAP] public repo default hold
  ├── [GAP] repo normalize + not listed            [+] Held write
  ├── [GAP] branch prefix agent/ (main, agent, agentx/) ├── [GAP] [→E2E] approve, Nick re-runs, write lands
  ├── [GAP] PR head agent/, any base                 ├── [GAP] decline with note
  ├── [GAP] search query exactly one listed repo:     └── [GAP] expire after 24 h
  ├── [GAP] trimmed input refused (O1)
  ├── [GAP] resource calls refused (O4)
  ├── [GAP] non-official connector URL refused (O6)
  ├── [GAP] .github/ write held in Pull and push, refused in Pull only (eng D2)
  ├── [GAP] GitHub not in connectors grant -> refused before rows (V2)
  └── [GAP] SHOW_GITHUB off -> granted call refused, stripped at spawn (V4)
[+] held-call state machine
  ├── [GAP] APPROVED -> IN_FLIGHT -> USED (non-error)
  ├── [GAP] error flag true -> APPROVED (R1)
  ├── [GAP] PostToolUseFailure -> APPROVED
  ├── [GAP] session ends while IN_FLIGHT -> APPROVED; slow call never released early (V5)
  └── [GAP] two retries, both orders: one allowed
[+] src/main/github.ts visibility
  ├── [GAP] public, private, network error, stale > 30 min
  └── [GAP] private -> public flip refuses writes
[+] hooks.ts wiring: [GAP] config unreadable refuses (fail closed)
[+] folderAccess.ts: [GAP] D7 and .claude.json deny paths for every member, before own folder allow (eng D3, V6)

COVERAGE: 0/30 paths tested (all new code)  |  GAPS: 30 (1 E2E)
```

All gaps are required proof of approved behavior (D1, D3, D7, D8, O1 to O7, R1), so no new test choices were asked. Tests go in the existing `node --test` suite as table-driven rows:
- `test/github-access.test.cjs` (new) for the rule and state machine;
- extend `test/claude-connectors.test.cjs` for the hook wiring;
- extend `test/folder-access.test.cjs` for D7.

Value: protects=Pull only never writes; fails_when=a write tool is missing from the refuse set or an unknown tool defaults to allow; why_new=no GitHub gate exists; seam=none; no_claim=real connector tool names (fixture catalog; live probe 2).

The E2E is live probe 2, run by hand against a test repo before ship.

Tests made obsolete: none.

### Section 4: Performance

No issues found. The hook does a constant-time table lookup and a map read per GitHub call. The visibility refresh runs at most once per listed repo every 10 min, off the hook path.

## Reality rows


## Reality rows

| Premise | Claim | Receipt | Verdict |
|---|---|---|---|
| Shell has no network | empty strict allow list for every member but Research | src/shared/webAccess.ts:43 | verified |
| Broker reachable only via MCP servers | MD_BROKER_URL only in MCP config | src/main/index.ts:3918 | verified |
| QuickBooks per member Read only in hook | quickbooksAccess | src/shared/quickbooks.ts:110 | verified |
| Hook is synchronous | handle() called inline | src/main/hooks.ts:355 | verified |
| Big MCP inputs trimmed | tool_input_trimmed | src/main/hive.ts:6488 | verified |
| No GitHub connector on owner's Claude account | live `claude mcp list` 2026-11-21 | command output | verified |
| GitHub official connector tool names and fields | from research, not live | none | unverified (T0) |

REALITY: premise-table finding unverified=1 (connector catalog, T0) src/shared/quickbooks.ts:110
REALITY: already-done pass no GitHub connector work on origin/main since 2026-11-14 src/shared/claudeConnectors.ts:1
REALITY: surface-check finding connector tool names and arguments unverified until T0 src/shared/claudeConnectors.ts:225
REALITY: binding-decisions pass D1 to D9 recorded, memory prefer-claude-connectors honored docs/designs/github-connector-modes.md:1
REALITY: numbers pass 60 per hour unauthenticated limit [estimated], 10 and 30 min cache [estimated], 24 h expiry [estimated] docs/designs/github-connector-modes.md:1
REALITY: deferred-asks pass no linked issue; local build deferred to TODOS by D8 TODOS.md:290
REALITY: pr-count pass one PR, no ship policy file docs/designs/github-connector-modes.md:1

## Completion summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SCOPE REDUCTION                             |
  | System Audit         | shell has no network; broker only via MCP;  |
  |                      | QuickBooks hook pattern reusable            |
  | Step 0               | D1 modes+list, D3 keep hold, D4 npm (later  |
  |                      | superseded), D8 Claude connector route      |
  | Section 1  (Arch)    | 1 issue found (route, resolved D5 then D8)  |
  | Section 2  (Errors)  | 8 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 9 threats, 4 High impact, 2 fixed by D7/O6  |
  | Section 4  (Data/UX) | 5 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 1 issue (share mail card, not copy)         |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 2 risks flagged (Windows, other engines)    |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1           |
  | Section 11 (Design)  | 0 issues; /plan-design-review recommended   |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 8 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 5 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 1 item (local build, deferred by D8)        |
  | Scope proposals      | 0 proposed, 0 accepted (REDUCTION)          |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex deepseek-review, completed, 7 found   |
  | Lake Score           | 2/3 recommendations chose complete option   |
  | Diagrams produced    | 4 (architecture, data flow, state, error)   |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows, 1 unverified                      |
  +====================================================================+
```

## Eng reality rows

REALITY: premise-table finding unverified=2 (connector tool names T0; MCP error flag field name, probe 2) src/main/hive.ts:6408
REALITY: already-done pass no GitHub connector work on origin/main since 2026-11-14 src/shared/claudeConnectors.ts:165
REALITY: surface-check finding connector tool names and result error field unverified until T0 and probe 2 src/main/hooks.ts:1505
REALITY: binding-decisions pass CEO D1 to D9 and eng R1, D2, D3 honored; layout auto-decided per memory no-code-arrangement-questions docs/designs/github-connector-modes.md:1
REALITY: numbers pass 256 KB hook frame [measured: src/shared/hookEvents.ts:4]; 24 h expiry and 10/30 min cache [estimated] src/shared/hookEvents.ts:4
REALITY: deferred-asks pass no linked issue; local build in TODOS TODOS.md:290
REALITY: pr-count pass one PR docs/designs/github-connector-modes.md:1

Eng completion: Scope Challenge scope accepted as-is (smaller module arrangement); Architecture 1 critical (R1) plus 2 informational; Code quality 2 informational; Tests 30 gaps, all required proof, test plan artifact written; Performance no issues; outside voice 7 findings (3 critical, 2 high, 2 medium), 2 decided by the owner, 5 applied as required repairs; 0 unresolved.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: SCOPE_REDUCTION, 0 critical gaps |
| Outside Review | `codex exec -p deepseek-review` (adversarial) | Independent 2nd opinion | 2 | completed | CEO pass 7 findings, 7 resolved; eng pass 7 findings, 7 resolved; 0 unresolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 issues (R1, V1, V3 decided; V2, V4 to V7 applied), 0 critical gaps open |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score: 5/10 → 9/10, 7 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex CLI, profile deepseek-review (deepseek-v4-pro), plan-review phase, two completed passes (CEO and eng). Eng pass: 7 findings, all verified against code and resolved.
- **DESIGN:** HTML mockup with app tokens; passes IA 5→9, states 4→9, journey 6→8, AI slop 7→9 (removed a colored card border), design system 8, accessibility 4→9; no outside design voice (owner declined).
- **VERDICT:** CEO + ENG + DESIGN CLEARED, ready to implement after T0 (live connector catalog).

NO UNRESOLVED DECISIONS
