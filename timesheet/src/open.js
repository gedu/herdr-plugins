// The plugin action: open the time-entry popup.
import { execFile } from 'node:child_process';

const pluginId = process.env.HERDR_PLUGIN_ID;
if (!pluginId) { console.error('Run this through Herdr: herdr plugin action invoke <plugin-id>.open'); process.exit(2); }
execFile(process.env.HERDR_BIN_PATH || 'herdr', ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'sheet'], { timeout: 10_000 }, (error, stdout, stderr) => {
  if (error) console.error(String(stderr || stdout).trim() || error.message);
  process.exit(error ? 1 : 0);
});
