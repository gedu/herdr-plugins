// Variant C, architecture (SPEC §7): layers top to bottom, names in a 12-col gutter, edges down.
import { glyphs, layout as L } from './tokens.js';
import { put, vline, text } from './grid.js';
import { nodeWidth, nodeHeight, drawNode, detailOf } from './node.js';
import { columnPacker, center, bar, drawLabel, labelEnd, labelW } from './tree.js';

const E = glyphs.edge;
const EDGE = { fg: 'edge' };
const DASHED = { fg: 'blocked' };
export const GUTTER = 12;
const bottom = (r) => r.row + r.h - 1;

// A layer box has one line under the title: its issues, else its detail (SPEC §7).
export const layerNode = (n) => (n.issues?.length ? { ...n, detail: '', blocked_by: undefined } : { ...n, detail: detailOf(n) });

function layerIndex(flow) {
  const order = (flow.layers ?? []).map((l) => l.id);
  for (const n of flow.nodes) if (!order.includes(n.layer ?? '')) order.push(n.layer ?? '');
  return new Map(order.map((id, i) => [id, i]));
}

export function layoutLayers(flow, top = L.header_rows + 1, { fitLabels = false } = {}) {
  const index = layerIndex(flow);
  const layerOf = new Map(flow.nodes.map((n) => [n.id, index.get(n.layer ?? '')]));
  const rects = new Map(flow.nodes.map((n) => [n.id, { col: 0, row: 0, w: nodeWidth(n), h: nodeHeight(layerNode(n)) }]));
  const kids = new Map(flow.nodes.map((n) => [n.id, []]));
  const parent = new Map();
  const edges = (flow.edges ?? []).filter((e) => rects.has(e.from) && rects.has(e.to) && layerOf.get(e.from) < layerOf.get(e.to));
  for (const e of edges) {
    if (parent.has(e.to)) continue;
    parent.set(e.to, e);
    kids.get(e.from).push(e);
  }
  const labelNeeds = fitLabels ? (id, c) => {
    const p = parent.get(id);
    return p?.label ? [[layerOf.get(id), c + labelW(p) + 3]] : [];
  } : null;
  const { place } = columnPacker({ kids, depth: layerOf, rects, start: 1 + GUTTER, labelNeeds });
  for (const n of flow.nodes) if (!parent.has(n.id)) place(n.id);

  // Rows: 2 connector rows when every edge into a layer is straight and unlabelled, else 3.
  const layers = [...new Set(flow.nodes.map((n) => layerOf.get(n.id)))].sort((a, b) => a - b);
  const tops = new Map();
  let row = top;
  layers.forEach((li, k) => {
    if (k) {
      const into = edges.filter((e) => layerOf.get(e.to) === li);
      const straight = into.every((e) => parent.get(e.to) === e && layerOf.get(e.from) === layers[k - 1]
        && !e.label && !e.label2 && kids.get(e.from).length === 1 && center(rects.get(e.from)) === center(rects.get(e.to)));
      row += straight ? 2 : 3;
    }
    tops.set(li, row);
    const h = Math.max(...flow.nodes.filter((n) => layerOf.get(n.id) === li).map((n) => rects.get(n.id).h));
    row += h;
  });
  for (const n of flow.nodes) rects.get(n.id).row = tops.get(layerOf.get(n.id));
  for (const n of flow.nodes) if (n.pos) Object.assign(rects.get(n.id), { col: n.pos.col, row: n.pos.row });

  let width = Math.max(0, ...[...rects.values()].map((r) => r.col + r.w)) + L.margin_cols;
  if (fitLabels) for (const e of edges) if (e.label) width = Math.max(width, labelEnd(center(rects.get(e.to)), e) + 2);
  const end = Math.max(top, ...[...rects.values()].map((r) => r.row + r.h));
  return { rects, width, end, edges, layerOf };
}

function drawEdges(g, lay) {
  const groups = new Map();
  for (const e of lay.edges) {
    const key = `${e.from}|${lay.rects.get(e.to).row}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const labels = [];
  for (const group of groups.values()) {
    const p = lay.rects.get(group[0].from);
    const pc = center(p);
    const childTop = lay.rects.get(group[0].to).row;
    const barRow = childTop - 2;
    const kcs = group.map((e) => center(lay.rects.get(e.to)));
    if (group.length === 1 && kcs[0] === pc) {
      const dashed = group[0].style === 'dashed';
      vline(g, pc, bottom(p) + 1, childTop - 2 - bottom(p), dashed ? E.dashed_v : E.v, dashed ? DASHED : EDGE);
    } else {
      vline(g, pc, bottom(p) + 1, barRow - bottom(p) - 1, E.v, EDGE);
      bar(g, barRow, [pc], kcs);
    }
    group.forEach((e, i) => {
      put(g, kcs[i], childTop - 1, glyphs.arrow_down, e.style === 'dashed' ? DASHED : EDGE);
      if (e.label && e.label2) labels.push({ row: barRow - 1, stub: kcs[i], text: e.label }, { row: barRow, stub: kcs[i], text: e.label2 });
      else if (e.label) labels.push({ row: barRow, stub: kcs[i], text: e.label });
    });
  }
  for (const l of labels) drawLabel(g, l);
}

export function drawLayers(g, flow, lay, { selected, agentsByNode }) {
  const names = new Map((flow.layers ?? []).map((l) => [l.id, l.label ?? l.id]));
  const titleRow = new Map();
  for (const n of flow.nodes) {
    const r = lay.rects.get(n.id);
    const key = n.layer ?? '';
    titleRow.set(key, Math.min(titleRow.get(key) ?? Infinity, r.row + 1));
  }
  for (const [key, row] of titleRow) text(g, 1, row, names.get(key) ?? key, { fg: 'muted' }, GUTTER - 1);
  drawEdges(g, lay);
  for (const n of flow.nodes) {
    drawNode(g, layerNode(n), lay.rects.get(n.id), { selected: n.id === selected, agents: agentsByNode.get(n.id) ?? [] });
  }
}
