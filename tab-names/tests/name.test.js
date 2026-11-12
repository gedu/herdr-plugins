import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortRepo, labelFor, isDefaultLabel, plan } from '../src/name.js';

test('shortRepo keeps short repo names and abbreviates long ones to initials', () => {
  assert.equal(shortRepo('food-revolution-network'), 'frn');
  assert.equal(shortRepo('herdr-plugins'), 'herdr-plugins');
  assert.equal(shortRepo('my_long_repo_name'), 'mlrn');
  assert.equal(shortRepo('api'), 'api');
});

test('labelFor uses the worktree folder in a linked worktree', () => {
  const git = { repoRoot: '/x/food-revolution-network', top: '/x/food-revolution-network-worktrees/issue-436', branch: 'issue/436' };
  assert.equal(labelFor(git), 'frn · issue-436');
});

test('labelFor uses the branch in the main checkout', () => {
  assert.equal(labelFor({ repoRoot: '/x/herdr-plugins', top: '/x/herdr-plugins', branch: 'main' }), 'herdr-plugins · main');
});

test('labelFor falls back to the folder when the main checkout is detached', () => {
  assert.equal(labelFor({ repoRoot: '/x/api', top: '/x/api', branch: '' }), 'api');
});

test('labelFor truncates long labels', () => {
  const label = labelFor({ repoRoot: '/x/api', top: '/x/api', branch: 'feature/a-very-long-branch-name-that-goes-on' });
  assert.equal(label.length, 32);
  assert.ok(label.endsWith('…'));
});

test('isDefaultLabel is true only for the digits Herdr assigns', () => {
  assert.equal(isDefaultLabel('3'), true);
  assert.equal(isDefaultLabel('12'), true);
  assert.equal(isDefaultLabel('EAS'), false);
  assert.equal(isDefaultLabel(''), false);
});

const agentPane = (over = {}) => ({ pane_id: 'w1:p1', tab_id: 'w1:t1', agent: 'claude', focused: false, foreground_cwd: '/wt/issue-436', cwd: '/repo', ...over });
const labels = { '/wt/issue-436': 'frn · issue-436', '/wt/chore-408': 'frn · chore-408' };

test('plan renames a tab that still has its default label, from the agent foreground_cwd', () => {
  const result = plan({ tabs: [{ tab_id: 'w1:t1', label: '1' }], panes: [agentPane()], labels, owned: {} });
  assert.deepEqual(result.renames, [{ tab_id: 'w1:t1', label: 'frn · issue-436' }]);
  assert.deepEqual(result.owned, { 'w1:t1': 'frn · issue-436' });
});

test('plan never touches a tab name set by hand', () => {
  const result = plan({ tabs: [{ tab_id: 'w1:t1', label: 'EAS' }], panes: [agentPane()], labels, owned: {} });
  assert.deepEqual(result.renames, []);
  assert.deepEqual(result.owned, {});
});

test('plan stops owning a tab once the user renames it', () => {
  const result = plan({ tabs: [{ tab_id: 'w1:t1', label: 'mine' }], panes: [agentPane()], labels, owned: { 'w1:t1': 'frn · old' } });
  assert.deepEqual(result.renames, []);
  assert.deepEqual(result.owned, {});
});

test('plan follows the agent into another worktree on a tab it named', () => {
  const result = plan({ tabs: [{ tab_id: 'w1:t1', label: 'frn · issue-436' }], panes: [agentPane({ foreground_cwd: '/wt/chore-408' })], labels, owned: { 'w1:t1': 'frn · issue-436' } });
  assert.deepEqual(result.renames, [{ tab_id: 'w1:t1', label: 'frn · chore-408' }]);
});

test('plan does nothing when the label is already right', () => {
  const result = plan({ tabs: [{ tab_id: 'w1:t1', label: 'frn · issue-436' }], panes: [agentPane()], labels, owned: { 'w1:t1': 'frn · issue-436' } });
  assert.deepEqual(result.renames, []);
  assert.deepEqual(result.owned, { 'w1:t1': 'frn · issue-436' });
});

test('plan skips tabs without an agent and folders outside git', () => {
  const tabs = [{ tab_id: 'w1:t1', label: '1' }, { tab_id: 'w1:t2', label: '2' }];
  const panes = [agentPane({ agent: undefined }), agentPane({ pane_id: 'w1:p2', tab_id: 'w1:t2', foreground_cwd: '/tmp' })];
  assert.deepEqual(plan({ tabs, panes, labels, owned: {} }).renames, []);
});

test('plan prefers the focused agent pane when a tab has several', () => {
  const panes = [agentPane(), agentPane({ pane_id: 'w1:p2', foreground_cwd: '/wt/chore-408', focused: true })];
  const result = plan({ tabs: [{ tab_id: 'w1:t1', label: '1' }], panes, labels, owned: {} });
  assert.deepEqual(result.renames, [{ tab_id: 'w1:t1', label: 'frn · chore-408' }]);
});

test('plan forgets tabs that no longer exist', () => {
  const result = plan({ tabs: [], panes: [], labels, owned: { 'w9:t9': 'x · y' } });
  assert.deepEqual(result.owned, {});
});
