import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
let dir;
const made = [];
after(() => Promise.all(made.map((d) => rm(d, { recursive: true, force: true }))));
let env;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'flow-cli-'));
  made.push(dir);
  env = { ...process.env, HERDR_FLOWS_DIR: dir };
  delete env.HERDR_TAB_ID;
  delete env.HERDR_BIN_PATH;
});

// Runs the CLI and resolves {code, stdout, stderr} without throwing.
function flow(args, extraEnv = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...env, ...extraEnv } }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}
const read = async (id) => JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8'));

test('new prints the id and creates the file; a taken id gets -2', async () => {
  const a = await flow(['new', 'Purchases · free trial & restore', '--layout', 'screens']);
  assert.equal(a.code, 0);
  assert.equal(a.stdout.trim(), 'purchases');
  const f = await read('purchases');
  assert.equal(f.feature, 'Purchases · free trial & restore');
  assert.equal(f.layout, 'screens');
  const b = await flow(['new', 'Purchases v2']);
  assert.equal(b.stdout.trim(), 'purchases-2');
  const c = await flow(['new', 'Whatever', '--id', 'my-map']);
  assert.equal(c.stdout.trim(), 'my-map');
  const d = await flow(['new', 'Again', '--id', 'my-map']);
  assert.equal(d.code, 1);
  assert.match(d.stderr, /taken/);
});

test('node creates, updates and removes a node; --parent adds an edge', async () => {
  await flow(['new', 'Map', '--id', 'm']);
  let r = await flow(['node', 'm', 'root', '--title', 'Root', '--state', 'done']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout.split('\n').filter(Boolean).length, 1);
  r = await flow(['node', 'm', 'child', '--parent', 'root', '--label', 'goes to', '--detail', 'd1', '--layer', 'API']);
  assert.equal(r.code, 0);
  let f = await read('m');
  assert.deepEqual(f.nodes.find((n) => n.id === 'child'),
    { id: 'child', title: 'child', detail: 'd1', state: 'pending', issues: [], layer: 'API' });
  assert.deepEqual(f.edges, [{ from: 'root', to: 'child', label: 'goes to' }]);

  await flow(['node', 'm', 'child', '--state', 'in_progress', '--title', 'Child']);
  f = await read('m');
  const child = f.nodes.find((n) => n.id === 'child');
  assert.equal(child.state, 'in_progress');
  assert.equal(child.title, 'Child');
  assert.equal(child.detail, 'd1');

  r = await flow(['node', 'm', 'child', '--remove']);
  assert.equal(r.code, 0);
  f = await read('m');
  assert.deepEqual(f.nodes.map((n) => n.id), ['root']);
  assert.deepEqual(f.edges, []);
});

test('--ref accepts numbers, #numbers and free text, with an optional state', async () => {
  await flow(['new', 'Refs', '--id', 'r']);
  await flow(['node', 'r', 'a', '--ref', '277', '--ref', '#278:merged', '--ref', 'PROJ-12', '--ref', 'https://x.dev/a:b']);
  const f = await read('r');
  assert.deepEqual(f.nodes[0].issues, [
    { n: 277, state: 'open' },
    { n: 278, state: 'merged' },
    { ref: 'PROJ-12', state: 'open' },
    { ref: 'https://x.dev/a:b', state: 'open' },
  ]);
  await flow(['node', 'r', 'a', '--ref', '277:merged']);
  assert.deepEqual((await read('r')).nodes[0].issues[0], { n: 277, state: 'merged' });
});

test('--blocked sets the state and the reason; a later state clears it', async () => {
  await flow(['new', 'B', '--id', 'b']);
  await flow(['node', 'b', 'a', '--blocked', 'waits on the client']);
  let n = (await read('b')).nodes[0];
  assert.equal(n.state, 'blocked');
  assert.equal(n.blocked_by, 'waits on the client');
  assert.equal(n.detail, 'waits on the client');
  await flow(['node', 'b', 'a', '--state', 'done']);
  n = (await read('b')).nodes[0];
  assert.equal(n.state, 'done');
  assert.equal(n.blocked_by, undefined);
});

test('an invalid state exits 1 and leaves the file byte-identical', async () => {
  await flow(['new', 'Bad', '--id', 'bad']);
  await flow(['node', 'bad', 'a']);
  const before = await readFile(join(dir, 'bad.json'));
  const r = await flow(['node', 'bad', 'a', '--state', 'finished']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /state/);
  assert.deepEqual(await readFile(join(dir, 'bad.json')), before);
});

