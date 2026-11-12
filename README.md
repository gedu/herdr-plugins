# herdr-plugins

Herdr plugins, one per folder. Each folder has its own `herdr-plugin.toml` and installs on its own.

| Plugin | What it does |
| --- | --- |
| [`pr-pane`](pr-pane/) | A right-side pane with the PRs your agents opened, per session and globally. |
| [`issue-card`](issue-card/) | A floating card for the GitHub issues an agent mentioned on screen. |
| [`tab-names`](tab-names/) | Names each tab after its agent's worktree or branch, e.g. `frn · issue-436`. |

## Install

```sh
herdr plugin install <owner>/herdr-plugins/pr-pane
```

While working on one locally, link its folder instead:

```sh
herdr plugin link ./pr-pane
```
