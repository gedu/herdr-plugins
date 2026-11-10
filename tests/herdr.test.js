import test from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '../src/herdr.js';

// Answers by the command line it is asked to run.
function fake(answers) {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    for (const [pattern, answer] of answers) if (pattern.test([cmd, ...args].join(' '))) return typeof answer === 'function' ? answer() : answer;
    return { code: 1, stdout: '', stderr: 'unexpected' };
  };
  return { calls, exec };
}

const ok = (value) => ({ code: 0, stdout: typeof value === 'string' ? value : JSON.stringify(value), stderr: '' });

test('agents come from herdr agent list, named after their workspace', async () => {
  const { exec } = fake([
    [/^herdr agent list/, ok({ result: { agents: [
      { agent: 'claude', display_agent: 'Claude', agent_status: 'working', cwd: '/a', focused: true, pane_id: 'w1:p1', terminal_id: 't1', workspace_id: 'w1', terminal_title_stripped: 'Fix login' },
      { agent: 'codex', agent_status: 'idle', cwd: '/b', focused: false, pane_id: 'w2:p3', terminal_id: 't2', workspace_id: 'w2', terminal_title_stripped: 'Docs' },
    ] } })],
    [/^herdr workspace list/, ok({ result: { workspaces: [{ workspace_id: 'w1', label: 'payments' }] } })],
  ]);
  const agents = await createHost({ exec, bin: 'herdr', exists: () => true }).agents();
  assert.deepEqual(agents, [
    { pane: 'w1:p1', terminal: 't1', workspace: 'w1', session: 'payments', title: 'Fix login', app: 'Claude', status: 'working', cwd: '/a', focused: true },
    { pane: 'w2:p3', terminal: 't2', workspace: 'w2', session: 'Docs', title: 'Docs', app: 'codex', status: 'idle', cwd: '/b', focused: false },
  ]);
});

test('a failed agent list is reported, not read as "no agents"', async () => {
  const { exec } = fake([[/^herdr agent list/, { code: 1, stdout: JSON.stringify({ error: { code: 'protocol_mismatch', message: 'restart the Herdr server' } }), stderr: '' }]]);
  await assert.rejects(createHost({ exec, bin: 'herdr', exists: () => true }).agents(), /restart the Herdr server/);
});

test('an error envelope printed on stderr is read for its message', async () => {
  const { exec } = fake([[/^herdr agent list/, { code: 1, stdout: '', stderr: JSON.stringify({ error: { code: 'protocol_mismatch', message: 'client protocol 22 is newer' } }) }]]);
  await assert.rejects(createHost({ exec, bin: 'herdr', exists: () => true }).agents(), (e) => e.message === 'client protocol 22 is newer');
});

test('focus targets the agent pane, then its terminal if that fails', async () => {
  const { exec, calls } = fake([[/agent focus w1:p1/, { code: 1, stdout: '', stderr: 'no' }], [/agent focus t1/, ok('{}')]]);
  assert.equal(await createHost({ exec, bin: 'herdr', exists: () => true }).focus({ pane: 'w1:p1', terminal: 't1' }), true);
  assert.deepEqual(calls, ['herdr agent focus w1:p1', 'herdr agent focus t1']);
});

test('branch helpers read git, and a missing folder means the branch is gone', async () => {
  const { exec } = fake([
    [/branch --show-current/, ok('feat/a\n')],
    [/rev-parse --verify --quiet refs\/heads\/feat\/a$/, ok('abc')],
    [/rev-parse --verify --quiet refs\/heads\/gone$/, { code: 1, stdout: '', stderr: '' }],
    [/remote get-url origin/, ok('git@github.com:o/r.git\n')],
  ]);
  const host = createHost({ exec, bin: 'herdr', exists: (p) => p !== '/deleted' });
  assert.equal(await host.branchOf('/a'), 'feat/a');
  assert.equal(await host.branchExists('/a', 'feat/a'), true);
  assert.equal(await host.branchExists('/a', 'gone'), false);
  assert.equal(await host.branchExists('/deleted', 'feat/a'), false);
  assert.equal(await host.remoteOf('/a'), 'o/r');
});

test('detached HEAD reads as an unknown branch', async () => {
  const { exec } = fake([[/branch --show-current/, ok('\n')]]);
  assert.equal(await createHost({ exec, bin: 'herdr', exists: () => true }).branchOf('/a'), null);
});

test('only github.com https links reach the system opener', async () => {
  const { exec, calls } = fake([[/^open /, ok('')]]);
  const host = createHost({ exec, bin: 'herdr', exists: () => true, platform: 'darwin' });
  assert.equal(await host.open('https://github.com/o/r/pull/7'), true);
  assert.equal(await host.open('https://evil.example/x'), false);
  assert.equal(await host.open('file:///etc/passwd'), false);
  assert.deepEqual(calls, ['open https://github.com/o/r/pull/7']);
});
