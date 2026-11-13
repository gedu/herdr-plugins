# Flow map popup · implementation spec

The popup shows the progress of one long feature as a live map: boxes and flows colored by state, a short explanation underneath. It opens with a key inside Herdr at about 90% × 90% of the screen and redraws whenever an agent updates the progress.

Everything is plain text: monospace cells, ANSI truecolor (256-color fallback), box-drawing characters. No images, no gradients. Every element is lines of characters.

The goldens in `screens/` are the visual target. `*.txt` is the exact character grid, `*.ansi` is the same grid with truecolor (`cat` it in a truecolor terminal), `*.runs.json` is the grid as colored runs per row, `*.png` is a picture. Coordinates below are `(col, row)` from the top-left of the popup's inner area, 0-based.

## 1. Grid

- Mock size: 140 × 44 cells. The real popup is 90% × 90% of the Herdr window, so size everything from the actual inner width and height.
- Margin: 1 col left and right (content in cols 1 to W-2). Rules (rows 1, H-3) span the full width.
- Rows, top to bottom:

| Row | Content |
|---|---|
| 0 | flow tabs (right: `tab next flow · / all flows`) |
| 1 | rule `─` in track color |
| 2 | flow id (accent) · feature name (bold) · at the right margin `n/m nodes done` |
| 3 | progress bar: `━`, track color, filled part in accent = done/total × (W-2) |
| 4 | `now` + current step (bold) + ` · next: …` muted. Label column is 8 wide |
| 5 | `agents` + one `◂ tab N · node` per attached tab, 4 spaces apart |
| 6 … H-9 | map |
| H-8 | notes rule `── notes ───…` |
| H-7 … | notes, 2 to 5 lines, plain language |
| H-3 | rule |
| H-2 | legend |
| H-1 | key hints |

Section rules (`── label ──────`) are `──`, one space, the label in muted, one space, then `─` to the right margin, all in track color.

## 2. Colors and states

See `tokens.json` for hex, truecolor SGR and 256-color values. Text colors have at least 6:1 contrast on the background. Edge and track colors are decoration only.

State is never encoded by hue alone:

| State | Glyph | Border | Color | Title |
|---|---|---|---|---|
| done | `✓` | `╭─╮│╰─╯` | green | green, bold |
| in progress | `●` | `┏━┓┃┗━┛` | white | emphasis, bold |
| pending | `○` | `╭┄╮┆╰┄╯` | muted | muted |
| blocked | `■` | `╭─╮│╰─╯` | amber | amber, bold; reason line in amber |

- Selected: keep the state border and fill every cell of the box (border included) with the selection color. Put `▸` in accent 2 cols left of the box on the title row (in the vertical layout, 2 cells before the row).
- Agent attached: `◂ tab N` in accent on the box's bottom border, right-aligned: border chars, one space, tag, one space, one border char. If the box is too narrow, drop the tag and keep the agent in row 5.
- Issue chips, merged first, two spaces apart: `#278 merged` (green), `#277 open` (accent). Each issue carries its own state.
- Fallbacks if the font lacks a glyph: `◂`→`<`, `▸`→`>`, `■`→`x`, `┄`→`-`, `┆`→`:`, heavy box → light box in bold.

## 3. Node anatomy

```
╭───────────────────╮   row 0  border, state color
│ ✓ web             │   row 1  glyph + title (one line, bold)
│ location.assign   │   row 2  detail, muted (optional)
│ #454 merged       │   row 3  issue chips (optional)
╰──────── ◂ tab 2 ──╯   row 4  border, agent tag
```

- Width = widest of (glyph + space + title), detail, issues, plus 4. Clamp to 21–33 cols. Longer text is cut with `…`.
- 1 space of padding inside each border. Rows 2 and 3 disappear when empty, so a node is 3 to 5 rows tall. In a row of nodes, nodes keep their own height; connectors start at each node's own bottom.
- A blocked node shows its reason as the detail line, in amber.

## 4. Edges

- Color: edge. Glyphs: `│ ─ ╭ ╮ ╰ ╯ ┬ ┴ ┼ ↓ →`. Corners are always rounded.
- Parent to children (tree): 4 rows between the parent's bottom border and the child's top border:
  1. stub `│` under the parent's center col (it may carry a trunk label, 2 cols to its right)
  2. branch bar: `╭` at the leftmost child's center col, `╮` at the rightmost, `┴` at the parent's center col (`┼` if a child sits right under the parent)
  3. one stub `│` per child, with that child's edge label 2 cols to its right
  4. `↓` per child, on the row just above the child's top border
- Labels are muted. A label never overwrites a line: if the next stub is closer than the label is long, shorten with `…` or put the label left of its stub, ending 1 cell before it. Keep at least 1 empty cell between a label and the next stub.
- Several parents into one child (merge): stubs `│` under each parent, a bar `╰ ─ ┬ ─ ╯`, then one `↓` with its label to the right. That is 3 rows, not 4.
- Not wired yet: dashed `┆` in the blocked color, with a blocked-colored `↓`.

## 5. Variant A · tree / flow (`01-tree-flow`)

- Nodes at the same depth share a top row. Leaves are packed left to right with 2 cols between boxes, starting at col 2.
- A parent is centered over its children: with an odd number of children, on the middle child's center col; with an even number, on the floor of the midpoint between the two middle children's centers.
- A merge node is centered on the floor of the midpoint between its parents' centers.
- Depth `d+1` starts 5 rows below depth `d`'s bottom row (parent bottom row `r`, child top row `r+5`). Merge: 4 rows.
- `fixtures/purchase-flow.json` carries the golden `pos`/`w` for each node. Start by rendering from those, then replace them with the layout rules above and diff against the golden.
- Known quirk in the golden: the label `POST /orders/googlePurchase` ends flush against the next stub (no gap). Keep a 1-cell gap in the real renderer.

