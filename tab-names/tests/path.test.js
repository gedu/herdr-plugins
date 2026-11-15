import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortPath } from '../src/path.js';

const home = '/Users/me';

test('the home folder becomes ~', () => {
  assert.equal(shortPath('/Users/me', home), '~');
  assert.equal(shortPath('/Users/me/dev/api', home), '~/dev/api');
});

test('a folder that only starts with the home name is not rewritten', () => {
  assert.equal(shortPath('/Users/memo/dev', home), '/Users/memo/dev');
});

test('a long path keeps its tail and marks the cut with an ellipsis', () => {
  const dir = '/Users/me/Documents/development/herdr-plugins';
  assert.equal(shortPath(dir, home, 40), '~/Documents/development/herdr-plugins');
  assert.equal(shortPath(dir, home, 28), '…/development/herdr-plugins');
  assert.equal(shortPath(dir, home, 22), '…/herdr-plugins');
});

test('a single folder name longer than the limit is cut from the left', () => {
  const out = shortPath('/work/a-very-long-folder-name-here', home, 12);
  assert.equal(out.length, 12);
  assert.ok(out.startsWith('…'));
  assert.ok(out.endsWith('name-here'));
});

test('empty or missing paths give an empty string', () => {
  assert.equal(shortPath('', home), '');
  assert.equal(shortPath(undefined, home), '');
});
