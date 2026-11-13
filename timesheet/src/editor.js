// Editing the day's bullets inside the popup, like a small text field per bullet.
// Pure: (edit state, key chunk) → {ed} while editing, or {done: {bullets} | {cancel: true}}.
import { cleanBullets } from './day.js';

export const MAX_BULLETS = 4;

const chars = (s) => [...s];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function startEdit(bullets) {
  const lines = bullets.length ? [...bullets] : [''];
  const row = lines.length - 1;
  return { lines, row, col: chars(lines[row]).length };
}

const MOVES = {
  '\x1b[D': (ed) => ({ ...ed, col: Math.max(0, ed.col - 1) }),
  '\x1b[C': (ed) => ({ ...ed, col: Math.min(chars(ed.lines[ed.row]).length, ed.col + 1) }),
  '\x1b[A': (ed) => row(ed, ed.row - 1),
  '\x1b[B': (ed) => row(ed, ed.row + 1),
  '\x1b[H': (ed) => ({ ...ed, col: 0 }),
  '\x1bOH': (ed) => ({ ...ed, col: 0 }),
  '\x01': (ed) => ({ ...ed, col: 0 }),
  '\x1b[F': (ed) => ({ ...ed, col: chars(ed.lines[ed.row]).length }),
  '\x1bOF': (ed) => ({ ...ed, col: chars(ed.lines[ed.row]).length }),
  '\x05': (ed) => ({ ...ed, col: chars(ed.lines[ed.row]).length }),
};

function row(ed, r) {
  const next = clamp(r, 0, ed.lines.length - 1);
  return { ...ed, row: next, col: Math.min(ed.col, chars(ed.lines[next]).length) };
}

function setLine(ed, text, col) {
  const lines = [...ed.lines];
  lines[ed.row] = text;
  return { ...ed, lines, col };
}

function typeChar(ed, ch) {
  const line = chars(ed.lines[ed.row]);
  if (ch === '\r' || ch === '\n') {
    if (ed.lines.length >= MAX_BULLETS) return ed;
    const lines = [...ed.lines];
    lines.splice(ed.row, 1, line.slice(0, ed.col).join(''), line.slice(ed.col).join(''));
    return { lines, row: ed.row + 1, col: 0 };
  }
  if (ch === '\x7f' || ch === '\b') {
    if (ed.col > 0) return setLine(ed, [...line.slice(0, ed.col - 1), ...line.slice(ed.col)].join(''), ed.col - 1);
    if (ed.row === 0) return ed;
    const above = chars(ed.lines[ed.row - 1]);
    const lines = [...ed.lines];
    lines.splice(ed.row - 1, 2, [...above, ...line].join(''));
    return { lines, row: ed.row - 1, col: above.length };
  }
  if (ch < ' ') return ed; // other control keys do nothing
  return setLine(ed, [...line.slice(0, ed.col), ch, ...line.slice(ed.col)].join(''), ed.col + 1);
}

export function editKey(ed, key) {
  if (key === '\x1b') return { done: { bullets: cleanBullets(ed.lines) } };
  if (key === '\x03') return { done: { cancel: true } };
  if (MOVES[key]) return { ed: MOVES[key](ed) };
  if (key.startsWith('\x1b')) return { ed }; // an escape sequence we do not use
  return { ed: chars(key).reduce(typeChar, ed) };
}