## 6. Variant B · screen flow (`02-screen-flow`)

- Screens left to right, built one at a time. Node 26 wide, gap 10, first node at col 2.
- Node rows: border, title, route, issues, divider (`├─┤`, heavy `┣━┫`, dashed `├┄┤`), 4 wireframe lines (muted, 22 wide), divider, up to 3 task lines (`✓ ● ○` + text), border. Wireframes are text only.
- Edge: `─` × 9 then `→` in the 10-col gap, vertically at the wireframe's second row; the label is on the row above, left-aligned in the gap. Green when the source is done, edge color otherwise.
- Above the nodes (rows 8–9): one label per screen (`✓ 1 built`, `● 2 building`, `○ 3 next`, `○ 4 later`) over a rail of `─`: green under done, white under the current screen, track under the rest.
- Under the current node: `▲ building now · tab N` in accent.

## 7. Variant C · architecture (`03-architecture`)

- Layers top to bottom; names in a 12-col gutter at col 1 (`UI`, `domain`, `ports`, `adapters`, `backend`), on the title row of the layer's boxes.
- Boxes are 3–4 rows: border, title, issue line (or detail), border. Edges run straight down where possible; use the tree connector rules (§4) when a node has several children.
- A dependency that is not wired yet is dashed amber (see `expo-iap adapter → /orders/*`). Its two labels sit left of the stub, on consecutive rows.
- Layers need 3 or 4 rows of connector, depending on whether they branch.

## 8. Node detail (`04-node-detail`)

Replaces the map region; header and footer stay. Rows: breadcrumb (`parent › … › node`), title with state chip at the right, one-line description, then sections `issues`, `edges`, `agent`, `notes`, `history`, each with a section rule.

- issues: marker `▸` for the selected one, id, state, title, and the blocked reason in amber. `g` opens the selected issue.
- edges: `in ← parent · label`, `out → METHOD /path · note`.
- agent: `◂ tab N  working on this node · last activity 4 min ago`.
- history: `HH:MM` (24 h, local) · who (`tab N` in accent, `you` in bold) · what changed. Newest first.
- Footer keys: `esc back`, `↑↓ choose issue`, `g open … on GitHub`, `←→ previous / next node`, `q close`.

## 9. Flows and the switcher (`07-flow-switcher`)

- Tabs (row 0): one per flow, ` id  n/m ` with 1 space each side, 2 spaces between tabs. The active tab uses the selection fill and bold. `●` in accent before the id: an agent updated that flow since you looked. `■` in amber: the flow has a blocked node.
- `tab` / `shift+tab` step through flows. `/` opens the flow list: a rounded panel with columns `flow · feature · done · progress (20-cell bar) · agents · state`; `↑↓` choose, `enter` open, `n` jump to the next flow that needs attention, `esc` cancel.
- With more flows than fit: `‹ N` and `N more ›` around the visible tabs; the active tab is always visible.
- Several agents, each in its own Herdr tab, can work on the same flow: every agent shows in row 5 and as a `◂ tab N` tag on the node it reports.

## 10. Narrow popups (`05-narrow-vertical`)

Terminals cannot scroll sideways, and folding branches would hide what is in progress, so:

- If the layout needs more cols than the popup has, switch to the vertical layout. Header row 6 says why: `layout  vertical · the map needs 118 columns, this popup has 76`.
- One row per node, tree glyphs `├─ └─ │`, state glyph, title, issues right-aligned at the right margin, agent tag after the title.
- Edge labels are muted rows under the node, indented under its title.
- Too many rows: scroll with the selection; muted rows `▲ N more` / `▼ N more` at the edges of the map region.

## 11. Empty state (`06-empty-state`)

No nodes yet: header shows `0/0`, an all-track bar, `now —`, `agents none attached`. In the map region: three ghost boxes in track color with dashed borders joined by dashed edges, and a centered message `○  no map for this feature yet`, two lines explaining that an agent adds nodes as it works, and `waiting for an agent ▍`. Only `tab`, `/` and `q` do anything.

## 12. Keys

| Key | Action |
|---|---|
| `↑↓←→` | move to the nearest node in that direction. Tree: `↓` first child, `↑` parent, `←→` siblings. Screens: `←→`. Layers: `↑↓` along dependencies |
| `enter` | node detail |
| `esc` | back (detail → map, list → map) |
| `g` | open an issue on GitHub: the selected issue in detail; on the map, the first open issue, else the last merged |
| `tab` / `shift+tab` | next / previous flow |
| `/` | flow list |
| `n` | next flow that needs attention |
| `q` | close |

## 13. Data and redraw

`fixtures/*.json` show the shape. A flow has `id`, `feature`, `layout` (`tree` · `screens` · `layers`), `now`, `agents[{tab,node,name}]`, `nodes[{id,title,detail,state,issues[{n,state}],blocked_by?}]`, `edges[{from,to,label?,style?}]`, `notes[]`, `updated`.

- Progress = nodes in `done` / total nodes.
- Redraw on every update: diff against the previous frame and write only changed cells. Keep the selection by node id. If the selected node disappears, select its parent. Never move the user's scroll or the open view (detail, list) on an update.
- How agents report progress, and where flows are stored, is not designed here. See PROMPT.md.
