# Prompt for the implementing agent

Paste everything below the line into the agent, run from the root of the plugins repo (`herbr-plugins`), with this folder copied in as `docs/flow-map/` (or anywhere readable).

---

You are going to build a **flow map popup** for Herdr (the terminal multiplexer I use inside Ghostty while coding with Claude). The design is finished. Your job is to implement it faithfully as a Herdr plugin in this repo.

Answer me in Spanish. Write code, comments and commit messages in English.

## What it is

A popup that opens with a key inside Herdr, at about 90% × 90% of the screen. It shows the progress of one long feature as a live map: boxes and flows, colored by state (done, in progress, pending, blocked), with a short explanation underneath. It redraws whenever an agent updates the progress. Several agents, each in its own Herdr tab, can work on the same flow, and several flows can be active, so the popup also has a flow switcher.

It is plain text only: monospace cells, ANSI truecolor with a 256-color fallback, box-drawing characters. No images, no gradients. Every element is lines of characters.

## What is in the folder

Read in this order:

1. `README.md`: index.
2. `SPEC.md`: the full spec: grid, rows, states, node anatomy, edges, the three layouts, detail view, switcher, narrow layout, empty state, keys, data and redraw rules.
3. `tokens.json`: colors (hex, truecolor SGR, 256-color), state encoding, glyphs and fallbacks, layout constants. Use it as the single source of truth in code; do not hardcode colors elsewhere.
4. `screens/`: the golden mockups, one per screen. For each: `.txt` (exact character grid), `.ansi` (the same with truecolor, `cat` it in Ghostty), `.runs.json` (colored runs per row), `.png` (picture). Open the `.ansi` and the `.png` first to see what you are building.
5. `fixtures/`: sample flow data (`purchase-flow` tree, `checkout-ui` screen flow, `purchase-layers` architecture, `refunds-v2` empty). Each points at its golden.
6. `preview/*.html`: the same screens as standalone HTML, if you want to open them in a browser. `design-source/` has the original design files; you do not need them.

## The three map shapes and the other screens

- **A, tree / flow** (`01-tree-flow`): one entry point that branches. Parent centered over its children, edges with labels such as `POST /orders/appleTransaction`.
- **B, screen flow** (`02-screen-flow`): screens left to right, built one at a time, each with a text wireframe and its tasks.
- **C, architecture** (`03-architecture`): layers top to bottom with their dependencies.
- **D, node detail** (`04-node-detail`): issues with their state, edges, agent, notes, history.
- **E, narrow popup** (`05-narrow-vertical`): when the map is wider than the popup, switch to a vertical layout. Never scroll sideways.
- **F, empty state** (`06-empty-state`): no map yet.
- **G, flow switcher** (`07-flow-switcher`): tabs with markers (`●` updated, `■` blocked) and a flow list opened with `/`.

## How to work

1. **Explore first, do not assume.** I do not know Herdr's plugin API well enough to tell you. Read how the existing plugins in this repo are built and registered (for example the `timesheet` plugin and the TODO panel: their entry point, how they bind a key such as `prefix+t`, how they draw into a pane or popup, how `npm run setup` works). Follow those conventions and the language they use. If Herdr cannot open a popup at ~90% size, or cannot redraw on an external event, say so and propose the closest option before building around it.
2. **Build the renderer as a pure module first**, separate from Herdr: `render(flow, {cols, rows, selected, view}) → grid of cells`, where a cell is `{ch, fg, bg, bold}`, plus a function that turns a grid into an ANSI string (truecolor, with a 256-color mode chosen from `COLORTERM`). No Herdr code in it.
3. **Test it against the goldens.** For each fixture, render at the golden's size (140 × 44; the narrow one is 76 × 44) and compare the character grid with the `.txt`. Start by rendering from the `pos`/`w` values in `purchase-flow.json`; then implement the automatic layout from SPEC.md §5–7 and make it produce the same grid. Also compare the colors against `.runs.json`. The goldens were taken from a rendered design, so if one looks wrong against the spec, tell me instead of bending the code. One known quirk is listed in SPEC.md §5.
4. **Then wire it into Herdr:** the key that opens the popup, the ~90% size, the key handling in SPEC.md §12, the switcher, and redraw on update.
5. **Data.** The fixtures show the shape of a flow. How agents report progress, and where flows are stored, is not designed yet. Propose something small that fits Herdr and this repo (for example one JSON file per flow in a state directory that the popup watches, written by a tiny command or skill that an agent calls with node id, state, issues and a note). Keep it simple, tell me the options and your pick before building it, and keep the renderer independent of it. Never make an agent edit files by hand to report progress.
6. **Do not invent.** Flow ids, tab numbers, issue numbers and texts in the fixtures are examples. Progress is `done nodes / total nodes`. Issue states (`merged` / `open`) come from the data; fetching them from GitHub is optional and last.

## Rules that matter

- Never encode state by color alone: glyph, border style and a text label are part of the design.
- A label never overwrites a connector. Keep a 1-cell gap before the next stub.
- Handle wide or missing glyphs: use the fallbacks in `tokens.json` when the terminal font lacks one. Measure with a real width function; do not assume 1 cell for every character.
- Redraw by diffing frames, keep the selection by node id, and never move the user's open view on an update.
- Keep it small: no framework, no new dependency unless the repo already uses it.

## Done means

- The renderer matches every golden `.txt` exactly and the colors in `.runs.json`, in a test that runs in the repo's normal test command.
- The popup opens with its key, at about 90% × 90%, shows a fixture, moves the selection, opens the detail view, switches flows, and closes with `q`.
- It redraws when a flow file changes.
- I get a short summary: what you built, what you assumed, what Herdr could not do.

Start by exploring the repo and the folder, then tell me your plan in a few lines before writing code.
