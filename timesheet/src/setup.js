// Save the Productive token without editing JSON by hand:
//   npm run setup                      (asks for the token, hidden)
//   pbpaste | npm run setup            (reads it from stdin)
//   npm run setup -- --org 52239       (organization id, when none is saved yet)
// The token is checked against Productive before anything is written.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { run } from './sources.js';
import { productive } from './productive.js';

export function mergeConfig(existing, { token, organizationId }) {
  const clean = String(token ?? '').trim();
  if (!clean) throw new Error('The token is empty');
  const org = String(organizationId || existing.organization_id || '').trim();
  if (!/^\d+$/.test(org)) throw new Error('The organization id must be a number (the one in app.productive.io/<id>-...)');
  return { roots: ['~/Documents'], remind_hour: 17, ...existing, token: clean, organization_id: org };
}

async function configDir() {
  const dir = process.env.TIMESHEET_CONFIG_DIR || process.env.HERDR_PLUGIN_CONFIG_DIR
    || (await run(process.env.HERDR_BIN_PATH || 'herdr', ['plugin', 'config-dir', 'gedu.timesheet'])).stdout.trim().split('\n').at(-1);
  if (!dir) throw new Error('Could not find the plugin config dir. Link the plugin first: herdr plugin link ./timesheet');
  return dir;
}

function hiddenInput(prompt) {
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    let value = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { done(); return resolve(value); }
        if (ch === '\x03') { done(); return reject(new Error('Cancelled')); }
        if (ch === '\x7f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    const done = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    process.stdin.on('data', onData);
  });
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const orgArg = args.includes('--org') ? args[args.indexOf('--org') + 1] : '';
  const dir = await configDir();
  const file = join(dir, 'config.json');
  const existing = await readFile(file, 'utf8').then(JSON.parse, () => ({}));

  const token = process.stdin.isTTY ? await hiddenInput('Productive API token (hidden): ') : await readStdin();
  let organizationId = orgArg;
  if (!organizationId && !existing.organization_id) {
    if (!process.stdin.isTTY) throw new Error('No organization id saved yet: add --org <id>');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    organizationId = await rl.question('Organization id (the number in app.productive.io/<id>-...): ');
    rl.close();
  }
  const config = mergeConfig(existing, { token, organizationId });

  const email = config.email || (await run('git', ['config', '--global', 'user.email'])).stdout.trim();
  process.stdout.write('Checking the token with Productive… ');
  const personId = await productive({ token: config.token, organizationId: config.organization_id }).personId(email);
  process.stdout.write(`ok (person ${personId})\n`);

  await mkdir(dir, { recursive: true });
  await writeFile(`${file}.tmp`, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await rename(`${file}.tmp`, file);
  console.log(`Saved to ${file}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`\n✗ ${e.message}. Nothing was saved.`); process.exit(1); });
}
