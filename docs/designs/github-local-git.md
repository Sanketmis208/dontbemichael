# GitHub as a standard capability: local git, app pushes

Status: owner approved the direction 2026-11-26 (G1 to G4). First build on the running branch 2026-11-26 (flag SHOW_LOCAL_GIT); not yet tried by a member in the live office. Extends
`docs/designs/github-connector-modes.md`; its modes, repo list, held card and
visibility rules stay and are reused here.
Research: deep research run 2026-11-26 (24 of 25 claims confirmed; sources below).
Adversarial review: one pass, 2026-11-26 (`codex exec -p deepseek-review`); its 10 findings are folded in below.

## Problem

A small business owner learned that git is how their website is managed, and hired
an IT member to change it. Today the member works only through GitHub's MCP tools,
which read well but write only whole files (`create_or_update_file`, `push_files`).
On 2026-11-26 Nick could not raise a word limit from 981 to 983 because the number
sits in a 196 KB test file: one call would have to carry the whole file, which is
more than a model writes in one turn and more than the hook frame (256 KB,
`src/shared/hookEvents.ts:4`) can carry for checking. He sent the owner an Ask me card
to edit one number on GitHub.

Doing nothing: every edit to a big file, every multi file refactor and every change
that needs a local test run lands on the owner. The capability we sell ("hire an IT
engineer") does not hold for real code.

## What other agents do (research, 2026-11-26)

Every hosted coding agent checked works on a real local clone with real git, keeps
the GitHub credential out of the sandbox, and has a trusted piece outside the
sandbox carry out or check every push. A human merges.

- Claude Code on the web: git in the sandbox talks to a proxy; the proxy checks the
  push targets the configured branch, then adds the real token
  ([Anthropic](https://anthropic.com/engineering/claude-code-sandboxing)).
- GitHub Copilot cloud agent: no raw `git push`; a mediated push only to its own
  `copilot/` branch; draft PRs a human must approve and merge; workflows do not run
  on its pushes until approved
  ([GitHub](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)).
- Cursor Cloud Agents: org installed GitHub App; push a branch, open a PR; merge by
  people (convention, not enforced) ([Cursor](https://cursor.com/docs/cloud-agent/security)).
- Repo content is untrusted input; closing egress is the main defense
  ([OpenAI](https://developers.openai.com/codex/cloud/agent-internet)). Our shells are
  already offline, stricter than Copilot's and Cursor's defaults.

## Decisions

| ID | Decision | Answer |
|---|---|---|
| G1 | Reverse D5/D8 of the connector design: the app builds git support (a local clone per member and app tools that push), beside GitHub's MCP tools. | Owner 2026-11-26: "ok to reverse". |
| G2 | Agent behavior change: members with GitHub work on a real local clone (any size edit, local diff and tests) and push through the app's checks; a held push shows the real changed lines. | Owner 2026-11-26: "ok". |
| G3 | Git is expected on the owner's machine (or the owner installs it). The app checks for it when a member is given GitHub repos, which covers hiring an IT engineer. No bundled git. | Owner 2026-11-26. |
| G4 | Local git ships on Windows too, like every other feature (memory `windows-ships-every-release`), with the open shell network there accepted as a known risk. | Owner 2026-11-26: "Ship it on Windows". |

## The design

```
 GITHUB.COM  <==== token (app keeps it) ====  MAIN PROCESS (trusted)
     ^   |                                      |  mirror: <home>/private/git/<owner>/<repo>.git
     |   +--- fetch ----> mirror (bare) <-------+  validate push: repo, branch, mode, files
     |                      |  read only           hold -> Ask me card with the real diff
     +--- push agent/x -----|----------------------+
                            v
 MEMBER SHELL (sandbox, no network)        MEMBER TOOLS (md-git MCP, outside the sandbox)
   <member folder>/Code/<repo>/              git_sync  {repo}            -> main fetches upstream
   git fetch/pull from the mirror path       git_push  {repo, branch}    -> main takes the branch
   edit, commit, run tests                   (open the PR with GitHub's own
                                              create_pull_request, as today)
```

### Pieces

1. **Mirror (main process).** One bare mirror per granted repo under the app's
   private folder (no agent opens it, `src/shared/folderAccess.ts`). Main fetches into
   it from GitHub with the token passed per command (`http.extraHeader` from env,
   never in a URL, never in a config file). The mirror is made readable, not
   writable, to members who hold that repo, so their sandboxed shell can
   `git fetch origin` offline.
2. **Member clone.** On grant, main runs `git clone --no-hardlinks <mirror>
   <member folder>/Code/<repo>` once; `origin` points at the mirror path. The member
   commits locally like any developer. No credential exists anywhere the member can
   read (D7 deny list stays).
3. **md-git MCP server** (`resources/md-git-mcp.cjs`, same shape as md-mail: started
   outside the shell sandbox, talks only to the broker with the member's broker token,
   holds no rules):
   - `git_sync {repo}`: main fetches GitHub into the mirror; answers with what moved
     (branches, new commits on main). The member then runs `git pull` in its shell.
   - `git_push {repo, branch}`: the member first runs, in its own sandboxed shell,
     `git bundle create .md-push.bundle origin/main..<branch>` (job text gives the
     exact line). Main reads that one file (no links followed, size capped), loads it
     into a main only quarantine repo, checks it, then pushes or holds it. Main never
     opens the member's repo (see "Why a bundle").
4. **Push check (main, pure rule beside `githubAccess`).** In order:
   repo on the member's list; mode not Pull only; branch passes
   `git check-ref-format` and is a plain `agent/<name>` (letters, digits, `-`, `_`,
   `/`, `.`, no `..`, `@{`, wildcards or control characters); the bundle holds exactly
   that one ref; size limits (bundle, blob, file count, diff) and a timeout; base is
   read live (`git ls-remote`) and the push must fast forward it or create a new
   branch; visibility check (unchanged rules, fail closed); changed files from
   `git diff --no-ext-diff --no-textconv --no-renames --name-status <base> <tip>` in
   the quarantine repo. Push on approval, or any
   file under `.github/`, holds the push. Flags come from the real diff: workflow
   files, secret shapes (`src/shared/dataClasses.ts`), `.env` or key files, large or
   binary files, deletes, public repo.
5. **Held push card.** The existing GitHub held card (`GitHubHeldCards.tsx`) gains a
   "push" kind: repo, branch, commits with their messages labelled as the member's
   words, files changed with counts, flags, and the diff behind "Show the changes".
   Approve pushes exactly the held commit id (a later commit needs a new approval).
   At approval main reads the live base again; if it moved, the card is redone
   against the new base instead of pushing. The push itself is
   `git push --force-with-lease=refs/heads/<branch>:<base seen> <sha>:refs/heads/<branch>`,
   so a branch that changed after the check is never overwritten.
6. **Git check (G3).** When the owner adds a member's first repo row, main runs
   `git --version`. Missing: the row saves, and an InfoTip line says to install git
   (Mac: Xcode command line tools; Windows: git for Windows) and "Check again".
   Members without git keep the MCP tools only.

### What stays

GitHub's MCP tools stay for reading PRs, issues, Actions and logs, and for opening
the PR. Their whole file writes stay too, under the same modes, as the path for a
member whose machine has no git. Merging stays the owner's; members get no merge
tool. Michael brings the PR link; the owner merges on GitHub.

### Why a bundle, and how main runs git

A member controls everything in its clone: `.git/config`, hooks, attributes,
`objects/info/alternates` (which can point at other repos on disk), a `.git` that is a
link or a `gitdir:` file. Fetching from the clone would run git in the trusted process
against all of that (adversarial review, findings 1, 3 and 4). A bundle is one file:
refs plus a pack, with no config, hooks or alternates. Main:

- opens the bundle with `lstat` first (a link, a pipe or a second name is refused),
  under a size cap, then `git bundle verify` and `git fetch <bundle>` into the
  quarantine repo with `transfer.fsckObjects=true`;
- keeps the quarantine repo and pending refs main only, apart from the mirror members
  read, so another member never sees a held push (finding 6);
- runs every git command with an argument list (never a shell), a timeout, and
  `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_ATTR_NOSYSTEM=1
  GIT_TERMINAL_PROMPT=0 -c core.hooksPath=/dev/null -c core.fsmonitor=false
  -c diff.external= -c submodule.recurse=false`, and never recurses into submodules
  (gitlinks are shown as opaque; finding 8). The owner's own git settings never apply
  to app commands, so a `.gitattributes` in the repo can't pick a diff or textconv
  program (finding 2);
- runs these clone side steps in a git child process that has no token in its
  environment; only the final push to GitHub gets the token, from the quarantine repo
  the app wrote itself.

## Agent behavior changes (G2)

| Today | Proposed | Who | What the owner sees |
|---|---|---|---|
| Edits are whole file writes through GitHub's tools | Edits in a local clone, pushed with `git_push` | Members with GitHub rows and git present | Same PRs; big file edits no longer come back as owner cards |
| A held write shows the call's input | A held push shows commits and the real diff | Same | A card with changed lines and flags |
| No local tests on the real repo | Member runs tests in its clone (packages permitting, see open items) | Same | Fewer failing PRs |
| Job text: work through the GitHub tools | Job text adds: sync, branch `agent/...`, commit, `git_push`, then open the PR; never push or merge main | Members with GitHub rows | n/a |

## Errors

| Where | Fails | Rescue | Seen by |
|---|---|---|---|
| git missing | `git --version` fails | MCP tools only; owner told once | owner (InfoTip), member (tool says why) |
| sync | GitHub down, token bad, 404 | mirror unchanged; reason returned | member; owner card only for a bad token |
| push | not fast forward | refused: "pull, rebase on origin/<branch>, push again" | member |
| push | branch not `agent/`, Pull only, repo not listed | refused with the rule, as today | member |
| push | visibility unknown or flipped | refused, as today | member |
| push | GitHub rejects (ruleset) | GitHub's message passed through | member |
| held push | member commits again before approval | held commit stays; new tip needs its own approval | owner sees the newer card |

## Security

| Threat | Mitigation |
|---|---|
| Token leaks | Token lives only in main; passed per command by env; never in a file, URL or log |
| Push to main or force push | Branch rule plus fast forward check in main; optional GitHub ruleset as second layer |
| Workflow edit runs CI with secrets | Any `.github/` change held; owner's workflow approval for outside pushes stays in setup text |
| Member's git config or hooks run in main | Main never runs git in the clone; fetch from inside the mirror with hooks and fsmonitor off (R1) |
| Exfiltration through a git remote | Shell has no network; only main talks to GitHub, only for listed repos |
| Prompt injection from repo, issue or commit text | Existing outside text screening; push checks are code, not model judgment |
| Windows: no shell sandbox | The shell has open network there, so repo content could leave through it (finding 7). Accepted by the owner (G4): local git ships on Windows. The token stays in main and only main pushes, with the same checks; what is not closed there is repo content leaving through the shell. Revisit when Claude Code sandboxes Windows shells |
| Huge or crafted pushes | Caps on bundle, blob and file counts, diff size and time; `--no-renames`; card shows a summary past the cap (finding 9) |
| Odd branch names, refspec tricks | `check-ref-format`, plain `agent/<name>` only, one ref per bundle, argument lists only (finding 10) |
| Stale card, base moved | Live base read at check and at approval; push with `--force-with-lease` on the base seen (finding 5) |

## Open items

1. **Packages for tests** (D4 TODO). `npm ci` needs the registry. Recommendation: a
   later main process step that runs installs for the member with a registry
   allowlist. Until then members run what works offline and CI is read through
   the Actions tools.
2. **Token type.** Keep the fine grained token (pushes look like the owner's; the
   "approval from someone other than the last pusher" ruleset can't be used). A per
   business GitHub App later, once there is a way to keep its private key.
3. **Git version floor.** Pick a minimum git (recent security fixes for bundle and
   pack handling) and have the git check (G3) ask for an update below it.
5. **Windows.** Ships with local git (G4). The bundle path, lstat check and git
   options must be tested for Windows paths, junctions and `git.exe`; the Windows
   notes name the open shell network as the known gap.
4. **Disk.** Mirror plus one clone per member per repo; a size line in Storage.

## Rollback

Build flag `SHOW_LOCAL_GIT` (beside `SHOW_GITHUB`, `src/shared/buildFeatures.ts`). Off:
no clones, no md-git tools; GitHub MCP tools keep working as today.
