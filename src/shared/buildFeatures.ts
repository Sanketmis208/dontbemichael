/**
 * Surfaces this build hides from the owner. The code behind each stays wired,
 * so bringing one back is flipping its switch here and nothing else.
 */

/** Developer tools on Settings → Prerequisites: the git and Node.js rows, and
 *  every agent engine this build doesn't offer (BUILD_ENGINES). Owners only need
 *  Claude Code, uv and MemPalace; the rest read as problems ("NOT SET UP") that
 *  change nothing they see. git only keeps the office's own history and Node is
 *  covered by the app's bundled copy (owner, 2026-09-25). */
export const SHOW_DEV_TOOLS = false;

/** Automatic failure reports (docs/designs/auto-report-failures.md): failures
 *  the repo owners can fix in code are filed to GitHub, always on with no
 *  switch (owner D14) and separate from any usage stats (owner, eng D1);
 *  DO_NOT_TRACK still stops sending. Off turns off detection, the local file
 *  and sending in a release (R9); revoking the key stops sending at once. */
export const AUTO_FAILURE_REPORTS = true;

/** The "auto mode on / off" text in the header bar. It named a developer
 *  setting in words owners don't use, and it wasn't clickable. The setting
 *  itself is unchanged and stays in Settings → Agents
 *  (owner, 2026-09-24). */
export const SHOW_AUTO_MODE_LABEL = false;

/** The red close button on a team member's panel.
 *  It stopped the agent mid-task and archived it, with no button to bring it
 *  back and no return on relaunch, behind a confirm that spoke of a "PTY"
 *  (owner, 2026-09-24). Michael never had it. */
export const SHOW_CLOSE_AGENT = false;

/** "Block tools" and "stop after this step" on a team member's panel.
 *  Owners manage the team through Michael; the circuit breaker still
 *  steps in on its own when an agent loops or overspends (owner, 2026-09-25). */
export const SHOW_AGENT_BRAKES = false;

/** "Open a Terminal window here": the open button next to edit on each agent,
 *  and the terminal icon beside each
 *  folder in Michael's Command Center. A developer tool owners don't use
 *  (owner, 2026-09-24). */
export const SHOW_OPEN_TERMINAL = false;

/** The Auto / Pause switch in Michael's Command Center header, which holds
 *  every queued message for every agent. A power-user control owners had no
 *  use for (owner, 2026-09-24). While it is hidden, a pause saved earlier is
 *  cleared at launch, so no one is left with messages held and no switch to
 *  release them. */
export const SHOW_DELIVERY_SWITCH = false;

/** Office Theme in Settings → General: the switch that turns on TV show
 *  office maps and the map picker. Hidden (owner, 2026-09-26). While it is
 *  hidden the floor always shows the office, so a theme picked earlier cannot
 *  stay on with no way to turn it off. */
export const SHOW_OFFICE_THEME = false;

/** "Explain things simply" in Settings → General. Hidden (owner, 2026-10-02).
 *  The saved audience still applies: agents keep briefing in plain language
 *  when it was on, and nothing changes for an office that never set it. */
export const SHOW_SIMPLE_MODE_SWITCH = false;

/** Mailboxes: the Mailboxes block in Settings → Connections, the Email
 *  section on an agent's Capabilities tab, the mailbox option in the hire
 *  wizard, and the mailbox posts and tags on the office floor. While off, no
 *  agent is started with the md-mail server, even with email saved earlier.
 *  On in this build (docs/designs/multi-mailbox.md, plan section 9). */
export const SHOW_MAILBOXES = true;

/** Import hire in Add Agent: the "import hire…" button, its explainer and the
 *  "generate one with AI…" prompt. Hidden (owner, 2026-09-27); adding a team
 *  member is the form alone. The import code stays for when it comes back. */
export const SHOW_IMPORT_HIRE = false;

/** The hire wizard's engine chips and raw command line: developer options. A
 *  business owner picks only Best or Fast (hire redesign D3, owner 2026-09-27);
 *  every hire runs on the engine set in Settings. */
export const SHOW_ENGINE_PICKER = false;
