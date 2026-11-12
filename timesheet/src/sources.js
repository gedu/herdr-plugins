// Side effects behind the popup and the reminder: config, git/gh evidence, and the drafting model.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { jiraKeys, cleanBullets, draftPrompt } from './day.js';

// stdin is closed on purpose: `claude -p` with an open stdin pipe pulls in ~150k tokens of
// extra context (measured: $0.0005 vs $0.01-0.16 per draft).
export const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  const child = execFile(cmd, args, { timeout: 60_000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', ...opts }, (error, stdout, stderr) => resolve({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }));
  child.stdin?.end();
});

const home = (p) => p.replace(/^~(?=$|\/)/, homedir());

// config.json in HERDR_PLUGIN_CONFIG_DIR: { token, organization_id, email?, roots? }.
export async function loadConfig() {
  const dir = process.env.HERDR_PLUGIN_CONFIG_DIR;
  const file = dir ? join(dir, 'config.json') : null;
  let raw = {};
  try { raw = JSON.parse(await readFile(file, 'utf8')); } catch { /* missing or invalid: reported below */ }
  const email = raw.email || (await run('git', ['config', '--global', 'user.email'])).stdout.trim();
  const config = { token: raw.token, organizationId: raw.organization_id, email, roots: (raw.roots ?? ["~/Documents"]).map(home), remindHour: raw.remind_hour, file };
  config.problem = !raw.token || !raw.organization_id
    ? `Add "token" and "organization_id" to ${file ?? 'config.json in the plugin config dir'}`
    : !email ? 'Set "email" in config.json or git config --global user.email' : null;
  return config;
}

async function repos(roots) {
  const found = await Promise.all(roots.map((root) => run('find', [root, '-maxdepth', '4', '-type', 'd', '-name', '.git', '-prune'])));
  return [...new Set(found.flatMap((r) => r.stdout.split('\n').filter(Boolean).map((g) => g.replace(/\/\.git$/, ''))))];
}

export async function evidence({ date, email, roots }) {
  const list = await repos(roots);
  const logs = await Promise.all(list.map(async (repo) => {
    const r = await run('git', ['-C', repo, 'log', '--all', `--author=${email}`, `--since=${date} 00:00`, `--until=${date} 23:59:59`, '--format=%s'], { timeout: 20_000 });
    return [...new Set(r.stdout.split('\n').filter(Boolean))].map((subject) => ({ repo: basename(repo), subject }));
  }));
  const commits = logs.flat();
  const gh = await run('gh', ['search', 'prs', '--author=@me', `--updated=${date}`, '--json', 'title,number,repository', '--limit', '30'], { timeout: 20_000 });
  let prs = [];
  try { prs = JSON.parse(gh.stdout).map((p) => ({ repo: p.repository?.nameWithOwner ?? '', number: p.number, title: p.title })); } catch { /* gh missing or offline: commits still count */ }
  return { commits, prs, jira: jiraKeys([...commits.map((c) => c.subject), ...prs.map((p) => p.title)]) };
}

const claudeBin = () => process.env.TIMESHEET_CLAUDE_BIN
  || [join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude'].find(existsSync) || 'claude';

const SCHEMA = JSON.stringify({ type: 'object', properties: { bullets: { type: 'array', items: { type: 'string' } } }, required: ['bullets'] });

// No settings, no tools, the smallest model: a draft costs about $0.001.
export async function draft(input) {
  const r = await run(claudeBin(), ['-p', draftPrompt(input), '--model', 'claude-haiku-5-5', '--setting-sources', '', '--tools', '',
    '--system-prompt', 'You write terse daily time-sheet notes from git evidence.', '--json-schema', SCHEMA,
    '--output-format', 'json', '--no-session-persistence'], { timeout: 90_000 });
  let out;
  try { out = JSON.parse(r.stdout); } catch { throw new Error(`claude: ${(r.stderr || r.stdout).trim().split('\n')[0] || 'no output'}`); }
  if (out.is_error) throw new Error(`claude: ${String(out.result).slice(0, 160)}`);
  return { bullets: cleanBullets(out.structured_output?.bullets), cost: out.total_cost_usd ?? 0 };
}
