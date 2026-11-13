// Variant A, tree / flow (SPEC §4–5): automatic layout and edges with labels.
import { glyphs, layout as L } from './tokens.js';
import { strWidth, fit } from './width.js';
import { put, vline, text, cellAt } from './grid.js';
import { nodeWidth, nodeHeight, drawNode } from './node.js';

const E = glyphs.edge;
const EDGE = { fg: 'edge' };
const DASHED = { fg: 'blocked' };
const center = (r) => r.col + Math.floor(r.w / 2);
const bottom = (r) => r.row + r.h - 1;

// True when `a` is `b` or one of its tree ancestors (an edge b → a would close a cycle).
function isAncestor(parent, a, b) {
  for (let n = b, i = 0; n && i < 10000; n = parent.get(n)?.from, i++) if (n === a) return true;
  return false;
}

function graph(flow) {
  const ids = flow.nodes.map((n) => n.id);
  const known = new Set(ids);
  const kids = new Map(ids.map((id) => [id, []]));
  const parent = new Map();
  const mergeParents = new Map();
  for (const e of flow.edges ?? []) {
    if (!known.has(e.from) || !known.has(e.to) || e.from === e.to) continue;
    if (e.merge) {
      if (!mergeParents.has(e.to)) mergeParents.set(e.to, []);
      mergeParents.get(e.to).push(e);
    } else if (!parent.has(e.to) && !isAncestor(parent, e.to, e.from)) {
      parent.set(e.to, e);
      kids.get(e.from).push(e);
    }
  }
  return { ids, kids, parent, mergeParents };
}

function depths(flow, g) {
  const depth = new Map(flow.nodes.map((n) => [n.id, 0]));
  // Relax a few times: a merge node sits one level below its deepest parent.
  for (let pass = 0, changed = true; changed && pass <= g.ids.length; pass++) {
    changed = false;
    for (const id of g.ids) {
      const p = g.parent.get(id);
      const merge = g.mergeParents.get(id);
      let d = p ? depth.get(p.from) + 1 : 0;
      if (merge) d = Math.max(d, ...merge.map((e) => depth.get(e.from) + 1));
      if (d !== depth.get(id)) { depth.set(id, d); changed = true; }
    }
  }
  return depth;
}

// Positions for every node: rows by depth, columns by packing leaves and centering parents.
export function layoutTree(flow, top = L.header_rows) {
  const g = graph(flow);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const depth = depths(flow, g);
  const rects = new Map(flow.nodes.map((n) => [n.id, { col: 0, row: 0, w: nodeWidth(n), h: nodeHeight(n) }]));

  const maxDepth = Math.max(0, ...depth.values());
  const rowOf = [];
  for (let d = 0; d <= maxDepth; d++) {
    const at = g.ids.filter((id) => depth.get(id) === d);
    if (d === 0) { rowOf.push(top); continue; }
    const prev = g.ids.filter((id) => depth.get(id) === d - 1);
    const prevBottom = Math.max(rowOf[d - 1], ...prev.map((id) => rowOf[d - 1] + rects.get(id).h - 1));
    const allMerge = at.length > 0 && at.every((id) => g.mergeParents.has(id) && !g.parent.has(id));
    rowOf.push(prevBottom + (allMerge ? 4 : 5));
  }
  for (const id of g.ids) rects.get(id).row = rowOf[depth.get(id)];

  const free = new Map();
  const gap = L.sibling_gap_cols;
  const nextFree = (d) => free.get(d) ?? L.margin_cols + 1;
  const subtree = (id) => [id, ...g.kids.get(id).flatMap((e) => subtree(e.to))];
  const shift = (id, by) => { for (const n of subtree(id)) rects.get(n).col += by; };
  const claim = (id) => {
    for (const n of subtree(id)) {
      const r = rects.get(n);
      free.set(depth.get(n), Math.max(nextFree(depth.get(n)), r.col + r.w + gap));
    }
  };
  const placed = new Set();
  const place = (id, target) => {
    const r = rects.get(id);
    const kids = g.kids.get(id).map((e) => e.to);
    for (const k of kids) place(k);
    if (!kids.length) r.col = nextFree(depth.get(id));
    else {
      const cs = kids.map((k) => center(rects.get(k))).sort((a, b) => a - b);
      const mid = cs.length >> 1;
      const c = cs.length % 2 ? cs[mid] : Math.floor((cs[mid - 1] + cs[mid]) / 2);
      r.col = c - Math.floor(r.w / 2);
    }
    if (target !== undefined && target > r.col) shift(id, target - r.col);
    const over = nextFree(depth.get(id)) - r.col;
    if (over > 0) shift(id, over);
    for (const n of subtree(id)) placed.add(n);
    claim(id);
  };

  for (const id of g.ids) if (!g.parent.has(id) && !g.mergeParents.has(id)) place(id);
  // Merge nodes: centered on the floor of the midpoint between their parents' centers.
  const pending = g.ids.filter((id) => !placed.has(id) && !g.parent.has(id));
  for (let progress = true; progress;) {
    progress = false;
    for (const id of pending) {
      if (placed.has(id)) continue;
      const ps = g.mergeParents.get(id).map((e) => e.from);
      if (!ps.every((p) => placed.has(p))) continue;
      const cs = ps.map((p) => center(rects.get(p)));
      place(id, Math.floor((Math.min(...cs) + Math.max(...cs)) / 2) - Math.floor(rects.get(id).w / 2));
      progress = true;
    }
  }
  for (const id of pending) if (!placed.has(id)) place(id);

  // A fixed `pos` on a node wins over the automatic position.
  for (const n of flow.nodes) if (n.pos) Object.assign(rects.get(n.id), { col: n.pos.col, row: n.pos.row });

  const width = Math.max(0, ...[...rects.values()].map((r) => r.col + r.w)) + L.margin_cols;
  return { g, byId, rects, width };
}

