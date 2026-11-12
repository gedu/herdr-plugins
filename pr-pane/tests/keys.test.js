import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/keys.js';

test('keys, arrows and a left click (SGR mouse) are read', () => {
  assert.deepEqual(parseInput('j\r\x1b[A\x1b[C\x1bOB\x7fx'), [
    { type: 'key', name: 'j' }, { type: 'key', name: 'enter' }, { type: 'key', name: 'up' }, { type: 'key', name: 'right' },
    { type: 'key', name: 'down' }, { type: 'key', name: 'backspace' }, { type: 'key', name: 'x' },
  ]);
  assert.deepEqual(parseInput('\x1b[<0;12;5M\x1b[<0;12;5m'), [{ type: 'click', row: 4, col: 11 }]);
  assert.deepEqual(parseInput('\x1b[<64;3;3M\x1b[<65;3;3M'), [{ type: 'key', name: 'up' }, { type: 'key', name: 'down' }]);
  assert.deepEqual(parseInput('\x1b'), [{ type: 'key', name: 'escape' }]);
  assert.deepEqual(parseInput('\x03'), [{ type: 'key', name: 'ctrl-c' }]);
});
