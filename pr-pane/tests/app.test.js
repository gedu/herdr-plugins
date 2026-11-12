import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { stripAnsi } from '../src/render.js';

const A = { pane: 'w1:p1', terminal: 't1', workspace: 'w1', session: 'payments', app: 'claude', status: 'working', cwd: '/a', focused: true };
const B = { pane: 'w2:p1', terminal: 't2', workspace: 'w2', session: 'docs', app: 'claude', status: 'idle', cwd: '/b', focused: false };
const url = (n) => `https://github.com/o/r/pull/${n}`;
const card = (n, owner) => ({ key: url(n), url: url(n), repo: 'o/r', number: n, owner, agent: owner, loading: true });

function setup({ agents = [A, B], cards = [card(1, A), card(2, B)] } = {}) {
  const calls = [];
  let list = cards;
  const host = {
    agents: async () => agents,
    focus: async (agent) => { calls.push(['focus', agent.pane]); return true; },
    open: async (u) => { calls.push(['open', u]); return true; },
  };
  const tracker = {
    tick: async (_agents, opts) => { calls.push(['tick', Boolean(opts?.force)]); },
    cards: () => list,
    dismiss: (u) => { calls.push(['dismiss', u]); list = list.filter((c) => c.url !== u); },
    lastError: () => '',
  };
  return { app: createApp({ host, tracker }), calls, setAgents: (a) => { agents.length = 0; agents.push(...a); } };
}

const size = { width: 44, height: 30 };

test('enter jumps to the agent session that owns the selected PR', async () => {
  const { app, calls } = setup();
  await app.tick();
  await app.key('down');
  await app.key('enter');
  assert.deepEqual(calls.at(-1), ['focus', 'w2:p1']);
});

test('x dismisses the selected PR and the selection moves on', async () => {
  const { app, calls } = setup();
  await app.tick();
  await app.key('x');
  assert.deepEqual(calls.at(-1), ['dismiss', url(1)]);
  assert.equal(app.state.selected, url(2));
});

test('clicking a card title focuses its session; clicking its ✕ dismisses it', async () => {
  const { app, calls } = setup();
  await app.tick();
  const lines = app.frame(size).map(stripAnsi);
  const row = lines.findIndex((l) => l.includes('o/r #2'));
  await app.click(row, 3, size);
  assert.deepEqual(calls.at(-1), ['focus', 'w2:p1']);
  await app.click(row, size.width - 2, size);
  assert.deepEqual(calls.at(-1), ['dismiss', url(2)]);
});

test('the focused agent sets "this session", and focusing the panel keeps it', async () => {
  const { app, setAgents } = setup();
  await app.tick();
  assert.equal(app.state.sessionPane, 'w1:p1');
  setAgents([{ ...A, focused: false }, B]);
  await app.tick();
  assert.equal(app.state.sessionPane, 'w1:p1');
  setAgents([{ ...A, focused: false }, { ...B, focused: true }]);
  await app.tick();
  assert.equal(app.state.sessionPane, 'w2:p1');
});

test('right opens the detail, left goes back, o opens the PR on GitHub, r refreshes', async () => {
  const { app, calls } = setup();
  await app.tick();
  await app.key('right');
  assert.equal(app.state.view, 'detail');
  await app.key('o');
  assert.deepEqual(calls.at(-1), ['open', url(1)]);
  await app.key('left');
  assert.equal(app.state.view, 'list');
  await app.key('r');
  assert.deepEqual(calls.at(-1), ['tick', true]);
});

test('a Herdr error is shown instead of an empty list', async () => {
  const { app } = setup();
  app.host.agents = async () => { throw new Error('restart the Herdr server'); };
  await app.tick();
  assert.match(app.frame(size).map(stripAnsi).join(' '), /restart the Herdr server/);
});
