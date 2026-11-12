import test from 'node:test';
import assert from 'node:assert/strict';
import { targetOf, parseRemote, refsIn } from '../src/target.js';

test('issue references on screen are found newest first, once each', () => {
  const text = [
    'I will start with #436, then #437.',
    'See https://github.com/acme/web/pull/12 and other/api#5.',
    'Back to #436 now.',
  ].join('\n');
  assert.deepEqual(refsIn(text, 'acme/web'), [
    { repo: 'acme/web', number: 436 },
    { repo: 'other/api', number: 5 },
    { repo: 'acme/web', number: 12 },
    { repo: 'acme/web', number: 437 },
  ]);
});

test('colors, headings and numbers glued to words are not issues', () => {
  assert.deepEqual(refsIn('color: #000000; # Title\nabc#12 #fff #12a\nstep#3', 'acme/web'), []);
});

test('bare references need a repo; full URLs and owner/repo#n do not', () => {
  assert.deepEqual(refsIn('#1 and other/api#2', null), [{ repo: 'other/api', number: 2 }]);
});

test('the list is capped so the picker stays short', () => {
  const text = Array.from({ length: 30 }, (_, i) => `#${i + 1}`).join(' ');
  assert.equal(refsIn(text, 'acme/web').length, 9);
});

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
