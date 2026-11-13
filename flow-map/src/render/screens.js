// Variant B, screen flow (SPEC §6): screens left to right, each with a wireframe and its tasks.
import { glyphs, layout as L, states, stateOf } from './tokens.js';
import { box, fill, hline, put, text } from './grid.js';
import { chips } from './issues.js';
import { detailOf, drawAgentTag, drawChips, TITLE_FG } from './node.js';
import { pieces } from './frame.js';

export const SCREEN_W = 26;
const GAP = 10;
const WIRE_ROWS = 4;
const TASK_ROWS = 3;
export const SCREEN_H = 4 + 1 + WIRE_ROWS + 1 + TASK_ROWS + 1;
const DIVIDER = { light: ['├', '─', '┤'], heavy: ['┣', '━', '┫'], dashed: ['├', '┄', '┤'] };
const RAIL_WORD = { done: 'built', in_progress: 'building', blocked: 'blocked' };
const RAIL_FG = { done: 'done', in_progress: 'emphasis', blocked: 'blocked', pending: 'track' };
const stateKey = (s) => (TITLE_FG[s] ? s : 'pending');

// Node `i` at col 2 + i × (26 + 10); rail on top+2/top+3, boxes on top+5, `▲ building now` under them.
export function layoutScreens(flow, top = L.header_rows) {
  const rects = new Map();
  flow.nodes.forEach((n, i) => rects.set(n.id, { col: L.margin_cols + 1 + i * (SCREEN_W + GAP), row: top + 5, w: SCREEN_W, h: SCREEN_H }));
  const n = flow.nodes.length;
  const width = L.margin_cols + 1 + n * (SCREEN_W + GAP) - GAP + L.margin_cols;
  return { rects, width, top, end: top + 5 + SCREEN_H + 1 };
}

function drawRail(g, flow, lay) {
  const firstPending = flow.nodes.findIndex((n) => stateKey(n.state) === 'pending');
  flow.nodes.forEach((n, i) => {
    const s = stateKey(n.state);
    const r = lay.rects.get(n.id);
    const word = RAIL_WORD[s] ?? (i === firstPending ? 'next' : 'later');
    text(g, r.col, lay.top + 2, `${stateOf(s).glyph} ${i + 1} ${word}`, { fg: TITLE_FG[s], bold: s === 'in_progress' }, SCREEN_W + GAP - 1);
    const next = flow.nodes[i + 1] ? lay.rects.get(flow.nodes[i + 1].id).col : r.col + r.w;
    hline(g, r.col, lay.top + 3, next - r.col, glyphs.rule, { fg: RAIL_FG[s], bold: s === 'in_progress' });
  });
}

const TASK_FG = { done: 'done', in_progress: 'emphasis', pending: 'muted', blocked: 'blocked' };

function drawScreen(g, node, r, { selected, agents }) {
  const state = stateKey(node.state);
  const s = stateOf(state);
  const bg = selected ? 'selection' : undefined;
  const border = { fg: s.fg, bg };
  if (selected) fill(g, r.col, r.row, r.w, r.h, { bg });
  box(g, r.col, r.row, r.w, r.h, state, { bg });
  const inner = r.w - 4;
  const x = r.col + 2;
  text(g, x, r.row + 1, `${s.glyph} ${node.title ?? ''}`, { fg: TITLE_FG[state], bold: s.titleBold }, inner);
  const detail = detailOf(node);
  if (detail) text(g, x, r.row + 2, detail, { fg: state === 'blocked' ? 'blocked' : 'muted' }, inner);
  if (node.issues?.length) drawChips(g, x, r.row + 3, chips(node.issues), inner);
  else text(g, x, r.row + 3, 'no issue yet', { fg: 'muted' }, inner);
  const [lt, h, rt] = DIVIDER[states[state].border] ?? DIVIDER.light;
  for (const row of [r.row + 4, r.row + 5 + WIRE_ROWS]) {
    put(g, r.col, row, lt, border);
    hline(g, r.col + 1, row, r.w - 2, h, border);
    put(g, r.col + r.w - 1, row, rt, border);
  }
  (node.wireframe ?? []).slice(0, WIRE_ROWS).forEach((line, i) => text(g, x, r.row + 5 + i, line, { fg: 'muted' }, inner));
  const textFg = TITLE_FG[state];
  (node.tasks ?? []).slice(0, TASK_ROWS).forEach((t, i) => {
    const ts = stateKey(t.state);
    pieces(g, x, r.row + 6 + WIRE_ROWS + i, [
      [stateOf(ts).glyph, { fg: TASK_FG[ts], bold: ts === 'in_progress' }],
      [` ${t.text ?? ''}`, { fg: ts === 'pending' ? 'muted' : textFg }],
    ], x + inner);
  });
  drawAgentTag(g, r, agents);
  if (selected) put(g, r.col - 2, r.row + 1, glyphs.selected_marker, { fg: 'accent' });
}

// Edge in the gap after its source: label on the wireframe's first row, `─────────→` on its second.
function drawEdges(g, flow, lay) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  for (const e of flow.edges ?? []) {
    const from = lay.rects.get(e.from);
    if (!from || !lay.rects.has(e.to)) continue;
    const col = from.col + from.w;
    const dashed = e.style === 'dashed';
    const style = { fg: dashed ? 'blocked' : byId.get(e.from).state === 'done' ? 'done' : 'edge' };
    if (e.label) text(g, col, from.row + 5, e.label, { fg: 'muted' }, GAP);
    hline(g, col, from.row + 6, GAP - 1, dashed ? '┄' : glyphs.edge.h, style);
    put(g, col + GAP - 1, from.row + 6, glyphs.arrow_right, style);
  }
}

export function drawScreens(g, flow, lay, { selected, agentsByNode }) {
  drawRail(g, flow, lay);
  drawEdges(g, flow, lay);
  for (const n of flow.nodes) {
    const agents = agentsByNode.get(n.id) ?? [];
    const r = lay.rects.get(n.id);
    drawScreen(g, n, r, { selected: n.id === selected, agents });
    if (n.state === 'in_progress') {
      text(g, r.col, r.row + r.h, `▲ building now${agents.map((a) => ` · tab ${a.tab}`).join('')}`, { fg: 'accent' }, SCREEN_W + GAP - 1);
    }
  }
}
