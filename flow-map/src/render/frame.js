// Header (rows 0–5), notes and footer (SPEC §1), shared by every layout.
import { glyphs, stateOf } from './tokens.js';
import { strWidth } from './width.js';
import { text, hline } from './grid.js';

export const LABEL_W = 8;
const NEXT = ' · next:';

// Progress and markers of a flow, or of a summary `{id, done, total, blocked, unseen}`.
export function summary(f) {
  const nodes = f.nodes;
  if (!nodes) return { id: f.id, done: f.done ?? 0, total: f.total ?? 0, blocked: f.blocked ?? 0, unseen: !!f.unseen };
  let done = 0;
  let blocked = 0;
  for (const n of nodes) {
    if (n.state === 'done') done++;
    else if (n.state === 'blocked') blocked++;
  }
  return { id: f.id, done, total: nodes.length, blocked, unseen: !!f.unseen };
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

export const piecesWidth = (list) => list.reduce((n, [s]) => n + strWidth(s), 0);

// Right-aligned so the last cell lands on the right margin (col W-2).
export const right = (g, row, list) => pieces(g, g.cols - 1 - piecesWidth(list), row, list);

export function sectionRule(g, row, label) {
  const c = pieces(g, 1, row, [['──', { fg: 'track' }], [' '], [label, { fg: 'muted' }], [' ']]);
  hline(g, c, row, g.cols - 1 - c, glyphs.rule, { fg: 'track' });
}

const MUTED = { fg: 'muted' };

// One tab: ` [● ][■ ]id  n/m `. The active tab has the selection fill and no markers.
function tabPieces(s, active) {
  const style = active ? { fg: 'emphasis', bg: 'selection', bold: true } : MUTED;
  const pad = { bg: active ? 'selection' : undefined };
  const marks = [];
  if (!active && s.unseen) marks.push([stateOf('in_progress').glyph, { fg: 'accent' }], [' ', {}]);
  if (!active && s.blocked) marks.push([stateOf('blocked').glyph, { fg: 'blocked' }], [' ', {}]);
  return [[' ', pad], ...marks, [s.id, style], ['  ', pad], [`${s.done}/${s.total}`, style], [' ', pad]];
}

// Flow tabs on `row` (SPEC §9). With more flows than fit: `‹ N` and `N more ›` around the visible
// tabs, the active one always visible. `compact` (narrow popups): the active tab and `+N flows · tab`.
export function drawTabs(g, row, flow, flows = [flow], { hint, compact = false } = {}) {
  const list = (flows.some((f) => f.id === flow.id) ? flows : [flow, ...flows]).map(summary);
  const a = Math.max(0, list.findIndex((s) => s.id === flow.id));
  if (compact) {
    const c = pieces(g, 1, row, tabPieces(list[a], true));
    if (list.length > 1) pieces(g, c + 2, row, [[`+${list.length - 1} flows · tab`, MUTED]]);
    return;
  }
  let end = g.cols - 1;
  if (hint) {
    right(g, row, [[hint, MUTED]]);
    end = g.cols - 1 - strWidth(hint) - 2;
  }
  const tabs = list.map((s, i) => tabPieces(s, i === a));
  const w = tabs.map(piecesWidth);
  const n = list.length;
  const leftMark = (lo) => `‹ ${lo}`;
  const rightMark = (hi) => ` ${n - 1 - hi} more ›`;
  const fits = (lo, hi) => {
    let total = (hi - lo) * 2;
    for (let i = lo; i <= hi; i++) total += w[i];
    if (lo > 0) total += strWidth(leftMark(lo)) + 2;
    if (hi < n - 1) total += 2 + strWidth(rightMark(hi));
    return total <= end - 1;
  };
  let lo = 0;
  let hi = n - 1;
  if (!fits(lo, hi)) {
    lo = a;
    hi = a;
    while (hi + 1 < n && fits(lo, hi + 1)) hi++;
    while (lo > 0 && fits(lo - 1, hi)) lo--;
  }
  let c = 1;
  if (lo > 0) c = pieces(g, c, row, [[leftMark(lo), MUTED]], end) + 2;
  for (let i = lo; i <= hi; i++) c = pieces(g, c, row, tabs[i], end) + 2;
  if (hi < n - 1) pieces(g, c, row, [[rightMark(hi), MUTED]], end);
}

function nowRow(g, now) {
  pieces(g, 1, 4, [['now', MUTED]]);
  if (!now) return text(g, 1 + LABEL_W, 4, '—', MUTED);
  const at = now.indexOf(NEXT);
  const main = `${stateOf('in_progress').glyph} ${at < 0 ? now : now.slice(0, at)}`;
  const rest = at < 0 ? '' : now.slice(at);
  // The muted `· next: …` part is dropped whole when it does not fit; the main part is cut with `…`.
  const room = g.cols - 1 - (1 + LABEL_W);
  const list = [[main, { fg: 'emphasis', bold: true }]];
  if (rest && strWidth(main) + strWidth(rest) <= room) list.push([rest, MUTED]);
  pieces(g, 1 + LABEL_W, 4, list);
}

function agentsRow(g, flow, sep) {
  pieces(g, 1, 5, [['agents', MUTED]]);
  const agents = flow.agents ?? [];
  if (!agents.length) return text(g, 1 + LABEL_W, 5, 'none attached', MUTED);
  const titles = new Map((flow.nodes ?? []).map((n) => [n.id, n.title]));
  const list = agents.flatMap((a, i) => [
    ...(i ? [[sep, {}]] : []),
    [glyphs.agent_tag, { fg: 'accent' }],
    [` tab ${a.tab} · ${a.name ?? titles.get(a.node) ?? a.node ?? ''}`, { fg: 'text' }],
  ]);
  pieces(g, 1 + LABEL_W, 5, list);
}

// `compact` (narrow popups, SPEC §10): short tab row, no `nodes done`, agents 3 spaces apart.
// `note` writes a muted `layout` row on row 6.
export function drawHeader(g, flow, { flows = [flow], hint = 'tab next flow · / all flows', compact = false, note } = {}) {
  const W = g.cols;
  const { done, total } = summary(flow);
  drawTabs(g, 0, flow, flows.length ? flows : [flow], { hint, compact });
  hline(g, 0, 1, W, glyphs.rule, { fg: 'track' });
  const unit = flow.layout === 'screens' ? 'screens' : 'nodes';
  const count = [[`${done}/${total}`, { fg: 'emphasis', bold: true }], ...(compact ? [] : [[` ${unit} done`, MUTED]])];
  const c = pieces(g, 1, 2, [[flow.id, { fg: 'accent' }], ['  ']], W - 1);
  text(g, c, 2, flow.feature ?? '', { fg: 'emphasis', bold: true }, W - 2 - piecesWidth(count) - c - 1);
  right(g, 2, count);
  const barW = W - 2;
  const filled = total ? Math.round((done / total) * barW) : 0;
  hline(g, 1, 3, filled, glyphs.bar_fill, { fg: 'accent' });
  hline(g, 1 + filled, 3, barW - filled, glyphs.bar_fill, { fg: 'track' });
  nowRow(g, flow.now);
  agentsRow(g, flow, compact ? '   ' : '    ');
  if (note) {
    pieces(g, 1, 6, [['layout', MUTED]]);
    text(g, 1 + LABEL_W, 6, note, MUTED, W - 2 - LABEL_W);
  }
}

// `■ Blocked:` style markers in a note take their state's color.
const MARK = /([✓●○■]) (\S+:)/g;
const GLYPH_FG = { '✓': 'done', '●': 'emphasis', '○': 'muted', '■': 'blocked' };

export function noteLine(g, row, note, col = 1) {
  const list = [];
  let last = 0;
  for (const m of note.matchAll(MARK)) {
    list.push([note.slice(last, m.index), { fg: 'text' }], [m[0], { fg: GLYPH_FG[m[1]] }]);
    last = m.index + m[0].length;
  }
  list.push([note.slice(last), { fg: 'text' }]);
  pieces(g, col, row, list.filter(([s]) => s));
}

export const MAX_NOTES = 5;

// Rows the notes block may use: the latest its rule can sit (so its lines end on H-4) and the
// preferred rule row (H-8, SPEC §1). Without notes there is no block and the map ends on H-4.
export function notesRows(H, notes = []) {
  const n = Math.min(notes.length, MAX_NOTES);
  if (!n) return { n, latest: H - 3, preferred: H - 3 };
  return { n, latest: H - 4 - n, preferred: Math.min(H - 8, H - 4 - n) };
}

// Notes under a `── notes` rule on `top`.
export function drawNotes(g, notes = [], top = g.rows - 8) {
  if (!notes.length) return top;
  sectionRule(g, top, 'notes');
  notes.slice(0, Math.min(MAX_NOTES, g.rows - 4 - top)).forEach((n, i) => noteLine(g, top + 1 + i, n));
  return top;
}

const LEGEND_STATES = [['done', 'done'], ['in_progress', 'in progress'], ['pending', 'pending'], ['blocked', 'blocked']];
export const STATE_LABEL = Object.fromEntries(LEGEND_STATES);
export const STATE_FG = { done: 'done', in_progress: 'emphasis', pending: 'muted', blocked: 'blocked' };

export const TREE_KEYS = [['↑↓←→', 'move'], ['enter', 'node detail'], ['g', 'open on GitHub'], ['tab', 'next flow'], ['/', 'flows'], ['q', 'close']];
export const SCREEN_KEYS = [['←→', 'move'], ['enter', 'screen detail'], ['g', 'open on GitHub'], ['tab', 'next flow'], ['/', 'flows'], ['q', 'close']];
export const LAYER_KEYS = [['↑↓←→', 'move along dependencies'], ['enter', 'node detail'], ['g', 'open on GitHub'], ['tab', 'next flow'], ['/', 'flows'], ['q', 'close']];
export const VERTICAL_KEYS = [['↑↓', 'move'], ['enter', 'detail'], ['g', 'GitHub'], ['tab', 'flow'], ['/', 'flows'], ['q', 'close']];
export const EMPTY_KEYS = [['tab', 'next flow'], ['/', 'flows'], ['q', 'close']];
export const LIST_KEYS = [['↑↓', 'choose'], ['enter', 'open flow'], ['n', 'next needing attention'], ['esc', 'cancel list'], ['q', 'close']];

export const keyPieces = (keys, sep = '   ') => keys.flatMap(([k, d], i) => [...(i ? [[sep]] : []), [k, { fg: 'emphasis', bold: true }], [` ${d}`, MUTED]]);

// `compact` (narrow popups): items 2 spaces apart, `◂ agent`, no issue chips.
export function drawFooter(g, { dashed = false, keys = TREE_KEYS, compact = false } = {}) {
  const H = g.rows;
  const sep = compact ? '  ' : '   ';
  const gap = compact ? '  ' : '     ';
  hline(g, 0, H - 3, g.cols, glyphs.rule, { fg: 'track' });
  const legend = [];
  LEGEND_STATES.forEach(([s, label], i) => {
    const style = { fg: STATE_FG[s], bold: s === 'in_progress' };
    legend.push(...(i ? [[sep]] : []), [`${stateOf(s).glyph} ${label}`, style]);
  });
  if (dashed) legend.push([gap], [`${glyphs.edge.dashed_v} not wired yet`, MUTED]);
  legend.push([gap], [glyphs.agent_tag, { fg: 'accent' }], [compact ? ' agent' : ' agent here', MUTED]);
  if (!compact) legend.push([gap], ['#123 merged', { fg: 'done' }], ['  '], ['#123 open', { fg: 'accent' }]);
  pieces(g, 1, H - 2, legend);
  pieces(g, 1, H - 1, keyPieces(keys, sep));
}
