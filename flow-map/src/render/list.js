// Flow list (SPEC §9, `/`): a rounded panel with one row per flow.
import { glyphs, stateOf } from './tokens.js';
import { fill, hline, put, text, vline } from './grid.js';
import { pieces, keyPieces, summary } from './frame.js';

const EDGE = { fg: 'edge' };
const MUTED = { fg: 'muted' };
const TOP = 3;
const BAR = 20;
export const LIST_HINT_KEYS = [['↑↓', 'choose'], ['enter', 'open'], ['n', 'next flow that needs attention'], ['esc', 'cancel']];

// Column cols from the panel's left border (col 1); the feature column takes what is left.
function columns(W) {
  const feature = Math.max(8, W - 102);
  const id = 5;
  const feat = id + 20;
  const done = feat + feature;
  const progress = done + 8;
  const agents = progress + BAR + 2;
  const state = agents + 22;
  return { id, feat, done, progress, agents, state, featureW: feature };
}

function stateCell(s, nodes) {
  if (s.blocked) return [`${stateOf('blocked').glyph} ${s.blocked} blocked`, { fg: 'blocked' }];
  if (!s.total) return [`${stateOf('pending').glyph} empty`, MUTED];
  if (s.done === s.total) return [`${stateOf('done').glyph} done`, { fg: 'done' }];
  if (nodes?.some((n) => n.state === 'in_progress')) return [`${stateOf('in_progress').glyph} in progress`, { fg: 'emphasis', bold: true }];
  return [`${stateOf('pending').glyph} pending`, MUTED];
}

export function drawList(g, flows, { index = 0 } = {}) {
  const W = g.cols;
  const right = W - 2;
  const col = columns(W);
  const maxRows = Math.max(1, g.rows - 3 - 5 - TOP - 3);
  const sel = Math.min(Math.max(0, index), flows.length - 1);
  const first = Math.max(0, Math.min(sel - maxRows + 1, flows.length - maxRows));
  const shown = flows.slice(Math.max(0, first), Math.max(0, first) + maxRows);
  const bottom = TOP + 2 + shown.length;

  put(g, 1, TOP, glyphs.edge.tl, EDGE);
  const c = pieces(g, 2, TOP, [[' '], ['flows', { fg: 'emphasis', bold: true }], [' ']]);
  hline(g, c, TOP, right - c, glyphs.edge.h, EDGE);
  put(g, right, TOP, glyphs.edge.tr, EDGE);
  vline(g, 1, TOP + 1, bottom - TOP - 1, glyphs.edge.v, EDGE);
  vline(g, right, TOP + 1, bottom - TOP - 1, glyphs.edge.v, EDGE);
  put(g, 1, bottom, glyphs.edge.bl, EDGE);
  hline(g, 2, bottom, right - 2, glyphs.edge.h, EDGE);
  put(g, right, bottom, glyphs.edge.br, EDGE);

  const cell = (row, at, s, style, w) => { if (at < right - 1) text(g, at, row, s, style, Math.min(w, right - 1 - at)); };
  const head = TOP + 1;
  for (const [k, label] of [['id', 'flow'], ['feat', 'feature'], ['done', 'done'], ['progress', 'progress'], ['agents', 'agents'], ['state', 'state']]) cell(head, col[k], label, MUTED, Infinity);

  shown.forEach((f, i) => {
    const row = head + 1 + i;
    const s = summary(f);
    const on = Math.max(0, first) + i === sel;
    if (on) {
      fill(g, 1, row, right, 1, { bg: 'selection' });
      put(g, 1, row, glyphs.edge.v, EDGE);
      put(g, right, row, glyphs.edge.v, EDGE);
      put(g, 3, row, glyphs.selected_marker, { fg: 'accent' });
    }
    cell(row, col.id, f.id, on ? { fg: 'emphasis', bold: true } : { fg: 'text' }, 18);
    cell(row, col.feat, f.feature ?? '', { fg: 'text' }, col.featureW - 2);
    cell(row, col.done, `${s.done}/${s.total}`, s.total ? { fg: 'text' } : MUTED, 7);
    const filled = s.total ? Math.round((s.done / s.total) * BAR) : 0;
    if (col.progress < right - 1) {
      hline(g, col.progress, row, Math.min(filled, right - 1 - col.progress), glyphs.bar_fill, { fg: 'accent' });
      hline(g, col.progress + filled, row, Math.max(0, Math.min(BAR - filled, right - 1 - col.progress - filled)), glyphs.bar_fill, { fg: 'track' });
    }
    const tabs = [...new Set((f.agents ?? []).map((a) => a.tab))];
    const agents = tabs.length
      ? tabs.flatMap((t, k) => [...(k ? [['  ']] : []), [glyphs.agent_tag, { fg: 'accent' }], [` tab ${t}`, { fg: 'text' }]])
      : [['no agent', MUTED]];
    if (col.agents < right - 1) pieces(g, col.agents, row, agents, Math.min(col.state - 2, right - 1));
    const [st, style] = stateCell(s, f.nodes);
    cell(row, col.state, st, style, Infinity);
  });
  pieces(g, 1, bottom + 4, keyPieces(LIST_HINT_KEYS));
}
