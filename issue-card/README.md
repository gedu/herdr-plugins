# Issue card

A floating card with the GitHub issue or pull request you point at: number, state, author, title, labels and the first lines of the description.

## Use it

Press the action's key (`prefix+i` below) in the pane where an agent mentioned an issue:

- It finds every issue reference on that pane's screen (`#1232`, `owner/repo#1232`, or a GitHub URL), most recent first, and lists them with their titles. `j`/`k` move, `enter` shows the card, `esc` goes back.
- With a single reference, the card opens straight away.
- With none on screen, it reads the clipboard, so copying `#1232` and pressing the key works too.

A bare `#1232` is looked up in the `origin` repo of the focused pane's folder.

**Control-click** on a GitHub issue or PR URL opens its card too. This needs Herdr's mouse capture on (the default). On macOS it is Control too, not Command.

In the card, `o` opens it on GitHub and `q` or `enter` closes it.

To run the action with a key, add this to `~/.config/herdr/config.toml`:

```toml
[[keys.command]]
key = "prefix+i"
type = "plugin_action"
command = "gedu.issue-card.show"
description = "show the GitHub issue card"
```

## What it runs

Read-only, with your own `gh` login: `herdr pane read` on the focused pane, `pbpaste` (or `xclip` on Linux) when the screen has no reference, `git remote get-url origin` in the focused folder, and `gh api repos/<owner>/<repo>/issues/<n>`. `o` opens only `https://github.com/...` links.

## Development

```sh
npm test
herdr plugin link .
```
