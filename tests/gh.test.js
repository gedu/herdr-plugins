import test from 'node:test';
import assert from 'node:assert/strict';
import { createGh, parsePrUrl, parseRemote } from '../src/gh.js';
import { safeGithubUrl } from '../src/url.js';

function recorder(stdout) {
  const calls = [];
  const exec = async (cmd, args) => { calls.push([cmd, ...args]); return { code: 0, stdout: JSON.stringify(stdout), stderr: '' }; };
  return { calls, exec };
}

test('review threads query sends owner and name as literal strings (-f), never as -F', async () => {
  const { calls, exec } = recorder({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] }, commits: { nodes: [] }, closingIssuesReferences: { nodes: [] } } } } });
  await createGh(exec).fetchThreads('https://github.com/o/r/pull/7');
  const args = calls[0];
  assert.ok(args.includes('owner=o') && args[args.indexOf('owner=o') - 1] === '-f');
  assert.ok(args.includes('name=r') && args[args.indexOf('name=r') - 1] === '-f');
  assert.equal(args[args.indexOf('number=7') - 1], '-F');
});

test('only github.com PR URLs are accepted', () => {
  assert.equal(parsePrUrl('https://evil.example/o/r/pull/7'), null);
  assert.equal(parsePrUrl('https://github.com.evil.example/o/r/pull/7'), null);
  assert.equal(parsePrUrl('https://github.com/o/r/pull/7')?.url, 'https://github.com/o/r/pull/7');
  assert.equal(parseRemote('git@github.com:o/r.git'), 'o/r');
  assert.equal(parseRemote('https://gitlab.com/o/r'), null);
});

test('safeGithubUrl lets through https github.com links only', () => {
  assert.equal(safeGithubUrl('https://github.com/o/r/pull/7'), 'https://github.com/o/r/pull/7');
  assert.equal(safeGithubUrl('https://github.com/o/r/actions/runs/5/job/1'), 'https://github.com/o/r/actions/runs/5/job/1');
  for (const bad of [
    'http://github.com/o/r', 'file:///etc/passwd', 'vscode://x', 'javascript:alert(1)', '-a Calculator',
    'https://github.com.evil.example/x', 'https://evil.example/github.com/x', 'https://user@evil.example', 'https://vercel.app/x', '', null, undefined,
  ]) assert.equal(safeGithubUrl(bad), null, String(bad));
});