// Junction glyph for a bar cell from which lines go up, down, left and right.
function junction(up, down, left, right) {
  if (up && down) return left && right ? E.cross : right ? '├' : left ? '┤' : E.v;
  if (down) return left && right ? E.t_down : right ? E.tl : left ? E.tr : E.v;
  if (up) return left && right ? E.t_up : right ? E.bl : left ? E.br : E.v;
  return E.h;
}

function bar(g, row, ups, downs) {
  const lo = Math.min(...ups, ...downs);
  const hi = Math.max(...ups, ...downs);
  const up = new Set(ups);
  const down = new Set(downs);
  for (let c = lo; c <= hi; c++) put(g, c, row, junction(up.has(c), down.has(c), c > lo, c < hi), EDGE);
}

function drawEdges(g, lay) {
  const labels = [];
  for (const [id, kidEdges] of lay.g.kids) {
    if (!kidEdges.length) continue;
    const p = lay.rects.get(id);
    const pc = center(p);
    const kids = kidEdges.map((e) => ({ e, r: lay.rects.get(e.to) }));
    const barRow = Math.min(...kids.map((k) => k.r.row)) - 3;
    vline(g, pc, bottom(p) + 1, barRow - bottom(p) - 1, E.v, EDGE);
    bar(g, barRow, [pc], kids.map((k) => center(k.r)));
    for (const { e, r } of kids) {
      const kc = center(r);
      const dashed = e.style === 'dashed';
      vline(g, kc, barRow + 1, r.row - barRow - 2, dashed ? E.dashed_v : E.v, dashed ? DASHED : EDGE);
      put(g, kc, r.row - 1, glyphs.arrow_down, dashed ? DASHED : EDGE);
      if (!e.label) continue;
      if (e.label_at === 'trunk') labels.push({ row: bottom(p) + 1, stub: pc, text: e.label });
      else labels.push({ row: barRow + 1, stub: kc, text: e.label });
    }
  }
  for (const [id, edges] of lay.g.mergeParents) {
    const m = lay.rects.get(id);
    const mc = center(m);
    const barRow = m.row - 2;
    const ups = edges.map((e) => {
      const r = lay.rects.get(e.from);
      vline(g, center(r), bottom(r) + 1, barRow - bottom(r) - 1, E.v, EDGE);
      return center(r);
    });
    bar(g, barRow, ups, [mc]);
    put(g, mc, m.row - 1, glyphs.arrow_down, EDGE);
    const label = edges.find((e) => e.label)?.label;
    if (label) labels.push({ row: m.row - 1, stub: mc, text: label });
  }
  for (const l of labels) drawLabel(g, l);
}

const blankAt = (g, c, row) => { const cell = cellAt(g, c, row); return !!cell && cell.ch === ' '; };

// Room for a label starting at `from` going right, keeping 1 empty cell before the next line.
function roomRight(g, row, from) {
  let c = from;
  while (c < g.cols - 1 && blankAt(g, c, row)) c++;
  return Math.max(0, (c >= g.cols - 1 ? g.cols - 1 : c - 1) - from);
}

function roomLeft(g, row, end) {
  let c = end;
  while (c > 0 && blankAt(g, c, row)) c--;
  return Math.max(0, end - (c === 0 ? 0 : c + 1));
}

// Labels sit 2 cols right of their stub; if they do not fit, left of it, else cut with `…`.
function drawLabel(g, { row, stub, text: label }) {
  const w = strWidth(label);
  const right = roomRight(g, row, stub + 2);
  const left = roomLeft(g, row, stub - 2);
  const style = { fg: 'muted' };
  if (w <= right || right >= left) return text(g, stub + 2, row, fit(label, right), style);
  const s = fit(label, left);
  text(g, stub - 1 - strWidth(s), row, s, style);
}

export function drawTree(g, flow, lay, { selected, agentsByNode }) {
  drawEdges(g, lay);
  for (const n of flow.nodes) {
    drawNode(g, n, lay.rects.get(n.id), { selected: n.id === selected, agents: agentsByNode.get(n.id) ?? [] });
  }
}
