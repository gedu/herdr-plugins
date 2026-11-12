# tab-names

Names each Herdr tab after the checkout its agent is working in, so five agents in five
worktrees stay tellable apart:

```text
frn · issue-436      agent in food-revolution-network-worktrees/issue-436
frn · chore-408      agent in food-revolution-network-worktrees/chore-408
herdr-plugins · main agent in the main checkout, on branch main
```

## The name

- Read from the agent pane's `foreground_cwd`, not `cwd`: an agent that moves into a
  worktree keeps its pane `cwd`, but its process folder changes.
- `<repo> · <worktree folder>` in a linked worktree, `<repo> · <branch>` in the main checkout.
- Repo names of three or more words become initials (`food-revolution-network` → `frn`).
- Capped at 32 characters.
- Tabs without an agent, and agents outside a git repo, are left alone.

## Names you set by hand

The plugin only renames a tab whose label is still Herdr's default (digits, like `3`) or
is the name the plugin itself gave it last time. Rename a tab yourself and the plugin
stops touching it. To give a tab back to the plugin, rename it to a number.

## When it runs

No Herdr event fires when a process changes directory, so it reconciles every tab on:

| Trigger | Why |
| --- | --- |
| startup | name tabs restored with the session |
| `pane.agent_detected` | an agent starts in a tab |
| `pane.agent_status_changed` | an agent that moved into a worktree gets named at its next status change |
| `tab.focused` | catch up when you switch tabs |
| `worktree.created`, `worktree.opened` | Herdr-managed worktrees |

## Install

```sh
herdr plugin link ./tab-names
```

Needs Node >= 20 and `git` on `PATH`. State (which tabs it named) lives in
`$HERDR_PLUGIN_STATE_DIR/owned.json`; failures go to `herdr plugin log gedu.tab-names`.

## Tests

```sh
npm test
```
