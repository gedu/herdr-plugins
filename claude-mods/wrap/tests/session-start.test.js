import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hook = new URL('../src/session-start.js', import.meta.url).pathname;
const run = (dir, input) => execFileSync('node', [hook], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_WRAP_DIR: dir }, encoding: 'utf8' });

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('after /clear it loads the folder handoff once and moves it to used/', () => withDir((dir) => {
  writeFileSync(join(dir, 'h.md'), '---\ncwd: /repo/a\n---\n# Next\nFinish T3\n');
  const out = JSON.parse(run(dir, { source: 'clear', cwd: '/repo/a' }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /# Next\nFinish T3/);
  assert.equal(out.systemMessage, 'Wrap loaded: h.md');
  assert.ok(existsSync(join(dir, 'used', 'h.md')));
  assert.ok(!existsSync(join(dir, 'h.md')));
  assert.equal(run(dir, { source: 'clear', cwd: '/repo/a' }), '');
}));

test('resume and compact keep their own context and leave the handoff in place', () => withDir((dir) => {
  writeFileSync(join(dir, 'h.md'), '---\ncwd: /repo/a\n---\nbody\n');
  assert.equal(run(dir, { source: 'resume', cwd: '/repo/a' }), '');
  assert.equal(run(dir, { source: 'compact', cwd: '/repo/a' }), '');
  assert.ok(existsSync(join(dir, 'h.md')));
}));

test('a missing folder or bad input starts the session without a handoff', () => withDir((dir) => {
  assert.equal(run(join(dir, 'nope'), { source: 'clear', cwd: '/repo/a' }), '');
  assert.equal(execFileSync('node', [hook], { input: 'not json', env: { ...process.env, CLAUDE_WRAP_DIR: dir }, encoding: 'utf8' }), '');
}));
