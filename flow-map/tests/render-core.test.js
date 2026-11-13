import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellWidth, strWidth, fit } from '../src/render/width.js';
import { createGrid, text, box, rowText } from '../src/render/grid.js';
import { toAnsi, diff, colorMode } from '../src/render/ansi.js';
import { colors } from '../src/render/tokens.js';

test('cellWidth: combining 0, wide and emoji 2, design glyphs 1', () => {
  assert.equal(cellWidth('a'), 1);
  assert.equal(cellWidth('́'), 0);
  assert.equal(cellWidth('日'), 2);
  assert.equal(cellWidth('Ａ'), 2);
  assert.equal(cellWidth('🙂'), 2);
  assert.equal(cellWidth('✅'), 2);
  for (const g of '●○■◂▸✓━┄┆╭╮╰╯─│┏┓┗┛┃┬┴┼↓→…') assert.equal(cellWidth(g), 1, g);
});

test('strWidth counts terminal cells', () => {
  assert.equal(strWidth('abc'), 3);
  assert.equal(strWidth('é'), 1);
  assert.equal(strWidth('日本'), 4);
  assert.equal(strWidth('a🙂b'), 4);
});

test('fit cuts by width with …', () => {
  assert.equal(fit('hello', 5), 'hello');
  assert.equal(fit('hello world', 6), 'hello…');
  assert.equal(fit('日本語', 4), '日…');
  assert.ok(strWidth(fit('日本語', 4)) <= 4);
  assert.equal(fit('abc', 0), '');
});

test('text: a wide char takes 2 cells and keeps later columns aligned', () => {
  const g = createGrid(10, 1);
  text(g, 0, 0, 'a日b');
  assert.equal(g.cells[0].ch, 'a');
  assert.equal(g.cells[1].ch, '日');
  assert.equal(g.cells[2].ch, '');
  assert.equal(g.cells[3].ch, 'b');
  assert.equal(rowText(g, 0).trimEnd(), 'a日b');
});

test('text never writes past maxW or the grid edge', () => {
  const g = createGrid(8, 1);
  text(g, 2, 0, 'abcdefghij', {}, 4);
  assert.equal(rowText(g, 0).trimEnd(), '  abc…');
  text(g, 6, 0, 'xyz');
  assert.equal(rowText(g, 0), '  abc…x…');
});

test('box draws the 4 state styles', () => {
  const g = createGrid(5, 3);
  box(g, 0, 0, 5, 3, 'in_progress');
  assert.equal(rowText(g, 0), '┏━━━┓');
  assert.equal(rowText(g, 2), '┗━━━┛');
  box(g, 0, 0, 5, 3, 'pending');
  assert.equal(rowText(g, 0), '╭┄┄┄╮');
  assert.equal(rowText(g, 1).trimEnd(), '┆   ┆');
  assert.equal(g.cells[0].fg, 'muted');
});

test('colorMode reads COLORTERM', () => {
  assert.equal(colorMode({ COLORTERM: 'truecolor' }), 'truecolor');
  assert.equal(colorMode({ COLORTERM: '24bit' }), 'truecolor');
  assert.equal(colorMode({}), '256');
});

test('toAnsi uses truecolor SGR or ansi256 codes', () => {
  const g = createGrid(2, 1);
  text(g, 0, 0, 'ab', { fg: 'accent', bg: 'selection', bold: true });
  const tc = toAnsi(g, { mode: 'truecolor' });
  assert.match(tc, /38;2;122;167;255/);
  assert.match(tc, /48;2;24;32;58/);
  const c256 = toAnsi(g, { mode: '256' });
  assert.match(c256, new RegExp(`38;5;${colors.accent.ansi256}`));
  assert.match(c256, new RegExp(`48;5;${colors.selection.ansi256}`));
  assert.doesNotMatch(c256, /38;2;/);
});

test('diff writes nothing for identical frames', () => {
  const a = createGrid(20, 3);
  const b = createGrid(20, 3);
  text(a, 1, 1, 'same', { fg: 'done' });
  text(b, 1, 1, 'same', { fg: 'done' });
  assert.equal(diff(a, b, { mode: 'truecolor' }), '');
});

test('diff rewrites only the changed cells', () => {
  const a = createGrid(20, 3);
  const b = createGrid(20, 3);
  text(a, 1, 1, 'abcd');
  text(b, 1, 1, 'abXd');
  const out = diff(a, b, { mode: 'truecolor' });
  // cursor to row 2, col 4 (1-based), then only "X"
  assert.match(out, /\x1b\[2;4H/);
  assert.equal(out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''), 'X');
});

test('diff rewrites a cell whose color alone changed', () => {
  const a = createGrid(5, 1);
  const b = createGrid(5, 1);
  text(a, 0, 0, 'ab', { fg: 'muted' });
  text(b, 0, 0, 'ab', { fg: 'muted' });
  b.cells[1].fg = 'blocked';
  const out = diff(a, b, { mode: '256' });
  assert.equal(out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''), 'b');
  assert.match(out, new RegExp(`38;5;${colors.blocked.ansi256}`));
});

test('ascii fallbacks replace glyphs the font lacks; heavy box becomes light and bold', () => {
  const g = createGrid(4, 1);
  text(g, 0, 0, '◂▸┏━');
  const out = toAnsi(g, { mode: 'truecolor', ascii: true }).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  assert.equal(out, '<>╭─');
  const some = toAnsi(g, { mode: 'truecolor', ascii: new Set(['◂']) }).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  assert.equal(some, '<▸┏━');
});
