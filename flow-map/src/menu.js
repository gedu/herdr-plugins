// The state picker drawn over a node: done, in progress, pending, blocked, add note….
// Pure: the menu is a plain object; keys and clicks return {menu, action}, where action is
// null, {type:'close'}, {type:'state', state, reason?} or {type:'note', text}.
import { box, fill, text, put } from './render/grid.js';
import { glyphs, stateOf } from './render/tokens.js';
import { cells, strWidth } from './render/width.js';

export const ITEMS = [
  { key: 'd', state: 'done', label: 'done' },
  { key: 'i', state: 'in_progress', label: 'in progress' },
  { key: 'p', state: 'pending', label: 'pending' },
  { key: 'b', state: 'blocked', label: 'blocked' },
  { key: 'n', note: true, label: 'add note…' },
];
const STATE_FG = { done: 'done', in_progress: 'emphasis', pending: 'muted', blocked: 'blocked' };
const MAX_INPUT = 500;
const PICK_W = 28;
const INPUT_W = 52;

// anchor: the node rect on screen {col, row, w, h}, so the menu opens next to it.
export function openMenu(node, anchor) {
  const index = Math.max(0, ITEMS.findIndex((it) => it.state === node.state));
  return { node: node.id, title: node.title ?? node.id, current: node.state, reason: node.blocked_by ?? '', anchor, mode: 'pick', index, input: '' };
}

// Where the menu sits: right of the node, else left of it, else below; always inside the popup.
export function menuRect(menu, { cols, rows }) {
  const picking = menu.mode === 'pick';
  const w = Math.min(cols, picking ? Math.max(PICK_W, Math.min(40, strWidth(menu.title) + 4)) : INPUT_W);
  const h = Math.min(rows, picking ? 3 + ITEMS.length : 5);
  const a = menu.anchor ?? { col: Math.floor(cols / 2), row: Math.floor(rows / 2), w: 0, h: 0 };
  let col = a.col + a.w + 1;
  let row = a.row;
  if (col + w > cols) col = a.col - w - 1;
  if (col < 0) {
    col = a.col;
    row = a.row + a.h;
  }
  col = Math.max(0, Math.min(cols - w, col));
  row = Math.max(0, Math.min(rows - h, row));
  return { col, row, w, h };
}

export const itemRow = (rect, i) => rect.row + 2 + i;

const close = (menu) => ({ menu, action: { type: 'close' } });

function choose(menu, i) {
  const item = ITEMS[i];
  if (item.note) return { menu: { ...menu, index: i, mode: 'note', input: '' }, action: null };
  if (item.state === 'blocked') return { menu: { ...menu, index: i, mode: 'reason', input: menu.reason }, action: null };
  return { menu, action: { type: 'state', state: item.state } };
}

function editKey(menu, ev) {
  if (ev.name === 'escape') return close(menu);
  if (ev.name === 'backspace') return { menu: { ...menu, input: [...menu.input].slice(0, -1).join('') }, action: null };
  if (ev.name === 'char') {
    if (menu.input.length + ev.ch.length > MAX_INPUT) return { menu, action: null };
    return { menu: { ...menu, input: menu.input + ev.ch }, action: null };
  }
  if (ev.name === 'enter') {
    const value = menu.input.trim();
    if (menu.mode === 'reason') return { menu, action: { type: 'state', state: 'blocked', reason: value } };
    return { menu, action: value ? { type: 'note', text: value } : { type: 'close' } };
  }
  return { menu, action: null };
}

export function menuKey(menu, ev) {
  if (ev.type !== 'key') return { menu, action: null };
  if (menu.mode !== 'pick') return editKey(menu, ev);
  const n = ITEMS.length;
  if (ev.name === 'escape') return close(menu);
  if (ev.name === 'up') return { menu: { ...menu, index: (menu.index + n - 1) % n }, action: null };
  if (ev.name === 'down') return { menu: { ...menu, index: (menu.index + 1) % n }, action: null };
  if (ev.name === 'enter') return choose(menu, menu.index);
  if (ev.name === 'char') {
    const i = ITEMS.findIndex((it) => it.key === ev.ch.toLowerCase());
    if (i >= 0) return choose(menu, i);
  }
  return { menu, action: null };
}

// A click (press) at screen (col, row): an item picks it, outside the menu closes it.
export function menuClick(menu, size, col, row) {
  const r = menuRect(menu, size);
  const inside = col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h;
  if (!inside) return close(menu);
  if (menu.mode !== 'pick') return { menu, action: null };
  const i = row - itemRow(r, 0);
  if (i >= 0 && i < ITEMS.length && col > r.col && col < r.col + r.w - 1) return choose(menu, i);
  return { menu, action: null };
}

// The visible part of an input that is wider than its field: `…` and the tail.
function fieldText(value, w) {
  if (strWidth(value) <= w - 1) return value;
  const list = cells(value);
  let out = '';
  let used = 0;
  for (let i = list.length - 1; i >= 0 && used + list[i].w <= w - 2; i--) {
    out = list[i].ch + out;
    used += list[i].w;
  }
  return `…${out}`;
}

export function drawMenu(g, menu) {
  const r = menuRect(menu, g);
  if (r.w < 6 || r.h < 3) return r;
  const inner = r.w - 4;
  fill(g, r.col, r.row, r.w, r.h, { fg: 'text', bg: 'background' });
  box(g, r.col, r.row, r.w, r.h, 'done', { fg: 'accent' });
  if (menu.mode === 'pick') {
    text(g, r.col + 2, r.row + 1, menu.title, { fg: 'emphasis', bold: true }, inner);
    ITEMS.forEach((it, i) => {
      const row = itemRow(r, i);
      if (row >= r.row + r.h - 1) return;
      const on = i === menu.index;
      if (on) {
        fill(g, r.col + 1, row, r.w - 2, 1, { bg: 'selection' });
        put(g, r.col + 2, row, glyphs.selected_marker, { fg: 'accent' });
      }
      const label = it.note ? `+ ${it.label}` : `${stateOf(it.state).glyph} ${it.label}`;
      const style = it.note ? { fg: 'text' } : { fg: STATE_FG[it.state], bold: it.state === 'in_progress' || on };
      const used = text(g, r.col + 4, row, label, style, inner - 4);
      if (it.state && it.state === menu.current) text(g, r.col + 4 + used, row, ' · now', { fg: 'muted' }, inner - 4 - used - 2);
      put(g, r.col + r.w - 3, row, it.key, { fg: 'muted' });
    });
    return r;
  }
  const title = menu.mode === 'reason' ? `blocked: why? (${menu.title})` : `note on ${menu.title}`;
  text(g, r.col + 2, r.row + 1, title, { fg: menu.mode === 'reason' ? 'blocked' : 'emphasis', bold: true }, inner);
  fill(g, r.col + 2, r.row + 2, inner, 1, { bg: 'selection' });
  const shown = fieldText(menu.input, inner);
  const used = text(g, r.col + 2, r.row + 2, shown, { fg: 'text' }, inner);
  if (used < inner) put(g, r.col + 2 + used, r.row + 2, ' ', { bg: 'accent' });
  text(g, r.col + 2, r.row + 3, 'enter save · esc cancel', { fg: 'muted' }, inner);
  return r;
}
