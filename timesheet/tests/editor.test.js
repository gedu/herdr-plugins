import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startEdit, editKey, MAX_BULLETS } from '../src/editor.js';
import { screen, plain } from '../src/ui.js';

const type = (ed, ...keys) => keys.reduce((e, k) => editKey(e.ed ?? e, k), { ed });

test('editing starts on the last bullet with the cursor at its end', () => {
  const ed = startEdit(['SF Figma run', 'Figma factory']);
  assert.deepEqual(ed, { lines: ['SF Figma run', 'Figma factory'], row: 1, col: 13 });
  assert.deepEqual(startEdit([]), { lines: [''], row: 0, col: 0 });
});

test('typing inserts at the cursor; backspace deletes before it; ←→ move it', () => {
  const r = type(startEdit(['ab']), '\x1b[D', 'X', '\x7f', '\x7f', 'Y');
  assert.deepEqual(r.ed.lines, ['Yb']);
  assert.equal(r.ed.col, 1);
});

test('enter splits the bullet at the cursor into a new bullet below', () => {
  const r = type(startEdit(['one two']), '\x1b[D', '\x1b[D', '\x1b[D', '\r', 'x');
  assert.deepEqual(r.ed.lines, ['one ', 'xtwo']);
  assert.deepEqual([r.ed.row, r.ed.col], [1, 1]);
});

test(`no more than ${MAX_BULLETS} bullets: enter on a full list does nothing`, () => {
  const r = type(startEdit(['a', 'b', 'c', 'd']), '\r');
  assert.deepEqual(r.ed.lines, ['a', 'b', 'c', 'd']);
});

test('backspace at the start of a bullet joins it with the one above', () => {
  const r = type(startEdit(['a', 'b']), '\x1b[H', '\x7f');
  assert.deepEqual(r.ed.lines, ['ab']);
  assert.deepEqual([r.ed.row, r.ed.col], [0, 1]);
});

test('↑↓ move between bullets, keeping the cursor inside the line', () => {
  const r = type(startEdit(['short', 'a much longer one']), '\x1b[A');
  assert.deepEqual([r.ed.row, r.ed.col], [0, 5]);
  assert.deepEqual([type(r.ed, '\x1b[B').ed.row], [1]);
});

test('a pasted chunk is typed char by char, its newlines start new bullets', () => {
  const r = type(startEdit(['']), 'first\rsecond');
  assert.deepEqual(r.ed.lines, ['first', 'second']);
});

test('esc finishes and returns the bullets, without empty ones; ctrl+c cancels', () => {
  const done = type(startEdit(['a', '']), ' b', '\x1b');
  assert.deepEqual(done.done, { bullets: ['a', 'b'] });
  const cancel = type(startEdit(['a']), 'zz', '\x03');
  assert.deepEqual(cancel.done, { cancel: true });
});

test('the edit screen shows the bullets, a cursor and the edit keys', () => {
  const state = {
    phase: 'ready', today: '2026-11-12', dates: ['2026-11-12'], index: 0,
    drafts: { '2026-11-12': { status: 'ready', bullets: ['x'] } },
    edit: { lines: ['SF Figma run', 'Figma'], row: 1, col: 2 },
  };
  const raw = screen(state, 60);
  const lines = raw.map(plain);
  assert.ok(lines.includes(' - SF Figma run'));
  assert.ok(lines.includes(' - Figma'), 'the cursor line keeps its text');
  assert.ok(raw.some((l) => l.includes('\x1b[7mg\x1b[27m')), 'the cursor cell is drawn inverted');
  assert.match(lines.at(-1), /esc done/);
  assert.match(lines.at(-1), /↵ new bullet/);
});
