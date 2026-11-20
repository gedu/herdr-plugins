import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCache, saveCache, keyOf, freshness, KEEP_MS, MAX_ENTRIES, FRESH_MS, REVALIDATE_MS } from '../src/cache.js';

const NOW = 1_000_000_000_000;
const scratch = () => mkdtemp(join(tmpdir(), 'issue-card-cache-'));

test('the key ignores the case of the repo name', () => {
  assert.equal(keyOf({ repo: 'Acme/Web', number: 7 }), 'acme/web#7');
});

test('saved entries are read back, merged with what was there, and the file is private', async () => {
  const dir = await scratch();
  try {
    await saveCache(dir, { 'a/b#1': { at: NOW, issue: { number: 1 } } }, NOW);
    await saveCache(dir, { 'a/b#2': { at: NOW, missing: true } }, NOW);
    assert.deepEqual(Object.keys(await loadCache(dir)).sort(), ['a/b#1', 'a/b#2']);
    assert.equal((await stat(join(dir, 'issues.json'))).mode & 0o777, 0o600);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('entries older than the keep window are dropped, and the newest MAX_ENTRIES stay', async () => {
  const dir = await scratch();
  try {
    const updates = { 'a/b#old': { at: NOW - KEEP_MS - 1, issue: {} } };
    for (let i = 0; i < MAX_ENTRIES + 5; i += 1) updates[`a/b#${i}`] = { at: NOW - i, issue: {} };
    await saveCache(dir, updates, NOW);
    const kept = await loadCache(dir);
    assert.equal(Object.keys(kept).length, MAX_ENTRIES);
    assert.equal(kept['a/b#old'], undefined);
    assert.ok(kept['a/b#0']);
    assert.equal(kept[`a/b#${MAX_ENTRIES + 4}`], undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a missing or corrupt cache file reads as empty, and no folder means no cache', async () => {
  const dir = await scratch();
  try {
    assert.deepEqual(await loadCache(dir), {});
    await writeFile(join(dir, 'issues.json'), '{not json');
    assert.deepEqual(await loadCache(dir), {});
    await saveCache(dir, { 'a/b#1': { at: NOW, issue: {} } }, NOW);
    assert.ok((await loadCache(dir))['a/b#1']);
    assert.deepEqual(await loadCache(undefined), {});
    await saveCache(undefined, { 'a/b#1': { at: NOW, issue: {} } }, NOW);
    assert.ok(JSON.parse(await readFile(join(dir, 'issues.json'), 'utf8')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('freshness: fresh inside the windows, stale beyond, none without an entry', () => {
  assert.equal(freshness(undefined, NOW, FRESH_MS), 'none');
  assert.equal(freshness({ at: NOW - REVALIDATE_MS + 1 }, NOW, REVALIDATE_MS), 'fresh');
  assert.equal(freshness({ at: NOW - REVALIDATE_MS - 1 }, NOW, REVALIDATE_MS), 'stale');
});