test('bad input exits 1 with a clear message', async () => {
  assert.match((await flow(['node', 'ghost', 'a'])).stderr, /no flow "ghost"/);
  assert.equal((await flow(['nope'])).code, 1);
  assert.equal((await flow(['new'])).code, 1);
  await flow(['new', 'E', '--id', 'e']);
  const r = await flow(['edge', 'e', 'a', 'b']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /a/);
  assert.equal((await flow(['node', 'e', 'a', '--bogus'])).code, 1);
});

test('edge adds a labelled or dashed edge once', async () => {
  await flow(['new', 'E', '--id', 'e']);
  await flow(['node', 'e', 'a']);
  await flow(['node', 'e', 'b']);
  assert.equal((await flow(['edge', 'e', 'a', 'b', '--label', 'calls'])).code, 0);
  await flow(['edge', 'e', 'a', 'b', '--dashed']);
  assert.deepEqual((await read('e')).edges, [{ from: 'a', to: 'b', label: 'calls', style: 'dashed' }]);
});

test('note keeps the last 5 notes, older ones stay in history; now sets now', async () => {
  await flow(['new', 'N', '--id', 'n']);
  for (let i = 1; i <= 7; i++) await flow(['note', 'n', `note ${i}`]);
  await flow(['now', 'n', 'building the adapter']);
  const f = await read('n');
  assert.deepEqual(f.notes, ['note 3', 'note 4', 'note 5', 'note 6', 'note 7']);
  assert.ok(f.history.some((h) => h.what.includes('note 1')));
  assert.equal(f.now, 'building the adapter');
  assert.equal(f.history.at(-1).who, 'cli');
});

test('concurrent updates from two processes both land', async () => {
  await flow(['new', 'C', '--id', 'c']);
  const runs = [];
  for (let i = 0; i < 8; i++) runs.push(flow(['node', 'c', `n${i}`]));
  const results = await Promise.all(runs);
  assert.ok(results.every((r) => r.code === 0), JSON.stringify(results));
  assert.equal((await read('c')).nodes.length, 8);
});

test('here without Herdr env records tab null', async () => {
  await flow(['new', 'H', '--id', 'h']);
  await flow(['node', 'h', 'ios']);
  const r = await flow(['here', 'h', 'ios', '--name', 'iOS']);
  assert.equal(r.code, 0);
  assert.deepEqual((await read('h')).agents, [{ tab: null, node: 'ios', name: 'iOS' }]);
  assert.equal((await flow(['here', 'h', 'nope'])).code, 1);
});

test('here resolves HERDR_TAB_ID to the tab number through herdr tab list', async () => {
  const bin = join(dir, 'fake-herdr');
  await writeFile(bin, `#!/bin/sh\necho '{"id":"cli:tab:list","result":{"tabs":[{"tab_id":"w1:t3","number":3},{"tab_id":"w1:t7","number":7}]}}'\n`);
  await chmod(bin, 0o755);
  await flow(['new', 'H', '--id', 'h']);
  await flow(['node', 'h', 'ios']);
  const extra = { HERDR_TAB_ID: 'w1:t7', HERDR_BIN_PATH: bin };
  await flow(['here', 'h', 'ios'], extra);
  await flow(['here', 'h', 'ios', '--name', 'iOS'], extra);
  const f = await read('h');
  assert.deepEqual(f.agents, [{ tab: 7, node: 'ios', name: 'iOS' }]);
  assert.equal(f.history.at(-1).who, 'tab 7');
});

test('show prints one line per node then now and notes', async () => {
  await flow(['new', 'Show me', '--id', 's']);
  await flow(['node', 's', 'root', '--title', 'Root', '--state', 'done']);
  await flow(['node', 's', 'ad', '--title', 'Adapter', '--parent', 'root', '--ref', '#277', '--blocked', 'client']);
  await flow(['now', 's', 'waiting']);
  await flow(['note', 's', 'hello']);
  const r = await flow(['show', 's']);
  assert.equal(r.code, 0);
  const lines = r.stdout.trimEnd().split('\n');
  assert.match(lines[0], /^s · Show me · 1\/2 done/);
  assert.match(lines[1], /^✓ root +Root$/);
  assert.match(lines[2], /^■ ad +Adapter +#277 · blocked: client$/);
  assert.ok(lines.includes('now: waiting'));
  assert.ok(lines.includes('- hello'));
  assert.ok(lines.length < 12);
});

test('list and help', async () => {
  await flow(['new', 'One', '--id', 'one']);
  await flow(['node', 'one', 'a', '--state', 'done']);
  const r = await flow(['list']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^one +1\/1 +One/m);
  const h = await flow(['help']);
  assert.equal(h.code, 0);
  for (const cmd of ['new', 'node', 'edge', 'note', 'now', 'here', 'show', 'list']) assert.match(h.stdout, new RegExp(`flow ${cmd}`));
  assert.equal((await flow([])).code, 0);
});
