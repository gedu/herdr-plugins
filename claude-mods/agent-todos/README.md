# agent-todos

A Claude Code mod that shows the current session's own todos in a navy pane: what the agent is
doing now, what is pending and what is done. A `TODOs` button above the prompt opens and closes
it.

```text
 todos 1/3
 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ahora
 ● Probar el panel de todos en herdr
     abriendo el panel lateral
 pendiente
 ○ Instalar agent-todos para todas las sesiones nuevas
 hecho
 ✓ Desactivar odd-todos
```

It reads the agent's own task tools (`TodoWrite`, `TaskCreate`, `TaskUpdate`), so each session
shows only its own list.

## Install

```sh
cd ~/Documents/mine/herdr-plugins/claude-mods/agent-todos && npm run setup
```

Then restart Claude Code. The setup does three things and says `ok` for each:

| Step | What |
| --- | --- |
| marketplace | Adds this repo to Claude Code as the `herdr-plugins` marketplace (a local directory, so `git pull` updates the mod) |
| plugin | Installs `agent-todos@herdr-plugins` for your user |
| settings | Adds `"CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"` under `env` in `~/.claude/settings.json`, keeping everything else and leaving a dated `settings.json.bak-…` first |

The last step matters: Claude Code ships its task tools off, and without them agents have no
todos, so the pane stays empty.

Without a clone, from inside Claude Code:

```text
/plugin install agent-todos --marketplace gedu/herdr-plugins
```

and add the `env` line above to `~/.claude/settings.json` yourself.

## Use

| Input | Does |
| --- | --- |
| `TODOs` button above the prompt | Open or close the pane |
| `/agent-todos` | Open the pane |
| `/agent-todos demo` | Fill it with a sample list (one of each state) |
| `/agent-todos clear` | Empty it |

## If the pane is empty

1. `claude plugin list` shows `agent-todos@herdr-plugins` as enabled.
2. `~/.claude/settings.json` has `"CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"` in `env`, and Claude Code
   was restarted after adding it.
3. `/agent-todos demo` fills it: if it does, the mod works and the agent simply has no todos yet.

## Develop

```sh
npm test   # settings merge tests, then `claude plugin test .` for the mod
```

The mod is `hooks/register.tsx`; its state contract is `types/index.d.ts`. Claude Code writes
its own type files into `.claude-plugin/types/` (git-ignored) when it loads the mod.
