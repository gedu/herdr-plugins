# flow-map

A live map of a long feature, drawn in a Herdr popup: boxes and flows colored by state, with
notes underneath. Every agent working on the feature updates the same map by its id, from any
tab or worktree, with the `flow` command. You can change a box's state or add a note yourself
by clicking it.

```text
 purchases  5/9    checkout  1/4                                        tab next flow · / all flows
 ───────────────────────────────────────────────────────────────────────────────────────────────
 purchases  Purchases · free trial & restore                                      5/9 nodes done
 now     ● iOS and Android run on a placeholder adapter · next: unblock #277
 agents  ◂ tab 2 · Android    ◂ tab 3 · iOS
                    ╭───────────────────────╮
                    │ ✓ usePurchaseActions  │
                    ╰───────────────────────╯
```

Three shapes: `tree` (one entry that branches), `screens` (screens left to right, built one at a
time) and `layers` (architecture). States: `✓ done`, `● in progress`, `○ pending`, `■ blocked`,
never told apart by color alone. When the map is wider than the popup it switches to a vertical
list instead of scrolling sideways.

## Use it

1. Ask an agent to start a map, or run `flow new "Purchases · free trial & restore"`. It prints a
   short id (`purchases`).
2. Tell every agent on the feature: "you work on the `purchases` flow". With the skill installed
   they keep it current on their own (`flow here`, `flow node … --state done`, `flow note`).
3. Open it with `prefix+m`.

## Keys and mouse

| Input | Does |
| --- | --- |
| `↑↓←→` | Move between boxes |
| `enter` | Box detail (refs, edges, agent, notes, history) |
| `s`, or click the selected box | Menu: done / in progress / pending / blocked (asks why) / add note |
| `g` | Open the box's ref when it is a URL (or `#n` when the flow has a `repo`) |
| `tab` `shift+tab`, click a tab | Next / previous flow |
| `/` | All flows; `n` jumps to the next one that needs attention |
| wheel | Scroll the map |
| `esc`, `q` | Back, close |

## Data

One JSON per flow in `~/.local/state/herdr-flows/<id>.json` (`HERDR_FLOWS_DIR` overrides it),
outside every repo so all worktrees share it. Writes take a lock and replace the file
atomically, so agents never overwrite each other. Refs are free text: `#277`, `PROJ-12`, a URL.
`flow help` lists every command.

## Setup

```sh
herdr plugin link ./flow-map
cd flow-map && npm run setup     # `flow` into ~/.local/bin, skill into ~/.claude/skills and ~/.agents/skills
```

Then bind `prefix+m` (see [`config/keys.toml`](../config/keys.toml)). Needs Node >= 20.

## Design

`design/` holds the design package: `SPEC.md`, `tokens.json` (the only source of colors) and the
golden screens the renderer tests compare against, cell by cell.

## Tests

```sh
npm test
```
