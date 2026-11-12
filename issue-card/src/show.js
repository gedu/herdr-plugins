// The plugin action: work out which issue the user pointed at (a Control-clicked GitHub URL, or
// selected text), then open the card popup for it. Runs with no terminal; errors go to the plugin log.
import { execFile } from 'node:child_process';
import { targetOf, parseRemote } from './target.js';

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 10_000, encoding: 'utf8' }, (error, stdout, stderr) => resolve({ code: error ? 1 : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }));
});

const bin = process.env.HERDR_BIN_PATH || 'herdr';
const pluginId = process.env.HERDR_PLUGIN_ID;
if (!pluginId) { console.error('Run this through Herdr: herdr plugin action invoke <plugin-id>.show'); process.exit(2); }

const context = (() => { try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}'); } catch { return {}; } })();
const url = context.clicked_url || process.env.HERDR_PLUGIN_CLICKED_URL || '';
const selected = context.selected_text ?? context.selection ?? process.env.HERDR_PLUGIN_SELECTED_TEXT ?? '';
const cwd = context.focused_pane_cwd || context.workspace_cwd || null;
const repo = cwd ? parseRemote((await run('git', ['-C', cwd, 'remote', 'get-url', 'origin'])).stdout) : null;

const found = targetOf({ url, selected, repo });
if (!found) {
  console.error(`No issue to show. clicked=${JSON.stringify(url)} selected=${JSON.stringify(selected)} repo=${repo} context keys=${Object.keys(context).join(',')}`);
  process.exit(1);
}

const r = await run(bin, ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'card',
  '--env', `ISSUE_CARD_REPO=${found.repo}`, '--env', `ISSUE_CARD_NUMBER=${found.number}`]);
if (r.code !== 0) console.error(r.stderr.trim() || r.stdout.trim());
process.exit(r.code);
