import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createParser, parse } from '../src/input.js';

const key = (name, extra = {}) => ({ type: 'key', name, ...extra });

test('named keys', () => {
  assert.deepEqual(parse('\x1b[A\x1b[B\x1b[C\x1b[D'), [key('up'), key('down'), key('right'), key('left')]);
  assert.deepEqual(parse('\x1bOA'), [key('up')]);
  assert.deepEqual(parse('\r'), [key('enter')]);
  assert.deepEqual(parse('\t'), [key('tab')]);
  assert.deepEqual(parse('\x1b[Z'), [key('backtab')]);
  assert.deepEqual(parse('\x7f'), [key('backspace')]);
  assert.deepEqual(parse('\b'), [key('backspace')]);
  assert.deepEqual(parse('\x03'), [key('ctrl-c')]);
});

test('printable characters, one event each, unicode included', () => {
  assert.deepEqual(parse('qñ✓'), [key('char', { ch: 'q' }), key('char', { ch: 'ñ' }), key('char', { ch: '✓' })]);
  assert.deepEqual(parse(' '), [key('char', { ch: ' ' })]);
});

test('a lone escape waits for more input, flush turns it into esc', () => {
  const p = createParser();
  assert.deepEqual(p.feed('\x1b'), []);
  assert.equal(p.pending(), true);
  assert.deepEqual(p.flush(), [key('escape')]);
  assert.equal(p.pending(), false);
});

test('escape followed by a plain char is esc then the char', () => {
  assert.deepEqual(parse('\x1bq'), [key('escape'), key('char', { ch: 'q' })]);
});

test('SGR mouse press, release, right click, drag', () => {
  assert.deepEqual(parse('\x1b[<0;10;5M'), [{ type: 'mouse', kind: 'press', button: 0, col: 9, row: 4 }]);
  assert.deepEqual(parse('\x1b[<0;10;5m'), [{ type: 'mouse', kind: 'release', button: 0, col: 9, row: 4 }]);
  assert.deepEqual(parse('\x1b[<2;1;1M'), [{ type: 'mouse', kind: 'press', button: 2, col: 0, row: 0 }]);
  assert.deepEqual(parse('\x1b[<32;3;4M'), [{ type: 'mouse', kind: 'drag', button: 0, col: 2, row: 3 }]);
});

test('SGR mouse wheel up, down and sideways', () => {
  assert.deepEqual(parse('\x1b[<64;7;8M'), [{ type: 'mouse', kind: 'wheel', wheel: 'up', button: 64, col: 6, row: 7 }]);
  assert.deepEqual(parse('\x1b[<65;7;8M'), [{ type: 'mouse', kind: 'wheel', wheel: 'down', button: 65, col: 6, row: 7 }]);
  assert.deepEqual(parse('\x1b[<66;1;1M')[0].wheel, 'left');
  assert.deepEqual(parse('\x1b[<67;1;1M')[0].wheel, 'right');
});

test('mouse modifiers do not change the button', () => {
  assert.deepEqual(parse('\x1b[<16;2;2M'), [{ type: 'mouse', kind: 'press', button: 0, col: 1, row: 1 }]);
});

test('several events in one chunk', () => {
  assert.deepEqual(parse('\x1b[<0;2;3M\x1b[<0;2;3mj\x1b[B\r'), [
    { type: 'mouse', kind: 'press', button: 0, col: 1, row: 2 },
    { type: 'mouse', kind: 'release', button: 0, col: 1, row: 2 },
    key('char', { ch: 'j' }),
    key('down'),
    key('enter'),
  ]);
});

test('sequences split across chunks are joined', () => {
  const p = createParser();
  assert.deepEqual(p.feed('a\x1b[<0;1'), [key('char', { ch: 'a' })]);
  assert.equal(p.pending(), true);
  assert.deepEqual(p.feed('2;3'), []);
  assert.deepEqual(p.feed('M\x1b'), [{ type: 'mouse', kind: 'press', button: 0, col: 11, row: 2 }]);
  assert.deepEqual(p.feed('[A'), [key('up')]);
  assert.deepEqual(p.feed('\x1bO'), []);
  assert.deepEqual(p.feed('B'), [key('down')]);
});

test('unknown sequences are reported, not leaked as chars', () => {
  assert.deepEqual(parse('\x1b[3~x'), [key('unknown', { seq: '\x1b[3~' }), key('char', { ch: 'x' })]);
});
