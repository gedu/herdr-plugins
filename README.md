# herdr-plugins

Herdr plugins, one per folder. Each folder has its own `herdr-plugin.toml` and installs on its own.

| Plugin | What it does |
| --- | --- |
| [`pr-pane`](pr-pane/) | A right-side pane with the PRs your agents opened, per session and globally. |
| [`issue-card`](issue-card/) | A floating card for the GitHub issues an agent mentioned on screen. |
| [`tab-names`](tab-names/) | Names each tab after its agent's worktree or branch, e.g. `frn · issue-436`. |

## Install

```sh
herdr plugin install gedu/herdr-plugins/pr-pane
```

While working on one locally, link its folder instead:

```sh
herdr plugin link ./pr-pane
```

## Set up a new Mac

Written so an agent can run it top to bottom. Each step says how to check it worked.

1. **Tools.** Herdr >= 0.9.5, Node >= 20, git, the GitHub CLI and [hunk](https://hunk.dev).

   ```sh
   brew install node gh hunk
   gh auth status --active || gh auth login   # interactive: the person logs in
   herdr --version && node --version && hunk --version
   ```

2. **Plugins.** Clone the repo and link each folder, so local edits apply right away:

   ```sh
   git clone https://github.com/gedu/herdr-plugins.git ~/Documents/mine/herdr-plugins
   cd ~/Documents/mine/herdr-plugins
   for p in pr-pane issue-card tab-names; do herdr plugin link "./$p"; done
   herdr plugin list   # gedu.pr-pane, gedu.issue-card, gedu.tab-names, all enabled
   ```

   Without a clone, `herdr plugin install gedu/herdr-plugins/<folder>` works too, and
   `herdr plugin update` updates them later.

3. **Keys.** Append each block of [`config/keys.toml`](config/keys.toml) to
   `~/.config/herdr/config.toml` (or the file `$HERDR_CONFIG_PATH` points to), skipping any
   block whose `key` that file already binds. Never replace the file: it holds the person's
   theme, prefix and other keys.

   ```sh
   herdr server reload-config   # expect "status":"applied" and "diagnostics":[]
   ```

   | Key | Does |
   | --- | --- |
   | `ctrl+shift+p` | Toggle the PR panel |
   | `prefix+i` | Issue card for the issues on screen |
   | `prefix+d` | hunk diff of the focused pane's folder |

### Where the config lives

`~/.config/herdr/config.toml` comes from Gentleman.Dots, which copies its base version over
it when run with herdr selected (it keeps a backup). Herdr has no `include`, so keep the whole
file in your dotfiles and point Herdr at it, which `gentleman.dots` never touches:

```sh
export HERDR_CONFIG_PATH=~/dotfiles/herdr/config.toml   # in ~/.zshrc
```

Do not carry these over; they are per machine and Herdr rebuilds them: `plugins.json`
(absolute paths), `session.json`, `session-snapshots/`, logs, sockets, and plugin state in
`~/.local/state/herdr/plugins/`.
