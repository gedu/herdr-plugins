// Turns a cell grid into ANSI: a full frame, or a diff that rewrites only the changed cells.
import { colors, glyphs } from './tokens.js';

const ESC = '\x1b[';

export const colorMode = (env = process.env) => (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? '') ? 'truecolor' : '256');

const HEAVY = { '┏': '╭', '┓': '╮', '┗': '╰', '┛': '╯', '━': '─', '┃': '│', '┣': '├', '┫': '┤', '┳': '┬', '┻': '┴', '╋': '┼' };
const FALLBACK = Object.fromEntries(Object.entries(glyphs.fallback).filter(([k]) => [...k].length === 1));

// Glyph substitution for fonts that lack some glyphs: `ascii` is true (all) or a Set of glyphs ('heavy_box' included).
function substitute(ascii) {
  if (!ascii) return null;
  const all = ascii === true;
  const map = new Map();
  for (const [from, to] of Object.entries(FALLBACK)) if (all || ascii.has(from)) map.set(from, { ch: to, bold: false });
  if (all || ascii.has('heavy_box')) for (const [from, to] of Object.entries(HEAVY)) map.set(from, { ch: to, bold: true });
  return map;
}

const sgrCache = new Map();

function sgr(fg, bg, bold, mode) {
  const key = `${fg}|${bg}|${bold}|${mode}`;
  let s = sgrCache.get(key);
  if (s) return s;
  const f = colors[fg ?? 'text'];
  const b = colors[bg ?? 'background'];
  const parts = ['0'];
  if (bold) parts.push('1');
  if (mode === 'truecolor') parts.push(`38;2;${f.rgb.join(';')}`, `48;2;${b.rgb.join(';')}`);
  else parts.push(`38;5;${f.ansi256}`, `48;5;${b.ansi256}`);
  s = `${ESC}${parts.join(';')}m`;
  sgrCache.set(key, s);
  return s;
}

// Writer that tracks the cursor and the current SGR so it only emits what changes.
function writer(mode, ascii) {
  const subs = substitute(ascii);
  let out = '';
  let cur = '';
  let row = -1;
  let col = -1;
  return {
    cell(r, c, cell, w) {
      if (r !== row || c !== col) out += `${ESC}${r + 1};${c + 1}H`;
      const sub = subs?.get(cell.ch);
      const s = sgr(cell.fg, cell.bg, cell.bold || !!sub?.bold, mode);
      if (s !== cur) { out += s; cur = s; }
      out += sub ? sub.ch : cell.ch;
      row = r;
      col = c + w;
    },
    done: () => (out ? `${out}${ESC}0m` : ''),
  };
}

const same = (a, b) => a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.bold === b.bold;

function emit(grid, changed, { mode = 'truecolor', ascii } = {}) {
  const w = writer(mode, ascii);
  const { cols, rows, cells } = grid;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const cell = cells[i];
      if (cell.ch === '') continue;
      const wide = c + 1 < cols && cells[i + 1].ch === '';
      if (changed && !changed(i) && !(wide && changed(i + 1))) continue;
      w.cell(r, c, cell, wide ? 2 : 1);
    }
  }
  return w.done();
}

export const toAnsi = (grid, opts) => emit(grid, null, opts);

export function diff(prev, next, opts) {
  if (!prev || prev.cols !== next.cols || prev.rows !== next.rows) return toAnsi(next, opts);
  const a = prev.cells;
  const b = next.cells;
  // A continuation cell that changed means its lead must be rewritten too.
  return emit(next, (i) => !same(a[i], b[i]) || (b[i + 1]?.ch === '' && !same(a[i + 1], b[i + 1])), opts);
}
