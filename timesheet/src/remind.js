// Event hook (tab.focused): after the reminder hour on a weekday, once per day, check whether
// today has an entry and show a toast if not. Cheap: one Productive request, no model call.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, run } from './sources.js';
import { productive } from './productive.js';
import { localDate, shouldRemind } from './day.js';

const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;
if (!stateDir) process.exit(0);
const marker = join(stateDir, 'reminded');
const config = await loadConfig();
const hour = Number(config.remindHour ?? 17);
const last = await readFile(marker, 'utf8').then((s) => s.trim(), () => null);
const now = new Date();
if (config.problem || !shouldRemind(now, last, hour)) process.exit(0);

// Mark first: tab.focused fires in bursts, and one check per day is enough.
await mkdir(stateDir, { recursive: true });
await writeFile(marker, localDate(now));
const api = productive({ token: config.token, organizationId: config.organizationId });
const today = localDate(now);
const entries = await api.entries(await api.personId(config.email), today, today);
if (!entries.length) {
  await run(process.env.HERDR_BIN_PATH || 'herdr', ['notification', 'show', 'No time logged today', '--body', 'prefix+t drafts it from your commits and PRs', '--sound', 'request']);
}
