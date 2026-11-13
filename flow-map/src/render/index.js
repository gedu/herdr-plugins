// render(flow, opts) → cell grid, plus the pure helpers the popup uses for the mouse and the keys
// (layout, hitTest, navigate). No Herdr, no I/O.
import { createGrid, hline, text } from './grid.js';
import { glyphs, layout as L } from './tokens.js';
import {
  drawHeader, drawNotes, drawFooter, drawTabs, notesRows,
  TREE_KEYS, SCREEN_KEYS, LAYER_KEYS, VERTICAL_KEYS, EMPTY_KEYS, LIST_KEYS,
} from './frame.js';
import { layoutTree, drawTree, graph, center } from './tree.js';
import { layoutScreens, drawScreens } from './screens.js';
import { layoutLayers, drawLayers } from './layers.js';
import { layoutVertical, drawVerticalRow, selectionPath, VERTICAL_TOP } from './vertical.js';
import { drawDetail, detailKeys } from './detail.js';
import { drawEmpty } from './empty.js';
import { drawList } from './list.js';
import { noteBadgeAt } from './node.js';

const MAP_TOP = L.header_rows;

// --- layout (cached per flow object and popup size) -------------------------------------------

const cache = new WeakMap();

// The tree layout at its compact spacing, independent of the popup size.
const trees = new WeakMap();
export function treeLayout(flow) {
  let lay = trees.get(flow);
  if (!lay) trees.set(flow, (lay = layoutTree(flow)));
  return lay;
}

// Widest layout that fits: labels whole (fitLabels), else compact with labels cut, else vertical.
function computeBase(flow, cols) {
  if (!flow.nodes?.length) return { kind: 'empty', rects: new Map(), end: MAP_TOP };
  let needs;
  if (flow.layout === 'screens') {
    const s = layoutScreens(flow);
    if (s.width <= cols) return { kind: 'screens', ...s };
    needs = s.width;
  } else if (flow.layout === 'layers') {
    const wide = layoutLayers(flow, MAP_TOP + 1, { fitLabels: true });
    if (wide.width <= cols) return { kind: 'layers', ...wide };
    const tight = layoutLayers(flow, MAP_TOP + 1);
    if (tight.width <= cols) return { kind: 'layers', ...tight };
    needs = tight.width;
  } else {
    const wide = layoutTree(flow, MAP_TOP, { fitLabels: true });
    if (wide.width <= cols) return { kind: 'tree', ...wide };
    const tight = treeLayout(flow);
    if (tight.width <= cols) return { kind: 'tree', ...tight };
    needs = tight.width;
  }
  const v = layoutVertical(flow, cols);
  return { kind: 'vertical', ...v, needs, end: VERTICAL_TOP + v.rows.length };
}

function base(flow, cols, rows) {
  let m = cache.get(flow);
  if (!m) cache.set(flow, (m = new Map()));
  const key = `${cols}x${rows}`;
  let b = m.get(key);
  if (!b) m.set(key, (b = computeBase(flow, cols)));
  return b;
}

// Scroll that keeps rows r0…r1 (content rows) visible in a window of V rows; the first and last
// window rows turn into `▲ / ▼ N more` markers while there is content above / below.
function fitScroll(scroll, total, V, r0, r1) {
  const max = Math.max(0, total - V);
  let s = Math.min(Math.max(0, scroll | 0), max);
  if (r0 == null) return s;
  if (r1 > s + V - 1 - (s < max ? 1 : 0)) s = Math.min(max, r1 - V + 2);
  if (r0 < s + (s > 0 ? 1 : 0)) s = Math.max(0, r0 - 1);
  return s;
}

// Map region, notes rule and effective scroll for one frame. The scroll keeps the selection in
// view unless `follow` is false (the person scrolled with the wheel).
function frameOf(flow, b, { rows, selected: sel, scroll = 0, follow = true }) {
  const selected = follow ? sel : undefined;
  const { n, latest, preferred } = notesRows(rows, flow.notes ?? []);
  if (b.kind === 'vertical') {
    const top = VERTICAL_TOP;
    const regEnd = n ? latest - 1 : rows - 3;
    const len = b.rows.length;
    if (len <= regEnd - top) return { top, V: len, total: len, scroll: 0, rule: n ? top + len + 1 : null };
    const i = b.rowOf.get(selected);
    return { top, V: regEnd - top, total: len, scroll: fitScroll(scroll, len, regEnd - top, i, i), rule: n ? latest : null };
  }
  const top = MAP_TOP;
  const end = n ? Math.min(latest, Math.max(preferred, b.end)) : rows - 3;
  const total = b.end - top;
  const V = Math.max(1, end - top);
  const r = b.rects.get(selected);
  const s = total <= V ? 0 : fitScroll(scroll, total, V, r ? r.row - top : null, r ? r.row + r.h - 1 - top : null);
  return { top, V: Math.min(V, Math.max(total, 0)), total, scroll: s, rule: n ? end : null };
}

