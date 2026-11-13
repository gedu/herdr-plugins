import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { idFor } from '../src/ids.js';
import { create, load, list, update, validate } from '../src/store.js';

let dir;
const made = [];
after(() => Promise.all(made.map((d) => rm(d, { recursive: true, force: true }))));
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flow-store-'));
  made.push(dir);
  process.env.HERDR_FLOWS_DIR = dir;
});

test('idFor takes the first meaningful words as a short slug', () => {
  assert.equal(idFor('Purchases · free trial & restore', []), 'purchases');
  assert.equal(idFor('The checkout UI', []), 'checkout');
  assert.equal(idFor('Auth flow for web', []), 'auth-flow');
  assert.equal(idFor('Purchases', ['purchases']), 'purchases-2');
  assert.equal(idFor('Purchases', ['purchases', 'purchases-2']), 'purchases-3');
  assert.ok(idFor('Supercalifragilisticexpialidocious extra', []).length <= 20);
  assert.equal(idFor('¿¡!!', []), 'flow');
});

test('create writes one JSON per flow and load reads it back', async () => {
  const flow = await create('Purchases · free trial & restore', { layout: 'tree', who: 'cli' });
  assert.equal(flow.id, 'purchases');
  const disk = JSON.parse(await readFile(join(dir, 'purchases.json'), 'utf8'));
  assert.deepEqual(disk, await load('purchases'));
  assert.equal(disk.layout, 'tree');
  assert.deepEqual(disk.nodes, []);
  assert.equal(disk.history.length, 1);
  assert.equal((await create('Purchases again', {})).id, 'purchases-2');
});

test('validate rejects bad states, dangling edges and bad layouts', () => {
  const base = { id: 'x', feature: 'x', layout: 'tree', nodes: [{ id: 'a', state: 'done' }], edges: [] };
  assert.doesNotThrow(() => validate(base));
  assert.throws(() => validate({ ...base, nodes: [{ id: 'a', state: 'nope' }] }), /state/);
  assert.throws(() => validate({ ...base, edges: [{ from: 'a', to: 'b' }] }), /b/);
  assert.throws(() => validate({ ...base, layout: 'grid' }), /layout/);
  assert.throws(() => validate({ ...base, nodes: [{ id: 'a', state: 'done' }, { id: 'a', state: 'done' }] }), /duplicate/);
});

test('update stamps updated, appends history (last 50) and keeps unknown fields', async () => {
  await create('Keep', { id: 'keep' });
  const file = join(dir, 'keep.json');
  const raw = JSON.parse(await readFile(file, 'utf8'));
  raw.custom = { a: 1 };
  raw.updated = 'old';
  await writeFile(file, JSON.stringify(raw));
  for (let i = 0; i < 55; i++) await update('keep', (f) => { f.now = `step ${i}`; }, { who: 'tab 3', what: `step ${i}` });
  const flow = await load('keep');
  assert.deepEqual(flow.custom, { a: 1 });
  assert.notEqual(flow.updated, 'old');
  assert.equal(flow.history.length, 50);
  assert.deepEqual(Object.keys(flow.history.at(-1)).sort(), ['at', 'what', 'who']);
  assert.equal(flow.history.at(-1).what, 'step 54');
  assert.equal(flow.history.at(-1).who, 'tab 3');
});

test('a failing update leaves the file byte-identical', async () => {
  await create('Same', { id: 'same' });
  const file = join(dir, 'same.json');
  const before = await readFile(file);
  await assert.rejects(update('same', (f) => { f.nodes.push({ id: 'a', state: 'wat' }); }), /state/);
  assert.deepEqual(await readFile(file), before);
});

test('list summarizes every flow', async () => {
  await create('Alpha', { id: 'alpha' });
  await update('alpha', (f) => {
    f.nodes.push({ id: 'a', title: 'A', state: 'done', issues: [] }, { id: 'b', title: 'B', state: 'blocked', issues: [] });
    f.agents.push({ tab: 2, node: 'a', name: 'X' });
  });
  await create('Beta', { id: 'beta' });
  const rows = await list();
  assert.deepEqual(rows.map((r) => r.id), ['alpha', 'beta']);
  const a = rows[0];
  assert.equal(a.feature, 'Alpha');
  assert.equal(a.done, 1);
  assert.equal(a.total, 2);
  assert.equal(a.blocked, true);
  assert.equal(rows[1].blocked, false);
  assert.ok(a.updated);
  assert.deepEqual(a.agents, [{ tab: 2, node: 'a', name: 'X' }]);
});

test('load of a missing flow says so', async () => {
  await assert.rejects(load('ghost'), /no flow "ghost"/);
});
