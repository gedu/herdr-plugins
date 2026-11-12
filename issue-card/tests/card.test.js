import test from 'node:test';
import assert from 'node:assert/strict';
import { cardOf, excerpt, listOf } from '../src/card.js';

test('the picker lists each reference with its title and marks the selected one', () => {
  const items = [
    { repo: 'acme/web', number: 436, issue: { title: 'Coach chat', state: 'open' } },
    { repo: 'acme/web', number: 437, issue: { title: 'Fix flicker', state: 'closed', pull_request: { merged_at: 'x' } } },
    { repo: 'other/api', number: 5, error: 'Not Found' },
    { repo: 'acme/web', number: 9 },
  ];
  const lines = listOf(items, { selected: 1, width: 50, repo: 'acme/web' });
  const text = lines.join('\n');
  assert.match(text, /^ {2}#436 {2}Coach chat/m);
  assert.match(text, /^▌ #437 {2}Fix flicker · Merged/m);
  assert.match(text, /other\/api#5 {2}Not Found/);
  assert.match(text, /#9 {2}Loading…/);
  assert.match(lines.at(-1), /enter card · q close/);
  for (const line of lines) assert.ok(line.length <= 50, line);
});

const issue = {
  number: 1232, title: 'Login button does nothing on Safari', state: 'open', user: { login: 'gedu' },
  labels: [{ name: 'bug' }, { name: 'web' }], comments: 3, html_url: 'https://github.com/acme/web/issues/1232',
  body: '<!-- template -->\n## Steps\n\n1. Open the app in **Safari**\n2. Tap login\n\n![shot](x.png)\nNothing happens.\nMore\nAnd more\nToo far',
};

test('the card shows number, state, kind, author, title, labels and the start of the body', () => {
  const text = cardOf(issue, { width: 60 }).join('\n');
  assert.match(text, /#1232 · Open issue · by gedu · 3 comments/);
  assert.match(text, /Login button does nothing on Safari/);
  assert.match(text, /bug, web/);
  assert.match(text, /1\. Open the app in Safari/);
  assert.doesNotMatch(text, /template|!\[|\*\*/);
  assert.match(text, /o GitHub · q close/);
});

test('pull requests say so, and merged ones say merged', () => {
  const pr = { ...issue, state: 'closed', pull_request: { merged_at: '2026-11-01T00:00:00Z' } };
  assert.match(cardOf(pr, { width: 60 }).join('\n'), /Merged pull request/);
  assert.match(cardOf({ ...issue, state: 'closed', state_reason: 'not_planned' }, { width: 60 }).join('\n'), /Closed issue/);
});

test('no line is wider than the popup, and text from GitHub cannot inject escape codes', () => {
  const lines = cardOf({ ...issue, title: `\u001b[31m${'x'.repeat(200)}` }, { width: 40 });
  for (const line of lines) assert.ok(line.length <= 40, line);
  assert.ok(!lines.join('').includes('\u001b'));
});

test('a long body is cut to fit the popup, and the keys line is always the last one', () => {
  const lines = cardOf({ ...issue, body: Array.from({ length: 40 }, (_, i) => `line ${i} `.repeat(12)).join('\n') }, { width: 50, height: 14 });
  assert.equal(lines.length, 14);
  assert.match(lines.at(-1), /o GitHub · q close/);
  assert.ok(lines.some((l) => l.trim() === '…'));
});

test('the excerpt keeps only the first lines worth reading', () => {
  assert.deepEqual(excerpt('a\n\n\nb\nc\nd', 2), ['a', '', 'b']);
  assert.deepEqual(excerpt('', 3), []);
});
