import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readlink, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { link, links } from '../src/setup.js';

test('setup links flow and the skill, is idempotent, and never replaces a foreign file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'flow-setup-'));
  try {
    const all = links(home);
    assert.deepEqual(await Promise.all(all.map(link)), ['created', 'created', 'created']);
    assert.equal(await readlink(join(home, '.local/bin/flow')), all[0].from);
    assert.deepEqual(await Promise.all(all.map(link)), ['ok', 'ok', 'ok']);
    const other = join(home, 'other');
    await mkdir(join(home, 'x'));
    await writeFile(other, 'mine');
    assert.match(await link({ from: all[0].from, to: other }), /^skipped: .* not a link/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
