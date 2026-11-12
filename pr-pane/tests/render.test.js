import test from 'node:test';
import assert from 'node:assert/strict';
import { render, visibleWidth, stripAnsi, listOrder } from '../src/render.js';
import { prState } from '../src/status.js';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const settings = { ciWaitMs: 120_000, aiChecks: [] };

function card(n, { session = 'payments', pane = 'w1:p1', status = 'working', title = `PR ${n}`, over = {} } = {}) {
  const pr = {
    number: n, title, url: `https://github.com/o/r/pull/${n}`, state: 'OPEN', isDraft: false, headRefName: `feat/${n}`, baseRefName: 'main',
    statusCheckRollup: [{ __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS', completedAt: '2026-11-10T11:50:00Z' }],
    reviewDecision: 'APPROVED', latestReviews: [{ state: 'APPROVED', author: { login: 'dana' }, submittedAt: '2026-11-10T11:55:00Z' }],
    mergeStateStatus: 'CLEAN', mergeable: 'MERGEABLE', createdAt: '2026-11-10T09:00:00Z', updatedAt: '2026-11-10T11:00:00Z', ...over,
  };
  const owner = { pane, terminal: `t-${pane}`, workspace: pane.split(':')[0], session, app: 'claude', cwd: '/a' };
  return {
    key: pr.url, url: pr.url, repo: 'o/r', number: n, branch: pr.headRefName, owner, agent: status ? { ...owner, status } : null,
    pr, threads: [], issues: [], status: prState(pr, { now: NOW, headSeenAt: NOW - 3_600_000, threads: [] }, settings), flow: null,
  };
}

const plain = (out) => out.lines.map(stripAnsi);

test('the focused session comes first, then every other session under its own name', () => {
  const cards = [card(1, { session: 'docs', pane: 'w2:p1' }), card(2), card(3, { session: 'docs', pane: 'w2:p1' })];
  const text = plain(render({ cards, sessionPane: 'w1:p1', view: 'list' }, { width: 44, height: 40, now: NOW })).join('\n');
  assert.ok(text.indexOf('THIS SESSION') < text.indexOf('PR 2'));
  assert.ok(text.indexOf('PR 2') < text.indexOf('docs'));
  assert.ok(text.indexOf('docs') < text.indexOf('PR 1'));
  assert.deepEqual(listOrder(cards, 'w1:p1').map((c) => c.number), [2, 1, 3]);
});

test('a session with no PR says so', () => {
  const text = plain(render({ cards: [card(1, { session: 'docs', pane: 'w2:p1' })], sessionPane: 'w9:p9', view: 'list' }, { width: 44, height: 40, now: NOW })).join('\n');
  assert.match(text, /No PR in this session/);
});

test('every card names its agent session and has a colored status dot', () => {
  const out = render({ cards: [card(2)], sessionPane: 'w1:p1', view: 'list' }, { width: 44, height: 40, now: NOW });
  const text = plain(out).join('\n');
  assert.match(text, /claude · payments/);
  assert.ok(out.lines.some((l) => l.includes('\x1b[32m●')), 'a ready PR has a green dot');
});

test('the card title row is a click target for its session, and its ✕ dismisses it', () => {
  const out = render({ cards: [card(2)], sessionPane: 'w1:p1', view: 'list' }, { width: 44, height: 40, now: NOW });
  const row = plain(out).findIndex((l) => l.includes('PR 2'));
  const go = out.hits.find((h) => h.row === row && h.action === 'go');
  const x = out.hits.find((h) => h.row === row && h.action === 'dismiss');
  assert.equal(go.url, 'https://github.com/o/r/pull/2');
  assert.equal(x.url, 'https://github.com/o/r/pull/2');
  assert.equal(plain(out)[row].slice(x.from, x.to).trim(), '✕');
});

test('the detail view draws the timeline with marks joined by lines', () => {
  const text = plain(render({ cards: [card(2)], sessionPane: 'w1:p1', view: 'detail', selected: 'https://github.com/o/r/pull/2' }, { width: 44, height: 40, now: NOW }));
  const at = (label) => text.findIndex((l) => l.includes(label));
  assert.match(text[at('PR opened')], /✓ PR opened/);
  assert.match(text[at('CI passed')], /✓ CI passed/);
  assert.match(text[at('Approved')], /✓ Approved/);
  assert.match(text[at('PR opened') + 1], /│/);
  assert.match(text.join('\n'), /feat\/2 → main/);
  assert.match(text.join('\n'), /claude · payments · working/);
});

test('no line is wider than the pane, even with wide titles', () => {
  const cards = [card(2, { title: '결제 재시도 백오프 추가 및 아주 긴 제목 '.repeat(4) })];
  for (const view of ['list', 'detail']) {
    const out = render({ cards, sessionPane: 'w1:p1', view, selected: cards[0].url }, { width: 30, height: 40, now: NOW });
    for (const l of out.lines) assert.ok(visibleWidth(stripAnsi(l)) <= 30, `${view}: ${stripAnsi(l)}`);
  }
});

test('errors from Herdr are shown in the pane', () => {
  const text = plain(render({ cards: [], view: 'list', error: 'client protocol 22 is newer than server protocol 17' }, { width: 40, height: 20, now: NOW })).join(' ');
  assert.match(text, /protocol 22/);
});

test('the output fits the pane height', () => {
  const cards = Array.from({ length: 30 }, (_, i) => card(i + 1));
  const out = render({ cards, sessionPane: 'w1:p1', view: 'list', selected: cards[29].url }, { width: 40, height: 15, now: NOW });
  assert.equal(out.lines.length, 15);
  assert.ok(plain(out).some((l) => l.includes('PR 30')), 'the selected card is scrolled into view');
});

test('no escape sequence or bidi control from GitHub or Herdr data reaches the screen', () => {
  const evil = 'x\x1b]8;;https://evil.example\x07CLICK\x1b]8;;\x07\x1b[2J\x07‮RLO';
  const merged = card(4, { over: { state: 'MERGED', mergedAt: '2026-11-10T11:58:00Z', mergeCommit: { oid: 'abc' }, baseRefName: `main${evil}`, headRefName: `feat${evil}` } });
  merged.flow = { runs: [{ id: 1, name: `wf${evil}`, status: 'in_progress', conclusion: null, updatedAt: '2026-11-10T11:59:00Z' }], jobs: {}, active: true };
  merged.agent.app = `claude${evil}`;
  merged.owner.app = merged.agent.app;
  for (const view of ['list', 'detail']) {
    const out = render({ cards: [merged], sessionPane: 'w1:p1', view, selected: merged.url }, { width: 60, height: 40, now: NOW });
    for (const line of out.lines) {
      const text = stripAnsi(line);
      assert.doesNotMatch(text, /[\x00-\x1f\x7f‪-‮⁦-⁩]/, `${view}: ${JSON.stringify(text)}`);
      assert.doesNotMatch(line, /\x1b\]/, `${view}: OSC leaked`);
    }
  }
});

test('the footer shows every key hint when the pane is wide enough', () => {
  const list = plain(render({ cards: [card(2)], sessionPane: 'w1:p1', view: 'list' }, { width: 60, height: 20, now: NOW }));
  assert.equal(list.at(-1).trimEnd(), ' ↵ go · → info · x hide · o web · r refresh');
  const detail = plain(render({ cards: [card(2)], sessionPane: 'w1:p1', view: 'detail', selected: card(2).url }, { width: 60, height: 40, now: NOW }));
  assert.equal(detail.at(-1).trimEnd(), ' ← back · ↵ go · o web · x hide');
});

test('a narrow footer drops whole hints from the end instead of cutting one', () => {
  for (const width of [12, 20, 26, 34, 40]) {
    const foot = plain(render({ cards: [card(2)], sessionPane: 'w1:p1', view: 'list' }, { width, height: 20, now: NOW })).at(-1).trimEnd();
    assert.ok(visibleWidth(foot) <= width, `width ${width}: ${foot}`);
    assert.ok(!foot.includes('…'), `width ${width} cut a hint: ${foot}`);
    assert.ok(foot.startsWith(' ↵ go'), `width ${width} lost the first hint: ${foot}`);
    assert.match(foot, /^( \S+ \w+)( · \S+ \w+)*$/, `width ${width}: ${foot}`);
  }
});
