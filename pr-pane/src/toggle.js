// The plugin action: close the PR panel when it is open, otherwise open it on the right of the
// focused pane. There is one panel at a time, so GitHub is polled once.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execProgram } from './herdr.js';

const bin = process.env.HERDR_BIN_PATH || 'herdr';
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;
const pluginId = process.env.HERDR_PLUGIN_ID;
if (!stateDir || !pluginId) { console.error('Run this through Herdr: herdr plugin action invoke <plugin-id>.toggle'); process.exit(2); }

const panelFile = join(stateDir, 'panel.json');
const context = (() => { try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}'); } catch { return {}; } })();
const open = (() => { try { return JSON.parse(readFileSync(panelFile, 'utf8')).pane; } catch { return null; } })();

if (open && (await execProgram(bin, ['pane', 'get', open])).code === 0) {
  const r = await execProgram(bin, ['plugin', 'pane', 'close', open]);
  if (r.code === 0) rmSync(panelFile, { force: true });
  process.exit(r.code);
}

const target = context.focused_pane_id ? ['--target-pane', context.focused_pane_id] : [];
const r = await execProgram(bin, ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'panel', '--placement', 'split', '--direction', 'right', '--no-focus', ...target]);
if (r.code !== 0) console.error(r.stderr.trim());
process.exit(r.code);
