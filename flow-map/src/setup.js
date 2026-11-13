// `npm run setup`: puts `flow` on the PATH and installs the agent skill, as symlinks to this
// checkout, so a `git pull` updates both. Never replaces a file it did not create.
import { lstat, mkdir, readlink, symlink, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function links(home = homedir()) {
  const skill = join(root, 'skill', 'flow-map');
  return [
    { from: join(root, 'src', 'cli.js'), to: join(home, '.local', 'bin', 'flow') },
    { from: skill, to: join(home, '.claude', 'skills', 'flow-map') },
    { from: skill, to: join(home, '.agents', 'skills', 'flow-map') },
  ];
}

// 'created' | 'ok' (already ours) | 'skipped: …' (something else is there)
export async function link({ from, to }) {
  const existing = await lstat(to).catch(() => null);
  if (existing) {
    if (!existing.isSymbolicLink()) return `skipped: ${to} exists and is not a link`;
    const target = await readlink(to);
    return target === from ? 'ok' : `skipped: ${to} points to ${target}`;
  }
  await mkdir(dirname(to), { recursive: true });
  await symlink(from, to);
  return 'created';
}

async function main() {
  await chmod(join(root, 'src', 'cli.js'), 0o755);
  let problems = 0;
  for (const one of links()) {
    const result = await link(one);
    if (result.startsWith('skipped')) problems += 1;
    console.log(`${result.padEnd(8)} ${one.to}`);
  }
  if (!(process.env.PATH ?? '').split(':').includes(join(homedir(), '.local', 'bin'))) {
    console.log('note: add ~/.local/bin to your PATH so agents can run `flow`');
  }
  process.exit(problems ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
