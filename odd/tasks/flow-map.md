# flow-map

Herdr plugin `flow-map/`: a ~90% popup that draws a long feature (tree, screen flow, architecture) as a live map of boxes colored by state, shared by every agent working on it. Branch `feat/flow-map`. Delivery: ask-on-risk. Tests: `node --test tests/*.test.js` inside `flow-map/`.
Design package (source of truth for visuals): `~/Downloads/herdr-flow-map` (PROMPT.md, SPEC.md, tokens.json, screens/, fixtures/); the parts tests need are copied to `flow-map/design/`.

## Specs

- S1 Visuals follow the design package: SPEC.md §1–13, tokens.json as the only color source, the 7 goldens (`screens/*.txt` exact grid, `*.runs.json` colors). Known golden quirk (SPEC §5): keep a 1-cell gap after `POST /orders/googlePurchase`.
- S2 Alignment and performance (user): "tene en cuenta, mucho, la performance, y que los boxes no se desalinien, siembre si un texto es mas largo las lineas quedan feas, si tenes que cambiar algo para que quede mejor, hacelo, si en lugar que sean ascii tenes que usar otra cosa para que quede mejor bien tabulado hacelo". Every write goes through a cell grid with a real width function; long text is cut with `…`; redraw only on change, diffing frames.
- S3 Several agents in different tabs/worktrees update the same flow (user): "crearme un id de string para poder pasar o algo tambien para que si varios agentes trabajan en algo puedan actualizar el mismo flujo, y no crear otro mapa". One JSON per flow in `~/.local/state/herdr-flows/<id>.json`, outside repos.
- S4 Agents report through a `flow` command, never by editing JSON (PROMPT.md §5); writes are locked and atomic; the agent's Herdr tab is read from the environment.
- S5 Easy id (user): "generar un nombre clave en string no muy complicado para decirle al agente, recorda que estas trabajando con este mapa".
- S6 Click to change state and add a note (user): "puedo hacer click en las distintas boxes y marcar como done, in progress, bloqued o nose las fases que tengamos, capaz agregar una nota para tener info." Keyboard equivalent always available.
- S7 Agent skill (user): "alguna skill para que los agentes puedan encontrar y entender como usar ese map, SOLO si existe esta funcionalidad (que deberia si alguien instala va a estar xD)" and "deberia ser facil y rapido no quiero que los agentes pierdan mucho tiempo encontrando buscando etc". Installed by the plugin's setup; short.
- S8 Not tied to GitHub (user): "deberia ser agnostico a github, puede ser estoy armando una arquitectura o pensando y esto me ayuda a visualizar". References are free text (`#277`, `PROJ-12`, a URL); `g` opens one only when it resolves to a URL.
- S9 Popup opens with `prefix+m`, ~90% × 90%, keys of SPEC §12, flow switcher, redraws when a flow file changes, closes with `q`.

## Tasks

| ID | Specs | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1 S2 | renderer core: tokens, width, grid, ANSI (truecolor/256), frame diff · delegated (parallel writer) | done | 05f4a44 |
| T2 | S1 S2 | tree layout + header/footer: golden 01 (fixed pos, then automatic) · delegated | done | 05f4a44 |
| T3 | S1 | screen-flow (02) and architecture (03) layouts | pending | |
| T4 | S1 | detail (04), narrow vertical (05), empty (06), switcher (07) | pending | |
| T5 | S3 S4 S5 S8 | store + `flow` CLI, lock, ids · delegated (parallel writer, disjoint surface) | done | a6d3277, stale-lock fix |
| T6 | S6 S9 | Herdr popup: keys, mouse probe, click/keys to set state, note, watch + redraw | pending | |
| T7 | S7 | agent skill + setup install, README, config/keys.toml | pending | |

## Log

- L1 (2026-11-13) User: "deberias tener todo de claude design … usalo como guia, referencia. Vos sos el que sabe la parte de codigo, plugins de herbr etc, shurtcuts disponibles, que sea algo genial, tene en cuenta, mucho, la performance, y que los boxes no se desalinien …"
- L2 Plan accepted: file per flow outside repos, `flow` command, skill. User added S6, S7, S8, S5 ("ok, tambien diria que puedo hacer click …").
- L3 Herdr docs (plugins.mdx v0.9.5): popup takes `width`/`height` (percent or cells); nothing documents mouse forwarding into a popup → T6 starts with a probe; keyboard path is the fallback.
- L4 Mouse probe (popup 90%×90% → 195×50, COLORTERM=truecolor): SGR 1006 reports reach the popup: clicks (0 press/release), right click (2), drag (32+, 339 events), wheel up/down (64/65) and sideways (66/67). Click-to-mark (S6) and wheel scroll are possible.
- L5 T5 done (delegated): store.js/ids.js/lock.js/cli.js, 20 tests pass; spot check: `flow new` → `purchases`, bad state exit 1. Note: Herdr tab numbers repeat across workspaces (tab_id like w1T:t3); store keeps number only for now.
- L6 T1/T2 done (37 tests). Golden 01 vs SPEC differences kept per SPEC: googlePurchase label gap (§5), `web · noStore` 4 rows (no issues), notes word coloring not in SPEC, golden node widths come from fixture `w` (SPEC §3 rule gives narrower boxes; `w` stays an optional override). With §3 widths, edge labels get cut (`POST /orders/appleTrans…`): layout should widen sibling spacing so labels fit when the popup has room.
- L7 Review (RDD, lenses resilience+reliability) of a6d3277 alone (whole range exceeded the lens budget): approved, acknowledged. Advisories: stale-lock steal race (fixed by rename-claim + test, RED observed on old code), cli.js:123-129 and lock.js:12-19 warnings (informational).
