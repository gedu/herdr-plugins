// The hook behind every trigger: rename each tab after its agent's checkout.
// Whatever event fired, it reconciles all tabs, so a missed event heals on the next one.
// Runs are serialized with a lock dir because events arrive in bursts (focus, status).
import { execFile } from 'node:child_process';
import { mkdir, rm, stat, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { labelFor, plan } from './name.js';

const bin = process.env.HERDR_BIN_PATH || 'herdr';
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;
if (!stateDir) { console.error('Run this through Herdr (it is a plugin event hook).'); process.exit(2); }
const ownedFile = join(stateDir, 'owned.json');
const lockDir = join(stateDir, 'sync.lock');

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 10_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => resolve(error ? null : String(stdout)));
});

const api = async (args, key) => {
  const out = await run(bin, args);
  try { return JSON.parse(out).result[key] ?? []; } catch { return []; }
};

async function gitLabel(dir) {
  const out = await run('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir']);
  if (!out) return null;
  const [top, common] = out.trim().split('\n');
  const repoRoot = basename(common) === '.git' ? dirname(common) : top;
  const branch = ((await run('git', ['-C', dir, 'branch', '--show-current'])) ?? '').trim();
  return labelFor({ repoRoot, top, branch });
}

async function withLock(fn) {
  await mkdir(stateDir, { recursive: true });
  for (let i = 0; i < 50; i++) {
    try { await mkdir(lockDir); break; } catch {
      const age = await stat(lockDir).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > 15_000) await rm(lockDir, { recursive: true, force: true });
      else await new Promise((r) => setTimeout(r, 100));
    }
  }
  try { return await fn(); } finally { await rm(lockDir, { recursive: true, force: true }); }
}

await withLock(async () => {
  const [tabs, panes] = await Promise.all([api(['tab', 'list'], 'tabs'), api(['pane', 'list'], 'panes')]);
  const owned = await readFile(ownedFile, 'utf8').then(JSON.parse, () => ({}));
  const dirs = [...new Set(panes.filter((p) => p.agent).map((p) => p.foreground_cwd || p.cwd).filter(Boolean))];
  const labels = Object.fromEntries((await Promise.all(dirs.map(async (d) => [d, await gitLabel(d)]))).filter(([, l]) => l));
  const result = plan({ tabs, panes, labels, owned });
  const failed = new Set();
  for (const { tab_id, label } of result.renames) {
    if ((await run(bin, ['tab', 'rename', tab_id, label])) === null) { failed.add(tab_id); console.error(`rename ${tab_id} -> ${label} failed`); }
  }
  for (const id of failed) { if (owned[id]) result.owned[id] = owned[id]; else delete result.owned[id]; }
  await writeFile(`${ownedFile}.tmp`, JSON.stringify(result.owned, null, 2));
  await rename(`${ownedFile}.tmp`, ownedFile);
});