// First and last content rows (relative to the map top) that are not covered by a marker.
function visibleRows(f) {
  const max = Math.max(0, f.total - f.V);
  return [f.scroll + (f.scroll > 0 ? 1 : 0), f.scroll + f.V - 1 - (f.scroll < max ? 1 : 0)];
}

function rectsOf(b, f, cols) {
  if (b.kind === 'vertical') {
    const [lo, hi] = visibleRows(f);
    const rects = new Map();
    for (const [id, i] of b.rowOf) if (i >= lo && i <= hi) rects.set(id, { col: 1, row: f.top + i - f.scroll, w: cols - 2, h: 1 });
    return rects;
  }
  if (!f.scroll) return b.rects;
  const rects = new Map();
  for (const [id, r] of b.rects) rects.set(id, { ...r, row: r.row - f.scroll });
  return rects;
}

export function layout(flow, { cols, rows, scroll = 0, selected, follow } = {}) {
  const b = base(flow, cols, rows);
  if (b.kind === 'empty') return { kind: 'empty', rects: b.rects, scroll: 0, region: { top: MAP_TOP, end: MAP_TOP } };
  const f = frameOf(flow, b, { rows, selected, scroll, follow });
  const [lo, hi] = visibleRows(f);
  return { kind: b.kind, rects: rectsOf(b, f, cols), scroll: f.scroll, region: { top: f.top + lo - f.scroll, end: f.top + hi - f.scroll + 1 } };
}

export function hitTest(flow, opts, col, row) {
  const { rects, region } = layout(flow, opts);
  if (row < region.top || row >= region.end) return null;
  for (const [id, r] of rects) if (col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) return id;
  return null;
}

// The node whose ` ✎ N ` badge is under (col, row), boxed views only; null elsewhere.
export function hitNote(flow, opts, col, row) {
  const { kind, rects, region } = layout(flow, opts);
  if (kind === 'vertical' || row < region.top || row >= region.end) return null;
  for (const node of flow.nodes ?? []) {
    const r = rects.get(node.id);
    const b = r && noteBadgeAt(node, r);
    if (b && row === b.row && col >= b.col && col < b.col + b.w) return node.id;
  }
  return null;
}

// --- navigation (SPEC §12) --------------------------------------------------------------------

// Nearest node whose center lies in direction `dir`, preferring the same row / column.
function nearest(rects, id, dir) {
  const a = rects.get(id);
  const ac = center(a);
  const ar = a.row + a.h / 2;
  let best = null;
  let score = Infinity;
  for (const [other, r] of rects) {
    if (other === id) continue;
    const dx = center(r) - ac;
    const dy = r.row + r.h / 2 - ar;
    const along = { right: dx, left: -dx, down: dy, up: -dy }[dir];
    if (along <= 0) continue;
    const s = dir === 'left' || dir === 'right' ? Math.abs(dx) + 4 * Math.abs(dy) : 4 * Math.abs(dy) + Math.abs(dx);
    if (s < score) { score = s; best = other; }
  }
  return best;
}

function sibling(list, id, dir) {
  const i = list.indexOf(id);
  if (i < 0) return null;
  return list[i + (dir === 'right' ? 1 : -1)] ?? null;
}

export function navigate(flow, opts, selectedId, dir) {
  const b = base(flow, opts.cols, opts.rows);
  if (b.kind === 'empty') return selectedId ?? null;
  const ids = flow.nodes.map((n) => n.id);
  if (!ids.includes(selectedId)) return b.kind === 'vertical' ? b.rows.find((r) => r.type === 'node').id : ids[0];
  const pick = (id) => id ?? selectedId;
  if (b.kind === 'vertical') {
    const order = b.rows.filter((r) => r.type === 'node').map((r) => r.id);
    const i = order.indexOf(selectedId);
    if (flow.layout === 'screens') dir = { left: 'up', right: 'down' }[dir] ?? dir;
    if (dir === 'up') return order[Math.max(0, i - 1)];
    if (dir === 'down') return order[Math.min(order.length - 1, i + 1)];
    if (dir === 'left') return pick(b.parent.get(selectedId)?.from ?? b.mergeParents.get(selectedId)?.[0]?.from);
    return pick(order.find((id) => b.parent.get(id)?.from === selectedId));
  }
  if (b.kind === 'screens') {
    const i = ids.indexOf(selectedId);
    if (dir === 'left') return ids[Math.max(0, i - 1)];
    if (dir === 'right') return ids[Math.min(ids.length - 1, i + 1)];
    return selectedId;
  }
  if (b.kind === 'layers') {
    if (dir === 'down') return pick(b.edges.find((e) => e.from === selectedId)?.to ?? nearest(b.rects, selectedId, dir));
    if (dir === 'up') return pick(b.edges.find((e) => e.to === selectedId)?.from ?? nearest(b.rects, selectedId, dir));
    return pick(nearest(b.rects, selectedId, dir));
  }
  const g = b.g ?? graph(flow);
  if (dir === 'down') {
    const kid = g.kids.get(selectedId)[0]?.to ?? [...g.mergeParents].find(([, es]) => es.some((e) => e.from === selectedId))?.[0];
    return pick(kid ?? nearest(b.rects, selectedId, dir));
  }
  if (dir === 'up') return pick(g.parent.get(selectedId)?.from ?? g.mergeParents.get(selectedId)?.[0]?.from ?? nearest(b.rects, selectedId, dir));
  const p = g.parent.get(selectedId)?.from;
  const list = p ? g.kids.get(p).map((e) => e.to) : g.ids.filter((id) => !g.parent.has(id) && !g.mergeParents.has(id));
  return pick(sibling(list, selectedId, dir) ?? nearest(b.rects, selectedId, dir));
}

