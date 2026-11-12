import test from 'node:test';
import assert from 'node:assert/strict';
import { targetOf, parseRemote } from '../src/target.js';

test('a clicked issue or pull request URL names its own repo and number', () => {
  assert.deepEqual(targetOf({ url: 'https://github.com/acme/web/issues/1232' }), { repo: 'acme/web', number: 1232 });
  assert.deepEqual(targetOf({ url: 'https://github.com/acme/web/pull/7#issuecomment-1' }), { repo: 'acme/web', number: 7 });
});

test('a selected number is looked up in the repo of the focused folder', () => {
  for (const selected of ['1232', '#1232', 'issue 1232', ' PR #1232 ']) {
    assert.deepEqual(targetOf({ selected, repo: 'acme/web' }), { repo: 'acme/web', number: 1232 }, selected);
  }
});

test('a selected owner/repo#number names its own repo', () => {
  assert.deepEqual(targetOf({ selected: 'other/api#5', repo: 'acme/web' }), { repo: 'other/api', number: 5 });
});

test('nothing is guessed: no number, no repo, or a non-GitHub URL gives no target', () => {
  assert.equal(targetOf({ selected: 'hello', repo: 'acme/web' }), null);
  assert.equal(targetOf({ selected: '1232', repo: null }), null);
  assert.equal(targetOf({ url: 'https://gitlab.com/acme/web/issues/3' }), null);
  assert.equal(targetOf({}), null);
});

test('origin remotes are read in https and ssh forms', () => {
  assert.equal(parseRemote('git@github.com:acme/web.git\n'), 'acme/web');
  assert.equal(parseRemote('https://github.com/acme/web'), 'acme/web');
  assert.equal(parseRemote('https://gitlab.com/acme/web.git'), null);
});
