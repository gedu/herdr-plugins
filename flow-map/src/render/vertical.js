// Narrow popups (SPEC §10): one row per node with tree glyphs, edge labels as muted rows under it.
import { glyphs, stateOf } from './tokens.js';
import { strWidth } from './width.js';
import { fill, put, text } from './grid.js';
import { chips, CHIP_GAP } from './issues.js';
import { graph } from './tree.js';
import { pieces, piecesWidth, STATE_FG } from './frame.js';

export const VERTICAL_TOP = 8;
const FIRST_COL = 3;
const T = glyphs.tree;
const short = (title) => String(title ?? '').split(' · ')[0];

function flat(flow) {
  const ids = flow.nodes.map((n) => n.id);
  return { ids, kids: new Map(ids.map((id) => [id, []])), parent: new Map(), mergeParents: new Map(), flat: true };
}

// Rows: {type: 'node', id, col, pre, br} or {type: 'text', col, pre, br, text}. `pre` lists the
// cols of `│` pipes still open, `br` is [col, '├─' | '└─'] for the branch into this row.
export function layoutVertical(flow, cols) {
  const g = flow.layout === 'screens' ? flat(flow) : graph(flow);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const lastParent = new Map();
  for (const [m, es] of g.mergeParents) if (!g.parent.has(m)) lastParent.set(m, es[es.length - 1].from);
  const after = new Map();
  for (const [m, p] of lastParent) {
    if (!after.has(p)) after.set(p, []);
    after.get(p).push(m);
  }
  const listed = new Set();
  const withMerges = (list) => list.flatMap((it) => [it, ...(after.get(it.id) ?? []).map((m) => ({ id: m, merge: true }))]);
  const items = (id) => withMerges(g.kids.get(id).map((e) => ({ id: e.to, edge: e })));
  const maxCol = Math.max(FIRST_COL, Math.floor(cols / 2));
  const rows = [];

  const visit = (item, c, pre, br, more) => {
    if (listed.has(item.id)) return;
    listed.add(item.id);
    const { id, edge: e } = item;
    const kidItems = items(id);
    const own = more ? [c - 3] : [];
    const under = [...pre, ...own];
    const label = e?.label && e.label_at !== 'trunk' ? e.label : null;
    if (label && kidItems.length) {
      rows.push({ type: 'text', col: c, pre, br, text: label });
      rows.push({ type: 'node', id, col: c, pre: under, br: null });
    } else rows.push({ type: 'node', id, col: c, pre: br ? pre : under, br });
    if (label && !kidItems.length) rows.push({ type: 'text', col: c + 4, pre: under, text: label });
    if (item.merge) {
      const es = g.mergeParents.get(id);
      const ml = es.find((x) => x.label)?.label;
      const from = es.map((x) => short(byId.get(x.from)?.title)).join(' + ');
      rows.push({ type: 'text', col: c + 4, pre: under, text: ml ? `${ml} (${from})` : `from ${from}` });
    }
    // Screen flows are a flat list: each edge label goes under its source screen.
    if (g.flat) for (const x of flow.edges ?? []) if (x.from === id && x.label) rows.push({ type: 'text', col: c + 4, pre: under, text: x.label });
    for (const k of g.kids.get(id)) {
      if (k.label && k.label_at === 'trunk') rows.push({ type: 'text', col: c + 4, pre: [...under, ...(kidItems.length ? [c] : [])], text: k.label });
    }
    // A single unlabelled child continues in the same column, so long chains do not drift right.
    if (kidItems.length === 1 && !kidItems[0].merge && !kidItems[0].edge?.label) return visit(kidItems[0], c, pre, null, more);
    const kc = Math.min(c + 3, maxCol);
    kidItems.forEach((k, i) => {
      const last = i === kidItems.length - 1;
      if (items(k.id).length) rows.push({ type: 'text', col: c, pre: [...under, c], text: '' });
      visit(k, kc, under, [c, last ? T.last : T.branch], !last);
    });
  };

  const roots = withMerges(g.ids.filter((id) => !g.parent.has(id) && !lastParent.has(id)).map((id) => ({ id })));
  for (const r of roots) visit(r, FIRST_COL, [], null, false);
  for (const id of g.ids) if (!listed.has(id)) visit({ id }, FIRST_COL, [], null, false);

  const rowOf = new Map();
  rows.forEach((r, i) => { if (r.type === 'node') rowOf.set(r.id, i); });
  return { rows, rowOf, parent: g.parent, mergeParents: g.mergeParents, byId };
}

function prefix(g, row, r) {
  for (const c of r.pre) put(g, c, row, glyphs.edge.v, { fg: 'edge' });
  if (r.br) text(g, r.br[0], row, r.br[1], { fg: 'edge' });
}

// Nodes on the path from the root to the selection are titled in bold.
export function selectionPath(lay, selected) {
  const path = new Set();
  if (!selected) return path;
  path.add(selected);
  const viaMerge = lay.mergeParents.get(selected)?.at(-1)?.from;
  let id = lay.parent.get(selected)?.from ?? lay.parent.get(viaMerge)?.from;
  for (let i = 0; id && i < 10000 && !path.has(id); i++) {
    path.add(id);
    id = lay.parent.get(id)?.from;
  }
  return path;
}

export function drawVerticalRow(g, row, r, lay, { selected, path, agentsByNode }) {
  const W = g.cols;
  if (r.type === 'text') {
    prefix(g, row, r);
    if (r.text) text(g, r.col, row, r.text, { fg: 'muted' }, W - 1 - r.col);
    return;
  }
  const node = lay.byId.get(r.id);
  const state = STATE_FG[node.state] ? node.state : 'pending';
  if (r.id === selected) {
    fill(g, 1, row, W - 2, 1, { bg: 'selection' });
    put(g, 1, row, glyphs.selected_marker, { fg: 'accent' });
  }
  prefix(g, row, r);
  const side = [];
  if (state === 'blocked') side.push(['blocked', { fg: 'blocked' }], ['  ']);
  if (node.issues?.length) chips(node.issues).forEach((c, i) => side.push(...(i ? [[' '.repeat(CHIP_GAP)]] : []), [c.text, { fg: c.fg }]));
  else if (node.detail) side.push([node.detail, { fg: 'muted' }]);
  if (side.at(-1)?.[0] === '  ') side.pop();
  const sideW = Math.min(piecesWidth(side), Math.floor(W / 2));
  const sideCol = W - 1 - sideW;
  pieces(g, sideCol, row, side);
  const s = stateOf(state);
  put(g, r.col, row, s.glyph, { fg: STATE_FG[state], bold: state === 'in_progress' });
  const onPath = path.has(r.id);
  const titleFg = state === 'blocked' ? 'blocked' : onPath ? 'emphasis' : state === 'pending' ? 'muted' : 'text';
  const agents = agentsByNode.get(r.id) ?? [];
  const tag = agents.flatMap((a, i) => [[i ? '  ' : '   '], [glyphs.agent_tag, { fg: 'accent' }], [` tab ${a.tab}`, { fg: 'text' }]]);
  const room = sideCol - 2 - (r.col + 2);
  const titleW = Math.max(1, Math.min(strWidth(node.title ?? ''), room - piecesWidth(tag)));
  const c = r.col + 2 + text(g, r.col + 2, row, node.title ?? '', { fg: titleFg, bold: onPath && state !== 'blocked' }, titleW);
  pieces(g, c, row, tag, sideCol - 1);
}
