// A grid of terminal cells. A cell is {ch, fg, bg, bold}; fg/bg are token names (null = default).
// A wide character fills its cell and the next one, whose ch is '' (a continuation cell).
import { cells as split, fit } from './width.js';
import { stateOf } from './tokens.js';

export function createGrid(cols, rows) {
  const cells = new Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = { ch: ' ', fg: null, bg: null, bold: false };
  return { cols, rows, cells };
}

const at = (g, c, r) => (c >= 0 && r >= 0 && c < g.cols && r < g.rows ? g.cells[r * g.cols + c] : null);

const blank = (cell) => { if (cell) cell.ch = ' '; };

function setCell(g, c, r, ch, style, w = 1) {
  const cell = at(g, c, r);
  if (!cell) return;
  if (cell.ch === '') blank(at(g, c - 1, r));
  const next = at(g, c + 1, r);
  if (next?.ch === '' && w === 1) blank(next);
  cell.ch = ch;
  if (style.fg !== undefined) cell.fg = style.fg;
  if (style.bg !== undefined) cell.bg = style.bg;
  cell.bold = !!style.bold;
  if (w === 2 && next) {
    if (at(g, c + 2, r)?.ch === '') blank(at(g, c + 2, r));
    next.ch = '';
    next.fg = cell.fg;
    next.bg = cell.bg;
    next.bold = cell.bold;
  }
}

// Writes text cut with `…` to fit both maxW and the grid edge. Returns the cells used.
export function text(g, col, row, s, style = {}, maxW = Infinity) {
  if (row < 0 || row >= g.rows || col >= g.cols) return 0;
  const avail = Math.min(maxW, g.cols - Math.max(col, 0));
  let c = col;
  for (const { ch, w } of split(fit(s, avail))) {
    if (c >= 0) setCell(g, c, row, ch, style, w);
    c += w;
  }
  return c - col;
}

export function put(g, col, row, ch, style = {}) {
  setCell(g, col, row, ch, style, 1);
}

export function fill(g, col, row, w, h, style = {}) {
  for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) setCell(g, c, r, ' ', style, 1);
}

export function hline(g, col, row, w, ch, style = {}) {
  for (let c = col; c < col + w; c++) setCell(g, c, row, ch, style, 1);
}

export function vline(g, col, row, h, ch, style = {}) {
  for (let r = row; r < row + h; r++) setCell(g, col, r, ch, style, 1);
}

// Border of a box in a state style (done, in_progress, pending, blocked). Interior is untouched.
export function box(g, col, row, w, h, state, { bg, fg } = {}) {
  const s = stateOf(state);
  const style = { fg: fg ?? s.fg, bg };
  const right = col + w - 1;
  const bottom = row + h - 1;
  put(g, col, row, s.tl, style);
  hline(g, col + 1, row, w - 2, s.h, style);
  put(g, right, row, s.tr, style);
  vline(g, col, row + 1, h - 2, s.v, style);
  vline(g, right, row + 1, h - 2, s.v, style);
  put(g, col, bottom, s.bl, style);
  hline(g, col + 1, bottom, w - 2, s.h, style);
  put(g, right, bottom, s.br, style);
}

export function rowText(g, row) {
  let s = '';
  for (let c = 0; c < g.cols; c++) s += g.cells[row * g.cols + c].ch;
  return s;
}

// The cell at (col, row), or null outside the grid.
export const cellAt = at;
