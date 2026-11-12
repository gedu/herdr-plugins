// Event hook (tab.focused): after the reminder hour on a weekday, once per day, check whether
// today has an entry and show a toast if not. Cheap: one Productive request, no model call.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, run } from './sources.js';
import { productive } from './productive.js';
import { localDate, shouldRemind } from './day.js';

const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;
if (!stateDir) process.exit(0);
const marker = join(stateDir, 'reminded');
const config = await loadConfig();
const hour = Number(config.remindHour ?? 17);
const saved = await readFile(marker, 'utf8').then((s) => s.trim(), () => null);
const now = new Date();
const checking = /^checking (\d+)$/.exec(saved ?? '');
if (checking && now - Number(checking[1]) < 60_000) process.exit(0);
const last = checking ? null : saved;
if (config.problem || !shouldRemind(now, last, hour)) process.exit(0);

// tab.focused fires in bursts: claim the check first ("checking <ms>", valid 60 s), record the
// day only once the check succeeded, and release the claim on failure so the next tab switch retries.
await mkdir(stateDir, { recursive: true });
await writeFile(marker, `checking ${Date.now()}`);
const today = localDate(now);
try {
  const api = productive({ token: config.token, organizationId: config.organizationId });
  const entries = await api.entries(await api.personId(config.email), today, today);
  if (!entries.length) {
    await run(process.env.HERDR_BIN_PATH || 'herdr', ['notification', 'show', 'No time logged today', '--body', 'prefix+t drafts it from your commits and PRs', '--sound', 'request']);
  }
  await writeFile(marker, today);
} catch (e) {
  await rm(marker, { force: true });
  console.error(`reminder check failed, will retry on the next tab switch: ${e.message}`);
}
