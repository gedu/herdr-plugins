import test from 'node:test';
import assert from 'node:assert/strict';
import { lookup } from '../src/exists.js';
import { keyOf, FRESH_MS } from '../src/cache.js';

const ref = (number, repo = 'acme/web') => ({ repo, number });
const notFound = { code: 1, stdout: '{"message":"Not Found","status":"404"}', stderr: 'gh: Not Found (HTTP 404)\n' };
const issue = (number) => ({ number, title: `Issue ${number}` });
const ok = (number) => ({ code: 0, stdout: JSON.stringify(issue(number)), stderr: '' });
const NOW = 1_000_000_000_000;

test('references that GitHub answers with 404 are dropped, the rest keep their order', async () => {
  const asked = [];
  const run = async (cmd, args) => {
    asked.push([cmd, ...args]);
    return args[1].endsWith('/99') ? notFound : ok(Number(args[1].split('/').pop()));
  };
  const { refs } = await lookup([ref(7), ref(99), ref(3, 'other/api')], run, {}, NOW);
  assert.deepEqual(refs, [ref(7), ref(3, 'other/api')]);
  assert.deepEqual(asked.map((a) => a[2]).sort(), ['repos/acme/web/issues/7', 'repos/acme/web/issues/99', 'repos/other/api/issues/3']);
});

test('a reference is kept when the check fails for any reason other than 404', async () => {
  const offline = { code: 1, stdout: '', stderr: 'error connecting to api.github.com\n' };
  const { refs, entries } = await lookup([ref(1), ref(2)], async () => offline, {}, NOW);
  assert.deepEqual(refs, [ref(1), ref(2)]);
  assert.deepEqual(entries, {});
});

test('when every reference is a 404 nothing is left', async () => {
  assert.deepEqual((await lookup([ref(1), ref(2)], async () => notFound, {}, NOW)).refs, []);
});

test('what GitHub answered is returned as cache entries, 404s included', async () => {
  const run = async (_cmd, args) => (args[1].endsWith('/99') ? notFound : ok(7));
  const { entries } = await lookup([ref(7), ref(99)], run, {}, NOW);
  assert.deepEqual(entries, {
    'acme/web#7': { at: NOW, issue: issue(7) },
    'acme/web#99': { at: NOW, missing: true },
  });
});

test('a fresh cached answer is used without asking GitHub, for found and missing alike', async () => {
  const cache = {
    [keyOf(ref(7))]: { at: NOW - FRESH_MS + 1000, issue: issue(7) },
    [keyOf(ref(99))]: { at: NOW - 1000, missing: true },
  };
  const run = async () => { throw new Error('gh must not run'); };
  const { refs, entries } = await lookup([ref(7), ref(99)], run, cache, NOW);
  assert.deepEqual(refs, [ref(7)]);
  assert.deepEqual(entries, {});
});

test('a cached answer older than the freshness window is checked again', async () => {
  const cache = { [keyOf(ref(7))]: { at: NOW - FRESH_MS - 1, issue: issue(7) } };
  const asked = [];
  const run = async (_cmd, args) => { asked.push(args[1]); return notFound; };
  const { refs, entries } = await lookup([ref(7)], run, cache, NOW);
  assert.deepEqual(asked, ['repos/acme/web/issues/7']);
  assert.deepEqual(refs, []);
  assert.deepEqual(entries, { 'acme/web#7': { at: NOW, missing: true } });
});

test('only the uncached references cost a call', async () => {
  const cache = { [keyOf(ref(7))]: { at: NOW - 1000, issue: issue(7) } };
  const asked = [];
  const run = async (_cmd, args) => { asked.push(args[1]); return ok(8); };
  const { refs } = await lookup([ref(7), ref(8)], run, cache, NOW);
  assert.deepEqual(asked, ['repos/acme/web/issues/8']);
  assert.deepEqual(refs, [ref(7), ref(8)]);
});
