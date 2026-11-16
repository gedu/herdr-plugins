// `npm run setup`: installs agent-todos into Claude Code from this checkout.
// 1. Adds the repo as a marketplace (`herdr-plugins`) and installs the mod for your user.
// 2. Turns on Claude Code's task tools in ~/.claude/settings.json (backup next to it first).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTodoTools, TODO_ENV } from './settings.js';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const claude = (...args) => execFileSync('claude', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function step(label, fn) {
  try {
    const out = fn();
    console.log(`ok       ${label}${out ? ` · ${out}` : ''}`);
  } catch (error) {
    const why = String(error.stderr || error.message).trim().split('\n')[0];
    console.error(`failed   ${label} · ${why}`);
    process.exit(1);
  }
}

step('marketplace herdr-plugins', () => {
  const known = claude('plugin', 'marketplace', 'list');
  if (known.includes('herdr-plugins')) return claude('plugin', 'marketplace', 'update', 'herdr-plugins') && 'updated';
  claude('plugin', 'marketplace', 'add', repo);
  return `added ${repo}`;
});

step('plugin agent-todos', () => {
  claude('plugin', 'install', 'agent-todos@herdr-plugins', '--scope', 'user');
  return 'installed';
});

step(`${TODO_ENV}=1 in settings.json`, () => {
  const file = join(homedir(), '.claude', 'settings.json');
  const current = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const { settings, changed } = withTodoTools(current);
  if (!changed) return 'already set';
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return existsSync(`${file}.bak`) ? 'set (backup: settings.json.bak)' : 'set';
});

console.log('\nRestart Claude Code: the TODOs button shows above the prompt.');
