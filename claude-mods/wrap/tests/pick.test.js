import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHandoff, pickHandoff, contextFor } from '../src/pick.js';

const HOUR = 3_600_000;
const now = Date.parse('2026-11-17T12:00:00Z');
const file = (name, cwd, ageHours, body = 'Continue the work.') => ({
  name,
  mtimeMs: now - ageHours * HOUR,
  text: `---\ncwd: ${cwd}\n---\n${body}\n`,
});

test('parseHandoff reads the cwd header and the body', () => {
  assert.deepEqual(parseHandoff('---\ncwd: /repo/a\n---\n# Goal\nShip it\n'), { cwd: '/repo/a', body: '# Goal\nShip it' });
});

test('parseHandoff rejects text without a cwd header', () => {
  assert.equal(parseHandoff('# Goal\nShip it\n'), null);
});

test('pickHandoff takes the newest handoff written in the same folder', () => {
  const files = [file('a.md', '/repo/a', 3), file('b.md', '/repo/a', 1), file('c.md', '/repo/b', 0)];
  assert.equal(pickHandoff(files, { cwd: '/repo/a', now }).name, 'b.md');
});

test('pickHandoff accepts a trailing slash on either side', () => {
  assert.equal(pickHandoff([file('a.md', '/repo/a/', 1)], { cwd: '/repo/a', now }).name, 'a.md');
});

test('pickHandoff ignores handoffs older than the limit', () => {
  assert.equal(pickHandoff([file('a.md', '/repo/a', 25)], { cwd: '/repo/a', now }), null);
  assert.equal(pickHandoff([file('a.md', '/repo/a', 25)], { cwd: '/repo/a', now, maxAgeMs: 48 * HOUR }).name, 'a.md');
});

test('pickHandoff returns null when nothing matches', () => {
  assert.equal(pickHandoff([file('a.md', '/repo/b', 1)], { cwd: '/repo/a', now }), null);
  assert.equal(pickHandoff([], { cwd: '/repo/a', now }), null);
});

test('contextFor frames the body so the new session knows where it comes from', () => {
  const text = contextFor({ name: 'b.md', body: '# Goal\nShip it' });
  assert.match(text, /handoff/i);
  assert.match(text, /# Goal\nShip it/);
});
