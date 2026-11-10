# PR panel for Herdr TUI

Objective: a Herdr TUI (0.9.5) plugin that shows agents' PRs in a right-side pane, per session and globally, ported from herdr-pr-flow (MIT).
Branch: `feat/pr-panel` · Delivery: ask-on-risk · Test runner: `node --test tests/*.test.js` (Node 24).

## Specs

- S1 Per session: "I want to show the card per agent session, not a global one". The pane shows the focused agent's PRs first, under "This session".
- S2 Global map: "maybe keep a global mapping to see the PR and the agent working on it". Every PR card names the agent and session that owns it.
- S3 Jump: "when I click on the PR it takes me to the right session". Enter (and a mouse click, if Herdr forwards it) focuses the owning agent.
- S4 Remove on branch change: "the PR should be removed from the list (individual and global) when the agents start working on something el". Detected as the owning agent's branch no longer being the PR branch.
- S5 Remove on branch delete: "delete the local branch". The PR leaves when its head branch no longer exists locally in the owner's folder.
- S6 Dismiss: "I click an X in the PR". `x` dismisses a PR for good; it is not rediscovered.
- S7 Security: "no sending any weird to external and random urls, endpoints". Only `https://github.com/...` URLs are opened; `gh` string fields go through `-f`; nothing else leaves the machine.
- S8 Visuals: "keeping some colorfull and visual stuff ... like having the dots, the lines etc". Colored status dots in the list; a timeline with marks joined by lines in the detail.
- S9 Platform: "make it work here". Runs as a Herdr TUI plugin (`herdr-plugin.toml`), calling the `herdr` CLI.
- S10 Placement: "if it is a collapsable side panel, on the right side I have no problem". A plugin action toggles a split pane on the right.

## Tasks

- T1 · S7, S9 · inline · core modules ported with the security fixes and tests · done 2d69bd5 (RED: missing url.js; GREEN 3/3)
- T2 · S2, S4, S5, S6 · inline · tracker with ownership, removal rules, dismiss · done 203691d (RED: missing tracker.js; GREEN 11/11)
- T3 · S3, S7, S9 · inline · Herdr/git/open adapter · done 9fdb8ea (RED: stderr envelope; GREEN 18/18; real git checked)
- T4 · S1, S2, S8 · inline · renderer: list, session section, timeline · done df63b59 (RED: ✕ column; GREEN 38/38)
- T5 · S3, S9, S10 · inline · TUI loop, manifest, toggle action, README · done 2a892f3 (GREEN 46/46; pty smoke; live GitHub read)
- T6 · all · inline · live check in Herdr once the server runs 0.9.5 · blocked on server restart

## Log

- L1 (2026-11-10) User request, verbatim: "can you review it? I wanna add this into our current herb, but I want to show the card per agent session, not a global one, I found hard when an agent creates the PR to know how is working on it, maybe keep a global mapping to see the PR and the agent working on it, and when I click on the PR it takes me to the right session, the PR should be removed from the list (individual and global) when the agents start working on something el, delete the local branch or I click an X in the PR, is it possible?"
- L2 "review everything in terms of security, no sending any weird to external and random urls, endpoints"
- L3 "is it possible to translate, map or transform what the github code does, to work here? probably in a simpler version but keeping some colorfull and visual stuff ... like having the dots, the lines etc ... but make it work here?"
- L4 "ok, meanwhile can we do all the improvements to see the PR panel?"
- L5 Evidence: installed `herdr` is the TUI; client 0.9.5, server still 0.7.5 (`protocol_mismatch`), so live checks wait for a server restart. 0.9.5 has plugins (`herdr-plugin.toml`, panes with `placement = "split"`). `herdr agent list` gives `agent_status`, `cwd`, `pane_id`, `terminal_id`, `workspace_id`, `focused`; no branch, so it comes from `git branch --show-current`.
- L6 Engram mirror pending: project resolution is ambiguous from this session.
- L7 Found while building: `gh auth status` exits 1 when any stored account has an invalid token, even with a working active account; the panel uses `gh auth status --active` (pinned by a test). Same defect exists upstream.
- L8 Evidence: pty smoke run draws the pane, shows Herdr's protocol_mismatch message, `q` restores the terminal, state lands in HERDR_PLUGIN_STATE_DIR. End-to-end tracker run against real GitHub (cli/cli#15010, read-only) discovered the PR, drew the timeline, and removed it after a branch change. keys.js test was written with its implementation (no observed RED).
- L9 Next: T6 after the server restart: `herdr plugin link`, toggle action, `agent focus` target form (pane id vs terminal id), mouse forwarding, workspace list shape.
