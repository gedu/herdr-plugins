// Header (rows 0–5), notes and footer (SPEC §1), shared by every layout.
import { glyphs, stateOf } from './tokens.js';
import { strWidth } from './width.js';
import { text, hline } from './grid.js';

const LABEL_W = 8;
const NEXT = ' · next:';

export function summary(f) {
  if (!f.nodes) return { id: f.id, done: f.done ?? 0, total: f.total ?? 0 };
  return { id: f.id, done: f.nodes.filter((n) => n.state === 'done').length, total: f.nodes.length };
}

// Writes [text, style] pieces from `col`, never past `end` (exclusive). Returns the next col.
export function pieces(g, col, row, list, end = g.cols - 1) {
  let c = col;
  for (const [s, style] of list) {
    if (c >= end) break;
    c += text(g, c, row, s, style, end - c);
  }
  return c;
}

const piecesWidth = (list) => list.reduce((n, [s]) => n + strWidth(s), 0);

// Right-aligned so the last cell lands on the right margin (col W-2).
const right = (g, row, list) => pieces(g, g.cols - 1 - piecesWidth(list), row, list);

export function sectionRule(g, row, label) {
  const c = pieces(g, 1, row, [['──', { fg: 'track' }], [' '], [label, { fg: 'muted' }], [' ']]);
  hline(g, c, row, g.cols - 1 - c, glyphs.rule, { fg: 'track' });
}

function tabs(g, flow, flows, hint) {
  const hintList = [[hint, { fg: 'muted' }]];
  const end = g.cols - 1 - strWidth(hint) - 2;
  let c = 1;
  for (const f of flows.map(summary)) {
    const active = f.id === flow.id;
    const tab = [[' ', {}], [f.id, {}], ['  ', {}], [`${f.done}/${f.total}`, {}], [' ', {}]];
    if (c + piecesWidth(tab) > end) break;
    const style = active ? { fg: 'emphasis', bg: 'selection', bold: true } : { fg: 'muted' };
    c = pieces(g, c, 0, tab.map(([s]) => [s, s.trim() ? style : { bg: style.bg }]), end) + 2;
  }
  right(g, 0, hintList);
}

function nowRow(g, now) {
  pieces(g, 1, 4, [['now', { fg: 'muted' }]]);
  if (!now) return text(g, 1 + LABEL_W, 4, '—', { fg: 'muted' });
  const at = now.indexOf(NEXT);
  const main = at < 0 ? now : now.slice(0, at);
  const rest = at < 0 ? '' : now.slice(at);
  pieces(g, 1 + LABEL_W, 4, [[`${stateOf('in_progress').glyph} ${main}`, { fg: 'emphasis', bold: true }], [rest, { fg: 'muted' }]]);
}

function agentsRow(g, flow) {
  pieces(g, 1, 5, [['agents', { fg: 'muted' }]]);
  const agents = flow.agents ?? [];
  if (!agents.length) return text(g, 1 + LABEL_W, 5, 'none attached', { fg: 'muted' });
  const titles = new Map((flow.nodes ?? []).map((n) => [n.id, n.title]));
  const list = agents.flatMap((a, i) => [
    ...(i ? [['    ', {}]] : []),
    [glyphs.agent_tag, { fg: 'accent' }],
    [` tab ${a.tab} · ${a.name ?? titles.get(a.node) ?? a.node ?? ''}`, { fg: 'text' }],
  ]);
  pieces(g, 1 + LABEL_W, 5, list);
}

export function drawHeader(g, flow, { flows = [flow], hint = 'tab next flow · / all flows' } = {}) {
  const W = g.cols;
  const { done, total } = summary(flow);
  tabs(g, flow, flows.length ? flows : [flow], hint);
  hline(g, 0, 1, W, glyphs.rule, { fg: 'track' });
  const unit = flow.layout === 'screens' ? 'screens' : 'nodes';
  const count = [[`${done}/${total}`, { fg: 'emphasis', bold: true }], [` ${unit} done`, { fg: 'muted' }]];
  const c = pieces(g, 1, 2, [[flow.id, { fg: 'accent' }], ['  ']], W - 1);
  text(g, c, 2, flow.feature ?? '', { fg: 'emphasis', bold: true }, W - 2 - piecesWidth(count) - c - 1);
  right(g, 2, count);
  const barW = W - 2;
  const filled = total ? Math.round((done / total) * barW) : 0;
  hline(g, 1, 3, filled, glyphs.bar_fill, { fg: 'accent' });
  hline(g, 1 + filled, 3, barW - filled, glyphs.bar_fill, { fg: 'track' });
  nowRow(g, flow.now);
  agentsRow(g, flow);
}

// `■ Blocked:` style markers in a note take their state's color.
const MARK = /([✓●○■]) (\S+:)/g;
const GLYPH_FG = { '✓': 'done', '●': 'emphasis', '○': 'muted', '■': 'blocked' };

function noteLine(g, row, note) {
  const list = [];
  let last = 0;
  for (const m of note.matchAll(MARK)) {
    list.push([note.slice(last, m.index), { fg: 'text' }], [m[0], { fg: GLYPH_FG[m[1]] }]);
    last = m.index + m[0].length;
  }
  list.push([note.slice(last), { fg: 'text' }]);
  pieces(g, 1, row, list.filter(([s]) => s));
}

// Notes take rows H-7…H-4 under a rule on H-8. Returns the rule row (the map ends above it).
export function drawNotes(g, notes = []) {
  const H = g.rows;
  const top = H - 8;
  sectionRule(g, top, 'notes');
  notes.slice(0, 4).forEach((n, i) => noteLine(g, top + 1 + i, n));
  return top;
}

const LEGEND_STATES = [['done', 'done'], ['in_progress', 'in progress'], ['pending', 'pending'], ['blocked', 'blocked']];
const STATE_FG = { done: 'done', in_progress: 'emphasis', pending: 'muted', blocked: 'blocked' };

export const TREE_KEYS = [['↑↓←→', 'move'], ['enter', 'node detail'], ['g', 'open on GitHub'], ['tab', 'next flow'], ['/', 'flows'], ['q', 'close']];

export function drawFooter(g, { dashed = false, keys = TREE_KEYS } = {}) {
  const H = g.rows;
  hline(g, 0, H - 3, g.cols, glyphs.rule, { fg: 'track' });
  const legend = [];
  LEGEND_STATES.forEach(([s, label], i) => {
    const style = { fg: STATE_FG[s], bold: s === 'in_progress' };
    legend.push(...(i ? [['   ']] : []), [`${stateOf(s).glyph} ${label}`, style]);
  });
  if (dashed) legend.push(['     '], [`${glyphs.edge.dashed_v} not wired yet`, { fg: 'muted' }]);
  legend.push(['     '], [glyphs.agent_tag, { fg: 'accent' }], [' agent here', { fg: 'muted' }]);
  legend.push(['     '], ['#123 merged', { fg: 'done' }], ['  '], ['#123 open', { fg: 'accent' }]);
  pieces(g, 1, H - 2, legend);
  pieces(g, 1, H - 1, keys.flatMap(([k, d], i) => [...(i ? [['   ']] : []), [k, { fg: 'emphasis', bold: true }], [` ${d}`, { fg: 'muted' }]]));
}
