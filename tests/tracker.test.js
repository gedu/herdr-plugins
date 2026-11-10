import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../src/tracker.js';

const URL = 'https://github.com/o/r/pull/7';
const NOW = Date.parse('2026-11-10T12:00:00Z');

const pr = (over = {}) => ({
  number: 7, title: 'Add retry', body: '', url: URL, state: 'OPEN', isDraft: false, headRefName: 'feat/a', headRefOid: 'abc', baseRefName: 'main',
  statusCheckRollup: [], reviewDecision: '', latestReviews: [], mergeStateStatus: 'CLEAN', mergeable: 'MERGEABLE',
  createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T11:00:00Z', mergedAt: null, closedAt: null, mergeCommit: null, ...over,
});

// A world the tracker reads: agents with folders, each folder's branch, which local branches exist.
function world() {
  const w = {
    branches: { '/a': 'feat/a', '/b': 'feat/a' },
    local: { '/a': new Set(['feat/a', 'main']), '/b': new Set(['feat/a', 'main']) },
    prs: { 'o/r:feat/a': URL },
    pr: pr(),
    discovers: 0,
    saved: null,
  };
  w.gh = {
    discover: async (repo, branch) => { w.discovers++; return w.prs[`${repo}:${branch}`] ?? null; },
    fetchPr: async () => w.pr,
    fetchThreads: async () => ({ threads: [], issues: [], headCommittedAt: null }),
    fetchRuns: async () => [],
    fetchJobs: async () => [],
  };
  w.store = { load: () => w.saved ?? {}, save: (data) => { w.saved = JSON.parse(JSON.stringify(data)); } };
  w.tracker = (now = () => NOW) => createTracker({
    gh: w.gh,
    remoteOf: async () => 'o/r',
    branchOf: async (cwd) => w.branches[cwd] ?? null,
    branchExists: async (cwd, branch) => (w.local[cwd] ? w.local[cwd].has(branch) : null),
    store: w.store,
    settings: { pollMs: 30_000, ciWaitMs: 120_000, aiChecks: [] },
    now,
  });
  return w;
}

const agent = (over = {}) => ({ pane: 'w1:p1', terminal: 't1', workspace: 'w1', session: 'payments', app: 'claude', status: 'working', cwd: '/a', focused: false, ...over });

test('a PR found on an agent branch records that agent as its owner', async () => {
  const w = world(), t = w.tracker();
  await t.tick([agent()]);
  const [card] = t.cards();
  assert.equal(card.url, URL);
  assert.equal(card.owner.pane, 'w1:p1');
  assert.equal(card.owner.session, 'payments');
  assert.equal(card.agent.pane, 'w1:p1');
  assert.equal(w.saved.tracked[URL].owner.pane, 'w1:p1');
});

test('the PR leaves when its owner switches to another branch', async () => {
  const w = world(), t = w.tracker();
  await t.tick([agent()]);
  w.branches['/a'] = 'feat/other';
  await t.tick([agent()]);
  assert.deepEqual(t.cards(), []);
  assert.equal(w.saved.tracked[URL], undefined);
});

test('the PR stays while the owner branch cannot be read', async () => {
  const w = world(), t = w.tracker();
  await t.tick([agent()]);
  w.branches['/a'] = null;
  await t.tick([agent()]);
  assert.equal(t.cards().length, 1);
});

test('when the owner leaves but another agent is on the branch, that agent takes over', async () => {
  const w = world(), t = w.tracker();
  await t.tick([agent()]);
  w.branches['/a'] = 'feat/other';
  await t.tick([agent(), agent({ pane: 'w2:p1', terminal: 't2', workspace: 'w2', session: 'review', cwd: '/b' })]);
  const [card] = t.cards();
  assert.equal(card.owner.pane, 'w2:p1');
  assert.equal(card.agent.session, 'review');
});

test('the PR leaves when its local branch is deleted, and is not found again', async () => {
  const w = world(), t = w.tracker();
  await t.tick([agent()]);
  w.local['/a'].delete('feat/a');
  await t.tick([agent()]);
  assert.deepEqual(t.cards(), []);
  w.local['/a'].add('feat/a');
  await t.tick([agent()], { force: true });
  assert.deepEqual(t.cards(), []);
});

test('a dismissed PR leaves and is not rediscovered, even after a restart', async () => {
  const w = world(), t = w.tracker();
  await t.tick([agent()]);
  t.dismiss(URL);
  assert.deepEqual(t.cards(), []);
  let later = NOW + 10 * 60_000;
  const again = w.tracker(() => later);
  await again.tick([agent({ status: 'idle' })]);
  later += 10 * 60_000;
  await again.tick([agent({ status: 'idle' })]);
  assert.deepEqual(again.cards(), []);
  assert.ok(w.saved.dismissed.includes(URL));
});

test('a closed PR leaves the list, as before', async () => {
  const w = world(), t = w.tracker();
  w.pr = pr({ state: 'CLOSED', closedAt: '2026-11-10T11:30:00Z' });
  await t.tick([agent()]);
  assert.deepEqual(t.cards(), []);
});

test('a PR whose owner pane closed stays listed without an agent', async () => {
  const w = world(), t = w.tracker();
  await t.tick([agent()]);
  await t.tick([]);
  const [card] = t.cards();
  assert.equal(card.agent, null);
  assert.equal(card.owner.session, 'payments');
});
