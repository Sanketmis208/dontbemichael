# Telemetry

**The app sends no usage data.** It has no code that reports how you use it: no
launch counts, no feature counts, no message counts, and no install id.

The app does keep its own record of each team member's token use, cost and tool
calls, read from the engine's OpenTelemetry output over a local connection
(`src/main/telemetry.ts`). That record feeds the cost figures, the circuit
breaker and Pulse. It stays on your computer and is never sent anywhere.

What the app does send is listed below: automatic failure reports, and a case
study only when you choose to send one.

## Automatic failure reports

Official builds report failures that the developers can fix in code, so they
get fixed even when nobody writes in (docs/designs/auto-report-failures.md).
They are always on; there is no switch in Settings.

**What counts.** A crash of the app or of a screen, a team member's terminal
ending abnormally, a message the router could not deliver because of a bug, a
team member stuck in a loop, and failures in the app's own plumbing (its hook
channel, a provider bridge, a background check whose answer could not be read).
Anything you or your team can fix (a sign in, credit, your own spending caps,
a wrong recipient, Research being off) is never reported.

**What a report holds.** Closed fields only:

| Field | Example | Notes |
| --- | --- | --- |
| `kind` | `agent-exit` | One of a fixed list |
| `detail` | `SIGSEGV` | One of a fixed list per kind |
| `errorName` | `TypeError` | Letters only |
| `frames` | `out/main/index.js:Hive.routeOnce:3644` | At most 8, only the app's own files; anything else is dropped |
| `fingerprint` | `0123456789ab` | A hash that groups the same failure |
| `appVersion`, `os`, `osVersion`, `arch` | `0.2.9`, `darwin`, `15.1.0`, `arm64` | |
| `engine`, `engineVersion` | `claude`, `2.1.309` | The engine the failure ran on; the version only when the app has read it (Claude Code), else `unknown` |
| `count` | `3` | How often it happened in this version |
| `context.role`, `context.uptime` | `member`, `1-4h` | Which kind of team member it was (`michael`, `research` or `member`, never a name) and how long the app had been running, in rough bands |
| `context.origin`, `context.reason` for an app crash | `pkg:better-sqlite3`, `error` | Where the crash's first stack frame was (`node`, `electron`, `app`, one of the app's own bundled packages by its name, `other` or `none`) and what was thrown (`error`, `string`, `object`, `none` or `other`); a path outside the app never names anything |
| `context.*` for a stuck team member | `limit` `5`, `limitSet` `invalid`, `codes` `529-529`, `sinceSuccess` `never` | The breaker's limit and whether it is the default or yours, how many times it was reached, Hard stop on or off, how long since the last new step, the tool name if it is one of Claude Code's own (any other tool is only `mcp` or `other`), and for errors the HTTP status numbers and rough times |

Context values are a word from a fixed list, a whole number, a time band
(`under-1m` to `over-4h`) or the name of one of the app's own bundled packages, checked again
before anything is sent.

**Never sent:** error messages, log lines, terminal output, your office, team
member or customer names, file paths outside the app, mail, or anything you
typed.

**Where it goes.** The app files each report as an issue in the private
repository `dontbemichael-reports/failures`; an hourly job re-renders the valid ones, field by field, into
public issues labelled `auto-report` on the main repository. Each computer
keeps its own copy in `failures.jsonl` in the app's data folder, which is also
where reports wait while you are offline.

**To stop it:** set `DO_NOT_TRACK` (any value other than `0`), in the
environment or exported in your login shell profile (`~/.zshrc`, fish
config), which the app reads shortly after it starts and before it sends
anything; the app still keeps the local file but sends nothing. Builds from source never send: the key
is injected only in official release CI.

## Case studies you send us

Pulse has a **Get featured** button. It builds a case study page from your own office, laid out as
a web page we can publish: your business name, city and website, a short story of how the office
work went before, your team's roles, what each did, the names and times of their scheduled jobs and
what each is connected to (such as Email or QuickBooks, never an address), and the counts Pulse
shows for the period, spend included. Nothing on the page is an estimate, and the app
writes no customer names, email subjects or bodies, file names or anything from a team member's
memory.

- **Nothing leaves unless you press Send.** You see the whole page first. The app writes it from your
  office's own figures for the last 30 days, and its words can't be changed by hand, so nothing on it
  is typed in beside the counts. If you don't want it published, don't send it.
  Send goes from one of your own connected mailboxes to hello@dontbemichael.com, with the page
  attached as a web page (HTML) and a PDF copy, and only after you tick that Don't Be Michael may publish it on its website and
  will take it down if you ask. The email is in your Sent folder like any other.
- **Your logo is read from your own website.** When you press Get featured, the app reads the home page
  of the website in your company profile and the logo image it names, once, over HTTPS, from public
  addresses only, and keeps the logo in your office's private folder. That website sees an ordinary
  web request from your computer. It is the one time the app itself reads a web page; everything
  else on the internet goes through your Research team member. The page always shows your business
  name, logo and website.
- A case study is a submission you choose to make, not usage data: the app does not tell us that
  you opened the screen, and nothing is sent in the background.
