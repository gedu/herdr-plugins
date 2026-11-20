// The plugin action: work out which issues the user means, then open the card popup.
// In order: a Control-clicked GitHub URL; the issue references on the focused pane's screen;
// the clipboard. Runs with no terminal, so errors go to the plugin log.
import { execFile } from 'node:child_process';
import { targetOf, parseRemote, refsIn } from './target.js';
import { lookup } from './exists.js';
import { loadCache, saveCache } from './cache.js';

const SCREEN_LINES = '300';
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR || '';

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 10_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => resolve({ code: error ? 1 : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }));
});

const bin = process.env.HERDR_BIN_PATH || 'herdr';
const pluginId = process.env.HERDR_PLUGIN_ID;
if (!pluginId) { console.error('Run this through Herdr: herdr plugin action invoke <plugin-id>.show'); process.exit(2); }

const context = (() => { try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}'); } catch { return {}; } })();
const url = context.clicked_url || process.env.HERDR_PLUGIN_CLICKED_URL || '';
const pane = context.focused_pane_id || null;
const cwd = context.focused_pane_cwd || context.workspace_cwd || null;
const repo = cwd ? parseRemote((await run('git', ['-C', cwd, 'remote', 'get-url', 'origin'])).stdout) : null;

async function screenRefs() {
  if (!pane) return [];
  const r = await run(bin, ['pane', 'read', pane, '--source', 'recent-unwrapped', '--lines', SCREEN_LINES, '--format', 'text']);
  return r.code === 0 ? refsIn(r.stdout, repo) : [];
}

async function clipboardRef() {
  const cmd = process.platform === 'darwin' ? ['pbpaste', []] : ['xclip', ['-selection', 'clipboard', '-o']];
  const r = await run(...cmd);
  const found = r.code === 0 ? targetOf({ selected: r.stdout, repo }) : null;
  return found ? [found] : [];
}

const clicked = targetOf({ url });
let refs = clicked ? [clicked] : await screenRefs();
if (!refs.length) refs = await clipboardRef();
// Answers GitHub gave in the last few minutes are reused, so pressing the key again is quick.
const now = Date.now();
const found = await lookup(refs, run, await loadCache(stateDir), now);
refs = found.refs;
await saveCache(stateDir, found.entries, now);
if (!refs.length) {
  // Nothing to show is not a failure: say so in a corner toast instead of exiting with an error.
  const n = await run(bin, ['notification', 'show', 'No issues found', '--body', 'No existing issue or PR on this screen or in the clipboard.', '--position', 'bottom-right', '--sound', 'none']);
  console.error(`No issue to show. notification: ${n.stderr.trim() || n.stdout.trim()}`);
  process.exit(0);
}

const list = refs.map((r) => `${r.repo}#${r.number}`).join(',');
const r = await run(bin, ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'card',
  '--env', `ISSUE_CARD_REFS=${list}`, '--env', `ISSUE_CARD_REPO=${repo ?? ''}`, '--env', `ISSUE_CARD_CACHE=${stateDir}`]);
if (r.code !== 0) console.error(r.stderr.trim() || r.stdout.trim());
process.exit(r.code);
