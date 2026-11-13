// One node box (SPEC §3): border in the state style, glyph + title, detail, issue chips, agent tag.
import { glyphs, layout, stateOf } from './tokens.js';
import { strWidth } from './width.js';
import { box, fill, text, put } from './grid.js';
import { chips, chipsWidth, CHIP_GAP } from './issues.js';

const TITLE_FG = { done: 'done', in_progress: 'emphasis', pending: 'muted', blocked: 'blocked' };

export const detailOf = (node) => node.detail || (node.blocked_by ? `blocked by ${node.blocked_by}` : '');

export function nodeWidth(node) {
  if (node.w) return node.w;
  const s = stateOf(node.state);
  const content = Math.max(strWidth(`${s.glyph} ${node.title ?? ''}`), strWidth(detailOf(node)), chipsWidth(chips(node.issues)));
  return Math.min(layout.node_max_w, Math.max(layout.node_min_w, content + 4));
}

export const nodeHeight = (node) => 3 + (detailOf(node) ? 1 : 0) + (node.issues?.length ? 1 : 0);

export const agentTag = (agents) => agents.map((a) => `${glyphs.agent_tag} tab ${a.tab}`).join(' ');

// rect = {col, row, w, h}. Text is clipped to the inside of the box, so borders never move.
export function drawNode(g, node, rect, { selected = false, agents = [] } = {}) {
  const { col, row, w, h } = rect;
  const state = TITLE_FG[node.state] ? node.state : 'pending';
  const s = stateOf(state);
  const bg = selected ? 'selection' : undefined;
  if (selected) fill(g, col, row, w, h, { bg });
  box(g, col, row, w, h, state, { bg });
  const inner = w - 4;
  const bold = s.titleBold;
  let r = row + 1;
  text(g, col + 2, r++, `${s.glyph} ${node.title ?? ''}`, { fg: TITLE_FG[state], bold }, inner);
  const detail = detailOf(node);
  if (detail) text(g, col + 2, r++, detail, { fg: state === 'blocked' ? 'blocked' : 'muted' }, inner);
  if (node.issues?.length) drawChips(g, col + 2, r, chips(node.issues), inner);
  drawAgentTag(g, rect, agents);
  if (selected) put(g, col - 2, row + 1, glyphs.selected_marker, { fg: 'accent' });
}

// `◂ tab N` on the bottom border, right-aligned; dropped when the box is too narrow (SPEC §2).
export function drawAgentTag(g, { col, row, w, h }, agents) {
  const tag = agentTag(agents);
  const tagW = strWidth(tag);
  if (tag && w >= tagW + 6) text(g, col + w - 4 - tagW, row + h - 1, ` ${tag} `, { fg: 'accent' });
}

export { TITLE_FG };

export function drawChips(g, col, row, list, maxW) {
  let c = col;
  for (const chip of list) {
    const left = col + maxW - c;
    if (left <= 0) break;
    c += text(g, c, row, chip.text, { fg: chip.fg }, left) + CHIP_GAP;
  }
}
