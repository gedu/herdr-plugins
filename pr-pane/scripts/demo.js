// Draws the panel with made-up data, in color, so it can be seen without Herdr or GitHub.
// Usage: node scripts/demo.js [width]
import { render } from '../src/render.js';
import { prState } from '../src/status.js';

const NOW = Date.now();
const ago = (m) => new Date(NOW - m * 60_000).toISOString();
const settings = { ciWaitMs: 120_000, aiChecks: [] };
const check = (name, conclusion, status = 'COMPLETED') => ({ __typename: 'CheckRun', name, status, conclusion, completedAt: ago(9) });

function card(n, title, repo, session, pane, agentStatus, over = {}, extra = {}) {
  const pr = {
    number: n, title, url: `https://github.com/${repo}/pull/${n}`, state: 'OPEN', isDraft: false, headRefName: `feat/${n}`, baseRefName: 'main',
    statusCheckRollup: [check('build', 'SUCCESS'), check('test', 'SUCCESS')], reviewDecision: 'APPROVED',
    latestReviews: [{ state: 'APPROVED', author: { login: 'dana' }, submittedAt: ago(5) }], mergeStateStatus: 'CLEAN', mergeable: 'MERGEABLE',
    createdAt: ago(180), updatedAt: ago(n % 60), ...over,
  };
  const owner = { pane, session, app: 'claude' };
  return {
    url: pr.url, repo, number: n, owner, agent: { ...owner, status: agentStatus }, pr, threads: [], issues: [],
    status: prState(pr, { now: NOW, headSeenAt: NOW - 3_600_000, threads: [] }, settings), flow: null, ...extra,
  };
}

const cards = [
  card(482, 'Retry failed payments with backoff', 'acme/shop-api', 'payments', 'w1:p1', 'working', {}, { issues: [{ number: 470, title: 'Failed payments are never retried', state: 'OPEN' }] }),
  card(1093, 'Filter orders by date range', 'acme/admin-web', 'admin-web', 'w2:p1', 'idle', { statusCheckRollup: [check('build', 'SUCCESS'), check('e2e', 'FAILURE')], reviewDecision: 'REVIEW_REQUIRED', latestReviews: [] }),
  card(318, 'Remember the last login method', 'acme/mobile', 'mobile', 'w3:p1', 'blocked', { statusCheckRollup: [check('build', null, 'IN_PROGRESS'), check('lint', 'SUCCESS')], reviewDecision: 'REVIEW_REQUIRED', latestReviews: [] }),
  card(77, 'Show delivery logs to support', 'acme/notify', 'mobile', 'w3:p1', 'blocked', { state: 'MERGED', mergedAt: ago(2), mergeCommit: { oid: 'm1' } }, {
    flow: { runs: [{ id: 11, name: 'Deploy Production', status: 'in_progress', conclusion: null, updatedAt: ago(1) }], jobs: { 11: { jobs: [{ id: 1, name: 'deploy', status: 'in_progress', steps: [{ number: 1, name: 'Build', status: 'completed', conclusion: 'success' }, { number: 2, name: 'Push image', status: 'in_progress' }, { number: 3, name: 'Roll out', status: 'pending' }] }] } }, active: true },
  }),
];

const width = Number(process.argv[2]) || 44;
const show = (view) => {
  const lines = render({ cards, sessionPane: 'w1:p1', sessionName: 'payments', view, selected: cards[0].url }, { width, height: view === 'list' ? 24 : 26, now: NOW }).lines;
  process.stdout.write(`${lines.join('\n')}\n\n`);
};
show('list');
show('detail');
