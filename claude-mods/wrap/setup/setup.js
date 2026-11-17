// `npm run setup`: installs wrap from this checkout.
// 1. Adds the repo as a marketplace (`herdr-plugins`) and installs the plugin (the hook that
//    loads a brief after /clear or a restart).
// 2. Links wrap.md into ~/.claude/commands, so the command is a plain `/wrap`: commands shipped
//    inside a plugin get its name in front (`/wrap:wrap`).
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
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

step('plugin wrap', () => {
  claude('plugin', 'install', 'wrap@herdr-plugins', '--scope', 'user');
  return 'installed';
});

step('command /wrap', () => {
  const source = join(here, '..', 'wrap.md');
  const target = join(homedir(), '.claude', 'commands', 'wrap.md');
  mkdirSync(dirname(target), { recursive: true });
  let current = null;
  try { current = lstatSync(target); } catch { /* not there yet */ }
  // Never replace a command the person wrote; only our own link is refreshed.
  if (current && !current.isSymbolicLink()) throw new Error(`${target} exists and is not a link; move it away first`);
  if (current && readlinkSync(target) === source) return 'already linked';
  if (current) rmSync(target);
  symlinkSync(source, target);
  return `linked ${target}`;
});

console.log('\nRestart Claude Code: /wrap saves a brief, /clear loads it.');
