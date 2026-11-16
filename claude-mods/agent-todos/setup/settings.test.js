import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTodoTools, TODO_ENV } from './settings.js';

test('adds the todo tools switch and keeps everything else', () => {
  const before = { env: { FOO: '1' }, outputStyle: 'Gentleman', enabledPlugins: { 'x@y': true } };
  const { settings, changed } = withTodoTools(before);
  assert.equal(changed, true);
  assert.deepEqual(settings, { env: { FOO: '1', [TODO_ENV]: '1' }, outputStyle: 'Gentleman', enabledPlugins: { 'x@y': true } });
  assert.deepEqual(before.env, { FOO: '1' }, 'the input is not mutated');
});

test('works without an env block or settings at all, and is a no-op when already set', () => {
  assert.deepEqual(withTodoTools({}).settings, { env: { [TODO_ENV]: '1' } });
  assert.deepEqual(withTodoTools(undefined).settings, { env: { [TODO_ENV]: '1' } });
  assert.equal(withTodoTools({ env: { [TODO_ENV]: '1' } }).changed, false);
});
