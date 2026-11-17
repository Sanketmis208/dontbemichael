# A team member attaches files from its folder to an email

Status: built 2026-11-16 on the running branch, after a red-team pass on the design the same day.
The owner took the recommended default for both decisions at the end.

## Request (owner, 2026-11-16)

Screenshot: Pam's card "Investment account in QuickBooks" asks the owner to reply to Shivam's
16 Nov email himself, attaching ten Interactive Brokers statements (`ib_jan2026.pdf` to
`ib_oct2026.pdf`) from the `interactiveBrokers` folder, because "Pam's email tool can't attach
files from a folder". Asked why, then: "Yes, design it".

## Why the owner gets asked today

The email tool attaches files only by reference to another email, and only from the mailbox
doing the sending (MB-8, owner 2026-09-26, `docs/designs/multi-mailbox.md`). `attach_from` and
`forward` take `{mailbox, id}`. The app then fetches that email itself, so it always knows where
a file came from. No tool input carries bytes or a path (`src/main/mail.ts`, the MB-8 comment in
`handleMailRequest`). The only files that go out by path are ones the app made itself, such as
the case study PDF (`ComposeInput.files`, never set from an agent's input).

Pam's statements never came in by email, so `attach_from` has nothing to point at, and the owner
digs the files out of a folder and sends the reply himself.

Goal: the member attaches the files itself, under the same sending setting the owner already chose
for it. The app reads only files the member itself is allowed to read. What goes out is exactly
the copy taken when the member asked.

## What already exists

| Need | Reuse | Where |
|---|---|---|
| Sending settings: Can send, Send on approval, Draft only | `sendingMode`, `mailAccess` | `src/shared/mailboxes.ts` |
| An email the owner approves before it goes | `propose`, the proposal card, `send` with the proposal id | `src/main/mail.ts`, `src/main/mailApprovals.ts`, `MailProposalCards.tsx` |
| Standing approvals refuse attachments | `standingProblem` (checks `forward` and `attachFrom` today) | `src/shared/mailProposals.ts` |
| Sending app-held bytes as attachments | `ComposeInput.files`, already in the send key hash | `src/main/mail.ts` |
| The walls a member's shell has | `folderPolicy(...).sandbox` (denyRead, allowRead) | `src/shared/folderAccess.ts` |
| The member's file tool check | The PreToolUse hook's folder check | `src/main/hooks.ts`, `folderDecision` |
| A child process that reads a file, with a time limit | `docTextProcess` | `src/main/docTextProcess.ts` |
| What a file really is, from its bytes | `attachmentKind` | `src/shared/attachmentKind.ts` |
| Opening a held file in its own app, marked as from outside | The email tab's `mail:openAttachment` | `src/main/index.ts` |
| A folder agents' tools and shells may not open | `appPrivate` (`<harnessHome>/private`) | `src/shared/folderAccess.ts` |

No new dependency is needed.

## The tool

`propose` and `send` take one more field: `attach_files: [path, ...]`. So does `draft`, in the
member's own mailbox. Each path is absolute or relative to the member's own folder.

```
member -> md-mail -> propose/send/draft { ..., attach_files }
                       |
   broker: hook folder check for a read by this member -- no --> refused, says which and why
                       |
   reader process, under the member's own sandbox walls, time limited:
           open, plain file, one name, size -> bytes and sha256
                       |
   main: kind from the bytes -> copy into <harnessHome>/private/outgoing/<id>/
                       |
        Can send:          sent now, from the copies
        Send on approval:  Ask me card lists the files; approved -> sent from the copies
        Draft only:        saved as a draft in the member's own mailbox, files on it
```

## Safety rules

Every rule is in main or the reader process, not in the agent's prompt.

1. **The sending setting decides, as for every email.** Can send sends. Send on approval puts the
   email on a card, and only the owner's Approve sends it. Draft only saves a draft. This keeps
   the owner's 2026-10-09 rule that Can send puts nothing on Ask me (decision 1). A standing
   approval never covers files: `standingProblem` adds `files` next to `forward` and
   `attachFrom`, so a standing send with files is refused before any check, and the member is
   told to use propose, whose card carries the files.
2. **Only what the member could read itself.** First the path must pass the hook's own folder
   check for a read by that member: its real path, the member walls, the Research wall and its
   scratch folders. Then the file is read by a short-lived child process that runs inside the
   member's own sandbox walls, the same `denyRead` and `allowRead` its shell has. The operating
   system enforces those walls on the real file. A link partway down the path, or a folder swapped
   at the right moment, cannot reach the app's private folder or another member's folder.
   `appPrivate` and `engineRecords` are added to the reader's walls even for Michael. On macOS the
   walls are a sandbox profile; on Linux they use bubblewrap, and without it the field is refused.
   On Windows, Claude Code has no sandbox, so a member's shell can already read what main can.
   There the reader uses path checks only (real path, no link at the end, same file after the
   read), and this gives the member no reach it lacks today. The doc says so plainly.
3. **One plain file.** In the reader: a plain file with one name (`nlink` 1), opened without
   following a link at the end, read through one handle. A cloud placeholder (iCloud, OneDrive,
   Dropbox) downloads in that process, under a time limit of 45 s per file and 50 s for all of
   them [estimated], three files at a time, so the app never freezes.
4. **Kind from content, never the name.** The same allowed list as saving an attachment: PDF,
   Word, Excel, PowerPoint, plain text, CSV, PNG, JPEG, GIF, WebP. No programs, scripts, archives,
   HTML, SVG or macro files. The ending on the email comes from the kind found.
5. **Limits.** At most 20 files and 18 MB together, so one file is 18 MB at most too [estimated:
   the usual 25 MB message limit, less about a third for email encoding]. Anything over is
   refused before anything is copied, in plain words, so the member can split the email. The time
   limit to send, draft or copy to Sent grows with the message's size, up to two minutes, so the
   read and the send together stay inside md-mail's three minutes.
6. **The copies.** They live in `<harnessHome>/private/outgoing/<id>/`, beside the proposal kept in
   the app's data folder (`mail-proposals.json`). Every agent's tools and shell are barred from
   that folder on macOS and Linux. On Windows a member's shell could write there, so the sha256
   kept with the proposal is what protects them. `send` checks every copy's sha256 before anything
   goes, and a mismatch is refused.
7. **Cleanup.** A copy is deleted when its email leaves the waiting or approved state, whatever
   the move: sent, declined, changes asked, replaced, cancelled, handed back, the grant ended, or
   the sending setting changed. Copies for a card stuck in sending after an uncertain send stay
   until the owner settles that card. At start, any copy without a live proposal is deleted. One
   member holds at most 60 MB of waiting copies [estimated], so no member can fill the disk.
8. **Log.** The office log is committed and agents read it, so it records ids only, as now: one
   line per email with a file count and total size (`mail-sent-files`, or `files` on
   `mail-sent-approved`). File names, sizes, hashes and source folders stay on the card's record in
   the app's own approvals store, never in the log.

Mailboxes a member only sends from (Send only grants) take no `attach_files`. Their sent mail
lands in a mailbox another member reads, which would carry the file across the folder walls.

## The card (Send on approval)

The proposal card gains a Files list under the subject (mockup:
`docs/designs/agent-attach-files-mockup.html`):

- **Where the files came from:** the label says how many and the folder, as in "Files: 10, from
  interactiveBrokers". It names each folder when there are several.
- **Each row:** the file's name, its size and Open. Open hands the copy to its own app (Preview
  for a PDF), marked as from outside, in the same way the email tab opens an attachment. The owner
  sees the real pages, not extracted words.
