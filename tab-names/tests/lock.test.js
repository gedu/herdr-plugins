import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, stat, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withLock } from '../src/lock.js';

const fast = { tries: 3, waitMs: 5, staleMs: 10_000 };
const scratch = async () => mkdtemp(join(tmpdir(), 'tab-names-lock-'));
const exists = (p) => stat(p).then(() => true, () => false);

test('withLock runs the work and releases the lock', async () => {
  const dir = await scratch();
  const lock = join(dir, 'sync.lock');
  const result = await withLock(lock, async () => 'done', fast);
  assert.deepEqual(result, { ran: true, value: 'done' });
  assert.equal(await exists(lock), false);
  await rm(dir, { recursive: true, force: true });
});

test('withLock skips the work when another run holds the lock, and leaves that lock alone', async () => {
  const dir = await scratch();
  const lock = join(dir, 'sync.lock');
  await mkdir(lock);
  let ran = false;
  const result = await withLock(lock, async () => { ran = true; }, fast);
  assert.deepEqual(result, { ran: false });
  assert.equal(ran, false);
  assert.equal(await exists(lock), true);
  await rm(dir, { recursive: true, force: true });
});

test('withLock takes over a stale lock left by a crashed run', async () => {
  const dir = await scratch();
  const lock = join(dir, 'sync.lock');
  await mkdir(lock);
  const old = new Date(Date.now() - 60_000);
  await utimes(lock, old, old);
  const result = await withLock(lock, async () => 'took over', fast);
  assert.deepEqual(result, { ran: true, value: 'took over' });
  assert.equal(await exists(lock), false);
  await rm(dir, { recursive: true, force: true });
});

test('withLock releases the lock when the work throws', async () => {
  const dir = await scratch();
  const lock = join(dir, 'sync.lock');
  await assert.rejects(withLock(lock, async () => { throw new Error('boom'); }, fast), /boom/);
  assert.equal(await exists(lock), false);
  await rm(dir, { recursive: true, force: true });
});
