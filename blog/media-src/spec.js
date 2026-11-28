// Per-post hero spec: archetype + hand-written annotations.
// a: archetype key in scene-lib.js ARCH. blue/blue2: mechanism labels.
// orange: the punchline. amber: optional small note (some archetypes default it).
const SPEC = {
  "claude-code-automation-while-you-sleep": { a: "night", blue: "the floor keeps working", orange: "ship while you sleep" },
  "claude-code-orchestration-guide": { a: "routing", blue: "brief → route → review", orange: "orchestration, practically" },
  "command-center-guide": { a: "spotlight", blue: "kanban · fleet · budgets", orange: "one screen for the whole floor" },
  "crewai-autogen-vs-a-local-agent-harness": { a: "versus", blue: "framework", blue2: "app", orange: "build it or run it?" },
  "deploy-a-blog-writer-agent": { a: "terminal", blue: "an agent wrote this post", orange: "deploy a blog writer" },
  "from-one-terminal-to-a-team": { a: "fleet", blue: "1 terminal → a team", orange: "scale yourself, not your tabs" },
  "how-to-install-and-use-munder-difflin": { a: "terminal", blue: "download → open → brief", orange: "ten minutes to a floor" },
  "how-to-run-multiple-claude-code-agents": { a: "fleet", blue: "many agents, one view", orange: "without losing track" },
  "how-to-talk-to-your-orchestrator": { a: "talk", blue: "what · where · done means", blue2: "on it.", orange: "brief like a colleague" },
  "human-in-the-loop-ai-agents": { a: "talk", blue: "approve?", blue2: "approved ✓", orange: "gates that don't slow you down" },
  "munder-difflin-faq": { a: "talk", blue: "is it free? local? safe?", blue2: "yes · yes · yes", orange: "everything people ask" },
  "run-a-mixed-engine-office": { a: "fleet", blue: "a different CLI per desk", orange: "the right engine for the job" },
  "run-an-office-of-ai-agents": { a: "night", blue: "the office runs itself", orange: "while you sleep" },
  "shareable-agent-roles": { a: "routing", blue: "a role file travels", orange: "hire the same coworker anywhere", amber: "role.md" },
  "small-team-ai-agents-playbook": { a: "book", blue: "for teams of 2-10", orange: "the small-team playbook" },
  "the-clone-army-trap-mixed-swarm-vs-identical-agents": { a: "fleet", blue: "mixed swarm > ten clones", orange: "the clone army is a trap" },
  "the-office-parody-behind-munder-difflin": { a: "talk", blue: "that's what she said—", blue2: "…back to work", orange: "why the joke helps" },
  "voice-as-a-control-plane-for-agent-fleets": { a: "talk", blue: "🎙 'ship the fix'", blue2: "shipping.", orange: "a control plane, not a gimmick" },
  "what-is-a-multi-agent-harness": { a: "book", blue: "multi-agent harness", orange: "in plain english" },
  "why-local-first-matters-for-ai-agents": { a: "guard", blue: "local-first", orange: "your machine, your data", amber: "your code stays home" },
  // The next three posts have hand-authored pilot heroes (media-src/pilot/) —
  // these entries exist only so buildNote() can draw their inline sketches.
  "why-we-built-munder-difflin": { a: "fleet", blue: "one floor, many desks", orange: "the itch that started it" },
  "agents-ran-our-launch-week-analytics": { a: "memory", blue: "one agent per channel", orange: "every comment accounted for", amber: "reddit · PH · github" },
  "turn-feedback-into-a-backlog-with-agents": { a: "routing", blue: "comments in → cards out", orange: "feedback becomes work", amber: "516 incoming" },
};