- **Remove:** a remove button takes the file off this email, and the member hears which files the
  owner took off.
- **Long lists:** five rows show, then "Show all".
- **Folded card:** the summary line adds the count.
- **Info tip:** says the files are copies, taken when the member asked, and these exact files go
  out.

If a copy is gone or changed, Open on its row says the file is no longer kept, and the send
refuses it: the email is withdrawn and the member is told to propose it again with the files.

## Behavior changes

| Who | Today | Proposed | What the owner sees |
|---|---|---|---|
| Members on Send on approval | Ask the owner to attach a file and send the email himself | Propose the email with `attach_files` | One card with the files listed; no "send it yourself" cards |
| Members on Can send | Ask the owner to attach and send | Send the email with the files (decision 1) | The email in Sent; a log line with the count |
| Members on Draft only | Draft without files | Draft with the files in their own mailbox's Drafts | The draft in his mail app, files on it |
| Members and Michael | No rule | New rule: never ask the owner to attach and send a file from a folder; attach it. Ask only when it was refused, and say why | Fewer cards; a refused file still reaches him, with the reason |
| New hires | No mailbox | Unchanged: the tool needs a mailbox the owner gave | Nothing new |

Agents already running get the field at their next start. Engines without md-mail (TODOS.md,
issue 109) and mail through a Claude connector are not covered, so those keep asking.