// --- render -----------------------------------------------------------------------------------

function agentsByNode(flow) {
  const map = new Map();
  for (const a of flow.agents ?? []) {
    if (!map.has(a.node)) map.set(a.node, []);
    map.get(a.node).push(a);
  }
  return map;
}

const KEYS = { tree: TREE_KEYS, screens: SCREEN_KEYS, layers: LAYER_KEYS, vertical: VERTICAL_KEYS };

function drawMap2D(g, flow, b, ctx) {
  if (b.kind === 'screens') drawScreens(g, flow, b, ctx);
  else if (b.kind === 'layers') drawLayers(g, flow, b, ctx);
  else drawTree(g, flow, b, ctx);
}

// Copies rows of `src` into `dst` (cells are copied, not shared).
function blit(dst, src, srcRow, dstRow, h) {
  const { cols } = dst;
  for (let r = 0; r < h; r++) {
    if (srcRow + r >= src.rows) break;
    for (let c = 0; c < cols; c++) Object.assign(dst.cells[(dstRow + r) * cols + c], src.cells[(srcRow + r) * cols + c]);
  }
}

function marker(g, row, glyph, count) {
  const at = row * g.cols;
  for (let c = 0; c < g.cols; c++) Object.assign(g.cells[at + c], { ch: ' ', fg: null, bg: null, bold: false });
  text(g, 3, row, `${glyph} ${count} more`, { fg: 'muted' });
}

function drawMap(g, flow, b, f, ctx) {
  const max = Math.max(0, f.total - f.V);
  const [lo, hi] = visibleRows(f);
  let above = 0;
  let below = 0;
  if (b.kind === 'vertical') {
    const path = selectionPath(b, ctx.selected);
    for (let i = f.scroll; i < f.scroll + f.V; i++) drawVerticalRow(g, f.top + i - f.scroll, b.rows[i], b, { ...ctx, path });
    for (const i of b.rowOf.values()) { if (i < lo) above++; else if (i > hi) below++; }
  } else if (!max) {
    drawMap2D(g, flow, b, ctx);
  } else {
    const off = createGrid(g.cols, b.end);
    drawMap2D(off, flow, b, ctx);
    blit(g, off, f.top + f.scroll, f.top, f.V);
    for (const r of b.rects.values()) {
      if (r.row - f.top < lo) above++;
      else if (r.row + r.h - 1 - f.top > hi) below++;
    }
  }
  if (f.scroll > 0) marker(g, f.top, '▲', above);
  if (f.scroll < max) marker(g, f.top + f.V - 1, '▼', below);
}

export function render(flow, opts = {}) {
  const { cols, rows, selected, view = 'map', flows = [flow] } = opts;
  const g = createGrid(cols, rows);
  g.scroll = 0;
  if (view === 'list') {
    drawTabs(g, 0, flow, flows, { hint: 'esc close the list' });
    hline(g, 0, 1, cols, glyphs.rule, { fg: 'track' });
    drawList(g, flows, opts.list);
    drawFooter(g, { keys: LIST_KEYS });
    return g;
  }
  const b = base(flow, cols, rows);
  g.kind = b.kind;
  const compact = b.kind === 'vertical';
  const note = compact ? `vertical · the map needs ${b.needs} columns, this popup has ${cols}` : undefined;
  drawHeader(g, flow, { flows, compact, note });
  const byNode = agentsByNode(flow);
  if (view === 'detail') {
    drawDetail(g, flow, selected, { detail: opts.detail, now: opts.now, agentsByNode: byNode });
    drawFooter(g, { keys: detailKeys(flow.nodes?.find((n) => n.id === selected), opts.detail), compact });
    return g;
  }
  if (b.kind === 'empty') {
    drawEmpty(g);
    const { n, preferred } = notesRows(rows, flow.notes ?? []);
    if (n) drawNotes(g, flow.notes, preferred);
    drawFooter(g, { keys: EMPTY_KEYS });
    return g;
  }
  const f = frameOf(flow, b, opts);
  drawMap(g, flow, b, f, { selected, agentsByNode: byNode });
  if (f.rule != null) drawNotes(g, flow.notes, f.rule);
  const dashed = (flow.edges ?? []).some((e) => e.style === 'dashed');
  drawFooter(g, { dashed, keys: KEYS[b.kind], compact });
  g.scroll = f.scroll;
  return g;
}

export { drawTabs };
export { toAnsi, diff, colorMode } from './ansi.js';
