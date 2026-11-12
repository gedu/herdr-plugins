# Issue card

A floating card with the GitHub issue or pull request you point at: number, state, author, title, labels and the first lines of the description.

## Use it

- **Control-click** a GitHub issue or PR URL in any pane. This needs Herdr's mouse capture on (the default). On macOS it is Control too, not Command.
- **Select** a number (`1232`, `#1232`, `issue 1232`, or `owner/repo#1232`) and run the `show` action. A bare number is looked up in the `origin` repo of the focused pane's folder.

In the card, `o` opens it on GitHub and `q`, `esc` or `enter` closes it.

To run the action with a key, add this to `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+i"
type = "plugin_action"
command = "gedu.issue-card.show"
description = "show the GitHub issue card"
```

## What it runs

Read-only, with your own `gh` login: `git remote get-url origin` in the focused folder and `gh api repos/<owner>/<repo>/issues/<n>`. `o` opens only `https://github.com/...` links.

## Development

```sh
npm test
herdr plugin link .
```