## Open cards

Pam's card does not change by itself. After this ships, answering "I need help" or writing
"attach them yourself" sends it back to Pam, and she attaches the ten files.

Before relying on this case: the `interactiveBrokers` folder must be in Pam's own folder or on a
Company foundations card for her job (decision 2). If it sits only in the business folder, Pam
cannot read it today, and this change would refuse it too.

## Tests

| Test | Proves |
|---|---|
| `test/agent-attach-files.test.cjs` | The paths an agent gives; the sandbox profile and bubblewrap arguments; the reader refuses a link, a hard link, a folder and a file too big; on a Mac the real sandbox refuses a link partway down the path into the app's private folder and another member's folder; only own and granted folders, the member's check first, kinds from the bytes; a slow file and files too big together; copies checked by hash and swept; the store frees copies on every way out of waiting or approved and the owner may take files off; Send on approval sends the kept copies the owner left, not the files on disk; a lost copy withdraws the email; Can send sends, Draft only drafts, grants and standing approvals refuse; the per member cap; the send time limit; the card and the wiring |
| `test/askme-department-colors.test.cjs` (changed) | The folded card's summary pin also covers the file count |

Live check before calling it done: a real member on Send on approval proposes a reply with two
PDFs from its folder in a test mailbox. The owner opens one from the card and approves, and the
email arrives with both files. A member on Can send then sends one. A link to the app's private
folder placed in a member's folder is refused.

## Tasks

1. The reader: a child process given the member's walls, with the macOS profile, bubblewrap on
   Linux and path checks on Windows, plus tests.
2. `outgoingFiles.ts` in main: the hook check, limits, kind, copies with hashes, cleanup and the cap.
3. `handleMailRequest`: `attach_files` on draft (own mailbox), propose and send, by sending
   setting. `standingProblem` and its fallback. The copies become `ComposeInput.files`. The send
   time limit grows with size.
4. `MailProposal.files` and cleanup on every state move in `mailApprovals.ts`.
5. The md-mail tool schema and descriptions.
6. The card's Files list, Open and remove. Strings in English and the other languages.
7. Rules in `hive.ts` for members and Michael. The office floor keeps its words for sending,
   proposing and drafting; attaching is part of those calls.
8. `docs/FEATURES.md`. A note in `multi-mailbox.md` under MB-8 that files from a folder are now
   read inside the member's own walls.

About 14 files [estimated].

## Not in scope

- Files outside the member's folder and its foundations folders, such as Downloads.
- Mailboxes a member only sends from.
- Links to shared files (Dropbox, Google Drive) in place of attachments.
- Connector mail, and engines without md-mail.
- Changing MB-8 for files from other emails.

## Decisions for the owner

Answered 2026-11-16: the recommended default for both.

**1. Can send members and files.** Chosen: the sending setting decides, as it does for every
other email. A member on Can send sends files without a card, and one on Send on approval gets a
card. This keeps the 2026-10-09 rule that Can send puts nothing on Ask me. The member can attach
only files it can already read, and it could already paste their text into an email. The
alternative is that every email with files from a folder gets a card, even on Can send. That is
safer for office documents. But it needs an exception to the 2026-10-09 rule, and changes to the
check that refuses `propose` on Can send and to the start-up step that hands those cards back.

**2. Which folders files may come from.** Chosen: everything the member can read for its
work, which is its own folder plus the folders the owner named for its job on a Company
foundations card. The alternative is its own folder only. That is narrower, but a member working
from a shared foundations folder (such as Finance) would first have to copy the file across.
