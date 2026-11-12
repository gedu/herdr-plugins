# PR pane

A [Herdr](https://herdr.dev) TUI plugin that shows the pull requests your agents opened, in a pane on the right. Ported from [herdr-pr-flow](https://github.com/jjangsky/herdr-pr-flow), which is a mod for the Herdr desktop app. See `LICENSE.upstream`.

```
 Pull requests  2
 ──────────────────────────────────────────
 THIS SESSION · payments
 ◐ claude · payments · working
▌● Retry failed payments with backoff   ✕
   shop-api #482 · CI · Approved · Ready

 OTHER SESSIONS
 ○ claude · admin-web · idle
 ● Filter orders by date                ✕
   shop-api #1093 · CI failed · Waiting for review
```

- **Per session.** The PRs of the agent you last focused come first, under `THIS SESSION`. Every other PR is grouped under the session that owns it.
- **Jump to the agent.** Press `enter` on a PR, or click it, to focus the agent session that opened it.
- **Timeline.** Press `→` to open a PR: CI, review and merge as a timeline, then the workflows that run after the merge.
- **It cleans up after itself.** A PR leaves the list when its agent switches to another branch, when its branch is deleted locally, when you press `x` or click `✕`, when it is closed, or 24 hours after it was merged.

## Requirements

- Herdr 0.9.5 or later, with the server running that version (`herdr status`)
- Node.js 20 or later on the `PATH` Herdr runs with
- [GitHub CLI](https://cli.github.com), logged in (`gh auth status --active`)

## Install

```sh
herdr plugin link /path/to/herdr-pr-pane
herdr plugin action invoke gedu.pr-pane.toggle   # opens the pane; run it again to close it
```

To toggle it with a key, add this to `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "ctrl+shift+p"
type = "plugin_action"
command = "gedu.pr-pane.toggle"
description = "toggle the PR panel"
```

Avoid `prefix+p`: it is Herdr's default `previous_tab`.

`ctrl+shift+p` needs a terminal that tells it apart from `ctrl+p`, which means a terminal
speaking the kitty keyboard protocol (Ghostty and kitty do by default; others may need a
setting). Where it arrives as plain `ctrl+p`, use a prefix key instead, which works in any
terminal. As of Herdr 0.9.5 these are unbound by default: `prefix+a`, `prefix+f`,
`prefix+m`, `prefix+u`, `prefix+y`. For example `key = "prefix+u"`.

There is one panel at a time. Toggling from another tab closes it, and toggling again opens it there.

## Keys

| Key | List | PR |
| --- | --- | --- |
| `j` `k`, arrows, wheel | Move | |
| `enter`, `g`, click | Go to the agent | Go to the agent |
| `→`, `l` | Open the PR | |
| `←`, `esc` | | Back |
| `x`, click `✕` | Hide the PR for good | Hide the PR for good |
| `o` | Open on GitHub | Open on GitHub |
| `r` | Refresh now | Refresh now |
| `q` | Close the pane | Close the pane |

## What it runs

Everything is read-only and uses your own login. Nothing is sent anywhere else.

- `herdr agent list`, `herdr workspace list`, `herdr agent focus`
- `git branch --show-current`, `git rev-parse --verify refs/heads/<branch>` and `git remote get-url origin` in each agent's folder
- `gh pr list`, `gh pr view`, `gh auth status --active`, and read-only `gh api` calls (GraphQL review threads and linked issues, Actions runs and jobs)
- `open` (macOS) or `xdg-open`, only for `https://github.com/...` links. Any other link, such as a CI status pointing elsewhere, is refused

Its state (tracked PRs and the ones you hid) is kept in Herdr's plugin state directory, never in this folder.

## Limits

- "Working on something else" means the agent switched branch or repo. An agent that keeps working on the same branch keeps its PR. Use `x` to hide one.
- An agent on a detached HEAD (in the middle of a rebase, say) keeps its PR until it is back on a branch.
- PRs are found through agents running in Herdr, and only on GitHub with a remote named `origin`.
- The pane opens at Herdr's default split size. Resize it with Herdr's own keys.

## Development

```sh
npm test
```
