// The Herdr popup pane: the live map of a flow, keys and mouse to move, switch flows and mark state.
// Keys (SPEC §12): arrows move, enter node detail, esc back, s state menu, g open a link,
// tab/shift+tab flows, / flow list, n next flow that needs attention, q or ctrl+c close.
// Mouse: click a node to select it, click it again for the state menu, wheel scrolls, click a tab.
// Redraws only on events (keys, mouse, flow file changes, resize) and writes only changed cells.
import { spawn } from 'node:child_process';
import { mkdirSync, watch, readdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './render/index.js';
import { fill, text } from './render/grid.js';
import { issueLabel } from './render/issues.js';
import * as store from './store.js';
import { validId } from './ids.js';
import { createParser } from './input.js';
import { openMenu, menuKey, menuClick, drawMenu, ITEMS } from './menu.js';

const WHEEL_STEP = 3;
const NODE_NOTES = 5;
const EMPTY = { id: '', feature: 'No flows yet: ask an agent to run `flow new`', layout: 'tree', now: '', agents: [], nodes: [], edges: [], notes: [] };

export const activeFlow = (state) => state.flows.get(state.flowId) ?? null;

export function defaultSelected(flow) {
  const nodes = flow?.nodes ?? [];
  return (nodes.find((n) => n.state === 'in_progress') ?? nodes[0])?.id ?? null;
}

const viewOpts = (state, ctx) => ({ cols: ctx.cols, rows: ctx.rows, scroll: state.scroll, selected: state.selected, view: state.view, follow: state.follow !== false });

// --- geometry: the renderer's layout/hitTest/navigate when present, else the tree layout ---

function rectsOf(state, ctx) {
  const flow = activeFlow(state);
  if (!flow?.nodes?.length) return null;
  if (typeof R.layout === 'function') return R.layout(flow, viewOpts(state, ctx)).rects;
  return R.treeLayout(flow).rects;
}

export function nodeRect(state, ctx, id) {
  return rectsOf(state, ctx)?.get(id) ?? null;
}

function hitNode(state, ctx, col, row) {
  const flow = activeFlow(state);
  if (!flow?.nodes?.length) return null;
  if (typeof R.hitTest === 'function') return R.hitTest(flow, viewOpts(state, ctx), col, row);
  for (const [id, r] of rectsOf(state, ctx)) if (col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) return id;
  return null;
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function navigateFrom(state, ctx, dir) {
  const flow = activeFlow(state);
  if (!flow?.nodes?.length) return null;
  if (!state.selected) return defaultSelected(flow);
  if (typeof R.navigate === 'function') return R.navigate(flow, viewOpts(state, ctx), state.selected, dir) ?? state.selected;
  // Fallback: the nearest node whose center lies in that direction.
  const rects = rectsOf(state, ctx);
  const from = rects.get(state.selected);
  if (!from) return defaultSelected(flow);
  const [dx, dy] = DIRS[dir];
  const cx = (r) => r.col + r.w / 2;
  const cy = (r) => r.row + r.h / 2;
  let best = null;
  let bestScore = Infinity;
  for (const [id, r] of rects) {
    if (id === state.selected) continue;
    const ax = cx(r) - cx(from);
    const ay = cy(r) - cy(from);
    const along = ax * dx + ay * dy;
    if (along <= 0) continue;
    const across = Math.abs(dx ? ay : ax);
    const score = along + across * 2;
    if (score < bestScore) { bestScore = score; best = id; }
  }
  return best ?? state.selected;
}

// Select `id` and scroll so it is in view again (after the wheel moved the map away).
function follow(state, ctx, id) {
  const next = { ...state, selected: id, follow: true };
  return { ...next, scroll: clampScroll(next, ctx, state.scroll) };
}

function clampScroll(state, ctx, scroll) {
  const flow = activeFlow(state);
  if (!flow?.nodes?.length || typeof R.layout !== 'function') return 0;
  return R.layout(flow, { ...viewOpts(state, ctx), scroll: Math.max(0, scroll) }).scroll ?? Math.max(0, scroll);
}

// Row 0 as one char per cell, so string indexes are columns.
export function rowChars(g, row = 0) {
  let s = '';
  for (let c = 0; c < g.cols; c++) {
    const ch = g.cells[row * g.cols + c].ch;
    s += ch.length === 1 ? ch : '\0';
  }
  return s;
}

const countOf = (f) => `${(f.nodes ?? []).filter((n) => n.state === 'done').length}/${(f.nodes ?? []).length}`;

// The flow whose tab (` id  n/m `, maybe with a marker before it) covers this column of row 0.
export function tabAt(state, row0, col) {
  if (!row0) return null;
  for (const id of state.order) {
    const label = `${id}  ${countOf(state.flows.get(id))}`;
    for (let at = row0.indexOf(label); at >= 0; at = row0.indexOf(label, at + 1)) {
      const before = row0[at - 1];
      if (at > 0 && before !== ' ' && before !== '\0' && /[a-z0-9_-]/.test(before)) continue;
      if (col >= at - 2 && col <= at + label.length) return id;
    }
  }
  return null;
}

// --- links (`g`) ---

function repoUrl(repo) {
  if (!repo || typeof repo !== 'string') return null;
  if (/^https?:\/\//.test(repo)) return repo.replace(/\.git$/, '').replace(/\/+$/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(repo)) return `https://github.com/${repo}`;
  return null;
}

export function issueUrl(flow, issue) {
  const ref = issue.ref != null ? String(issue.ref) : null;
  if (ref && /^https?:\/\/\S+$/.test(ref)) return ref;
  const n = issue.n ?? ref?.match(/^#(\d+)$/)?.[1];
  const repo = repoUrl(flow.repo);
  return n != null && repo ? `${repo}/issues/${n}` : null;
}

function pickIssue(list) {
  return list.find((i) => i.state === 'open') ?? list.filter((i) => i.state === 'merged').at(-1) ?? list[0] ?? null;
}

function linkFor(flow, selected) {
  const node = flow.nodes?.find((n) => n.id === selected);
  const issue = pickIssue(node?.issues ?? []) ?? pickIssue((flow.nodes ?? []).flatMap((n) => n.issues ?? []));
  if (!issue) return { message: 'no issue or link here' };
  const url = issueUrl(flow, issue);
  return url ? { url } : { message: `${issueLabel(issue)} has no link (use a URL ref, or set the flow's repo)` };
}

// --- state transitions ---

export function initialState(flows, flowId) {
  const map = new Map(flows.map((f) => [f.id, f]));
  const order = [...map.keys()].sort();
  const byUpdate = [...map.values()].sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')));
  const id = map.has(flowId) ? flowId : byUpdate[0]?.id ?? null;
  return {
    flows: map, order, flowId: id, selected: defaultSelected(map.get(id)), view: 'map', scroll: 0,
    listIndex: Math.max(0, order.indexOf(id)), menu: null, unseen: new Set(), message: '', memory: new Map(),
  };
}

function switchTo(state, id) {
  if (!id || !state.flows.has(id)) return state;
  const memory = new Map(state.memory);
  if (state.flowId) memory.set(state.flowId, { selected: state.selected, scroll: state.scroll });
  const back = memory.get(id);
  const flow = state.flows.get(id);
  const unseen = new Set(state.unseen);
  unseen.delete(id);
  const selected = back && flow.nodes?.some((n) => n.id === back.selected) ? back.selected : defaultSelected(flow);
  return { ...state, memory, unseen, flowId: id, selected, scroll: back?.scroll ?? 0, view: 'map', menu: null, listIndex: state.order.indexOf(id) };
}

const step = (state, by) => {
  if (!state.order.length) return state;
  const i = state.order.indexOf(state.flowId);
  return switchTo(state, state.order[(i + by + state.order.length) % state.order.length]);
};

const needsAttention = (state, id) => state.unseen.has(id) || (state.flows.get(id)?.nodes ?? []).some((n) => n.state === 'blocked');

function nextAttention(state) {
  const n = state.order.length;
  const i = state.order.indexOf(state.flowId);
  for (let k = 1; k <= n; k++) {
    const id = state.order[(i + k) % n];
    if (id !== state.flowId && needsAttention(state, id)) return switchTo(state, id);
  }
  return { ...state, message: 'no other flow needs attention' };
}

function openMenuOn(state, ctx) {
  const node = activeFlow(state)?.nodes?.find((n) => n.id === state.selected);
  if (!node) return state;
  return { ...state, menu: openMenu(node, nodeRect(state, ctx, node.id)) };
}

function menuAction(state, menu, action) {
  if (!action) return { state: { ...state, menu }, effects: [] };
  const next = { ...state, menu: null };
  if (action.type === 'state') return { state: next, effects: [{ type: 'write', flowId: state.flowId, node: menu.node, state: action.state, reason: action.reason }] };
  if (action.type === 'note') return { state: next, effects: [{ type: 'note', flowId: state.flowId, node: menu.node, text: action.text }] };
  return { state: next, effects: [] };
}

const none = (state) => ({ state, effects: [] });

function onMouse(state, ev, ctx) {
  if (ev.kind === 'wheel') {
    if (state.menu || state.view !== 'map' || (ev.wheel !== 'up' && ev.wheel !== 'down')) return none(state);
    // The wheel scrolls freely; the next move with the keys scrolls back to the selection.
    const free = { ...state, follow: false };
    return none({ ...free, scroll: clampScroll(free, ctx, state.scroll + (ev.wheel === 'up' ? -WHEEL_STEP : WHEEL_STEP)) });
  }
  if (ev.kind !== 'press' || ev.button !== 0) return none(state);
  if (state.menu) {
    const { menu, action } = menuClick(state.menu, ctx, ev.col, ev.row);
    return menuAction(state, menu, action);
  }
  if (ev.row === 0) {
    const id = tabAt(state, ctx.row0, ev.col);
    return none(id && id !== state.flowId ? switchTo(state, id) : state);
  }
  if (state.view !== 'map') return none(state);
  const flow = activeFlow(state);
  const noted = flow?.nodes?.length && typeof R.hitNote === 'function' ? R.hitNote(flow, viewOpts(state, ctx), ev.col, ev.row) : null;
  if (noted) return none({ ...state, selected: noted, view: 'detail' });
  const id = hitNode(state, ctx, ev.col, ev.row);
  if (!id) return none(state);
  if (id === state.selected) return none(openMenuOn(state, ctx));
  return none({ ...state, selected: id, follow: true });
}

function onKey(state, ev, ctx) {
  if (ev.name === 'ctrl-c') return { state, effects: [{ type: 'quit' }] };
  if (state.menu) {
    const { menu, action } = menuKey(state.menu, ev);
    return menuAction(state, menu, action);
  }
  const ch = ev.name === 'char' ? ev.ch : null;
  if (ch === 'q') return { state, effects: [{ type: 'quit' }] };
  if (ev.name === 'tab') return none(step(state, 1));
  if (ev.name === 'backtab') return none(step(state, -1));
  if (ch === 'n') return none(nextAttention(state));
  if (state.view === 'list') {
    const n = state.order.length;
    if (ev.name === 'up' && n) return none({ ...state, listIndex: (state.listIndex + n - 1) % n });
    if (ev.name === 'down' && n) return none({ ...state, listIndex: (state.listIndex + 1) % n });
    if (ev.name === 'enter') return none(switchTo(state, state.order[state.listIndex]));
    if (ev.name === 'escape' || ch === '/') return none({ ...state, view: 'map' });
    return none(state);
  }
  if (ch === '/') return none({ ...state, view: 'list', listIndex: Math.max(0, state.order.indexOf(state.flowId)) });
  if (ch === 's') return none(openMenuOn(state, ctx));
  if (ch === 'g') {
    const flow = activeFlow(state);
    if (!flow) return none(state);
    const link = linkFor(flow, state.selected);
    return link.url ? { state, effects: [{ type: 'open', url: link.url }] } : none({ ...state, message: link.message });
  }
  if (state.view === 'detail') return none(ev.name === 'escape' ? { ...state, view: 'map' } : state);
  if (DIRS[ev.name]) return none(follow(state, ctx, navigateFrom(state, ctx, ev.name)));
  if (ev.name === 'enter' && state.selected) return none({ ...state, view: 'detail' });
  return none(state);
}

// Pure: (state, event, ctx {cols, rows, row0}) → {state, effects}.
export function reduce(state, ev, ctx) {
  const s = state.message ? { ...state, message: '' } : state;
  if (ev.type === 'mouse') return onMouse(ev.kind === 'press' || ev.kind === 'wheel' ? s : state, ev, ctx);
  if (ev.type === 'key') return onKey(s, ev, ctx);
  return none(state);
}

// The nearest ancestor of `id` (by the old flow's edges) that still exists in the new flow.
function survivor(prev, flow, id) {
  const ids = new Set((flow.nodes ?? []).map((n) => n.id));
  if (ids.has(id)) return id;
  const edges = prev?.edges ?? [];
  const seen = new Set();
  for (let cur = id; cur && !seen.has(cur);) {
    seen.add(cur);
    const e = edges.find((x) => x.to === cur && !x.merge) ?? edges.find((x) => x.to === cur);
    cur = e?.from;
    if (cur && ids.has(cur)) return cur;
  }
  return defaultSelected(flow);
}

// A flow file changed (or we wrote it): keep the selection by id, the view and the scroll.
export function applyFlow(state, flow, ctx) {
  const prev = state.flows.get(flow.id);
  const flows = new Map(state.flows).set(flow.id, flow);
  const order = state.order.includes(flow.id) ? state.order : [...state.order, flow.id].sort();
  let next = { ...state, flows, order };
  if (!state.flowId) return { ...next, flowId: flow.id, selected: defaultSelected(flow) };
  if (flow.id !== state.flowId) {
    if (prev?.updated !== flow.updated || !prev) next.unseen = new Set(state.unseen).add(flow.id);
    return next;
  }
  next.selected = state.selected ? survivor(prev, flow, state.selected) : defaultSelected(flow);
  if (state.menu) {
    const node = flow.nodes?.find((n) => n.id === state.menu.node);
    next.menu = node ? { ...state.menu, current: node.state, anchor: nodeRect(next, ctx, node.id) ?? state.menu.anchor } : null;
  }
  return next;
}

export function removeFlow(state, id) {
  if (!state.flows.has(id)) return state;
  const flows = new Map(state.flows);
  flows.delete(id);
  const order = state.order.filter((x) => x !== id);
  const unseen = new Set(state.unseen);
  unseen.delete(id);
  const next = { ...state, flows, order, unseen };
  if (state.flowId !== id) return next;
  const other = order[0] ?? null;
  return { ...next, flowId: other, selected: defaultSelected(flows.get(other)), view: 'map', scroll: 0, menu: null };
}

// --- the controller: state + effects (store writes, opening links, quitting) ---

const label = (s) => ITEMS.find((it) => it.state === s)?.label ?? s;

export function createApp({ cols = 80, rows = 24, flowId, opener = openUrl, onQuit = () => {} } = {}) {
  let state = initialState([], null);
  let last = null;
  const size = { cols, rows };

  const ctx = () => ({ cols: size.cols, rows: size.rows, row0: last ? rowChars(last) : '' });

  async function writeNode(e, change, what) {
    try {
      const flow = await store.update(e.flowId, (f) => {
        const node = f.nodes?.find((n) => n.id === e.node);
        if (!node) throw new Error(`node "${e.node}" is gone`);
        change(node);
        return what;
      }, { who: 'you' });
      state = applyFlow(state, flow, ctx());
      return true;
    } catch (error) {
      state = { ...state, message: `✗ ${error.message}` };
      return false;
    }
  }

  const run = {
    write: (e) => writeNode(e, (node) => {
      node.state = e.state;
      if (e.state === 'blocked' && e.reason) node.blocked_by = e.reason;
      if (e.state !== 'blocked') delete node.blocked_by;
    }, `${e.node}: ${label(e.state)}${e.reason ? ` (${e.reason})` : ''}`),
    note: async (e) => {
      const saved = await writeNode(e, (node) => {
        node.notes = [e.text, ...(Array.isArray(node.notes) ? node.notes : [])].slice(0, NODE_NOTES);
      }, `note on ${e.node}: ${e.text}`);
      if (saved) state = { ...state, message: '✎ note saved · enter or click ✎ on the box to read notes' };
    },
    open: (e) => { try { opener(e.url); } catch (error) { state = { ...state, message: `✗ ${error.message}` }; } },
    quit: () => onQuit(),
  };

  const app = {
    get state() { return state; },
    ctx,
    async init() {
      const flows = [];
      for (const { id } of await store.list()) {
        try { flows.push(await store.load(id)); } catch { /* unreadable: skip */ }
      }
      state = initialState(flows, flowId);
      return app;
    },
    async handle(ev) {
      const out = reduce(state, ev, ctx());
      state = out.state;
      for (const e of out.effects) await run[e.type]?.(e);
      return out.effects;
    },
    // ids: changed flow ids, or '*' to rescan the folder.
    async reload(ids) {
      let list = [...new Set(ids)];
      if (list.includes('*')) {
        const names = readdirSync(store.flowsDir()).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
        list = [...new Set([...names, ...state.order])];
      }
      for (const id of list) {
        if (!validId(id)) continue;
        try {
          state = applyFlow(state, await store.load(id), ctx());
        } catch (error) {
          if (/^no flow /.test(error.message)) state = removeFlow(state, id);
        }
      }
    },
    resize(c, r) { size.cols = c; size.rows = r; last = null; },
    frame() {
      const flow = activeFlow(state) ?? EMPTY;
      const flows = state.order.map((id) => ({ ...state.flows.get(id), unseen: state.unseen.has(id) }));
      const g = R.render(flow, { ...viewOpts(state, size), flows: flows.length ? flows : [flow], listIndex: state.listIndex, unseen: state.unseen });
      if (state.menu) drawMenu(g, state.menu);
      if (state.message) {
        fill(g, 0, g.rows - 1, g.cols, 1, { bg: 'background' });
        text(g, 1, g.rows - 1, state.message, { fg: state.message.startsWith('✗') ? 'blocked' : 'accent' }, g.cols - 2);
      }
      last = g;
      return g;
    },
  };
  return app;
}

function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(cmd, [url], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

// --- the TTY: alt screen, raw mode, mouse, watcher ---

const MOUSE_ON = '\x1b[?1000h\x1b[?1002h\x1b[?1006h';
const MOUSE_OFF = '\x1b[?1006l\x1b[?1002l\x1b[?1000l';

function argFlow(argv) {
  const i = argv.indexOf('--flow');
  return (i >= 0 ? argv[i + 1] : null) ?? process.env.FLOW_MAP_FLOW ?? null;
}

async function main() {
  const out = process.stdout;
  const inp = process.stdin;
  const ansi = { mode: R.colorMode(), ascii: process.env.FLOW_MAP_ASCII === '1' };
  let watcher = null;
  let left = false;
  const leave = () => {
    if (left) return;
    left = true;
    watcher?.close();
    if (inp.isTTY) inp.setRawMode(false);
    out.write(`${MOUSE_OFF}\x1b[0m\x1b[?25h\x1b[?1049l`);
  };
  const quit = () => { leave(); process.exit(0); };
  process.on('SIGTERM', quit);
  process.on('SIGHUP', quit);
  process.on('uncaughtException', (error) => { leave(); console.error(error); process.exit(1); });

  out.write(`\x1b[?1049h\x1b[?25l${MOUSE_ON}`);
  if (inp.isTTY) inp.setRawMode(true);

  const app = createApp({ cols: out.columns || 80, rows: out.rows || 24, flowId: argFlow(process.argv.slice(2)), onQuit: quit });
  await app.init();

  let prev = null;
  const paint = () => {
    const g = app.frame();
    out.write(prev ? R.diff(prev, g, ansi) : `\x1b[0m\x1b[2J${R.toAnsi(g, ansi)}`);
    prev = g;
  };
  paint();

  // Events run one at a time so writes never interleave; each one ends with one diffed frame.
  let chain = Promise.resolve();
  const queue = (fn) => { chain = chain.then(fn).then(paint).catch((error) => { leave(); console.error(error); process.exit(1); }); };

  const parser = createParser();
  let escTimer = null;
  inp.setEncoding('utf8');
  inp.on('data', (chunk) => {
    clearTimeout(escTimer);
    const events = parser.feed(chunk);
    if (events.length) queue(async () => { for (const ev of events) await app.handle(ev); });
    if (parser.pending()) escTimer = setTimeout(() => {
      const rest = parser.flush();
      if (rest.length) queue(async () => { for (const ev of rest) await app.handle(ev); });
    }, 30);
  });

  out.on('resize', () => queue(() => { app.resize(out.columns || 80, out.rows || 24); prev = null; }));

  const dir = store.flowsDir();
  mkdirSync(dir, { recursive: true });
  const changed = new Set();
  let debounce = null;
  watcher = watch(dir, (_event, name) => {
    // `<id>.json`, or the `<id>.json.<pid>.<ms>.tmp` an atomic write renames from; locks are ignored.
    const m = name ? /^([a-z0-9][a-z0-9_-]*)\.json(\.\d+\.\d+\.tmp)?$/.exec(name) : null;
    if (name && !m) return;
    changed.add(m ? m[1] : '*');
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const ids = [...changed];
      changed.clear();
      queue(() => app.reload(ids));
    }, 50);
  });
}

const isMain = () => {
  try { return !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
};
if (isMain()) main();
