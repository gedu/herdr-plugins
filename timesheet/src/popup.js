// The popup process: find weekdays without an entry, draft each one, publish on confirm.
// Keys: enter publish, e edit in $EDITOR, left/right change day, r redraft, q or esc close.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, evidence, draft } from './sources.js';
import { productive } from './productive.js';
import { localDate, missingDays, bulletsFromNote, noteFromBullets, cleanBullets } from './day.js';
import { publishDay } from './publish.js';
import { screen } from './ui.js';

const LOOKBACK_DAYS = 14;
const out = process.stdout;
const state = { phase: 'loading', frame: 0, today: localDate(new Date()), dates: [], index: 0, drafts: {} };
let ctx = null;

const draw = () => out.write(`\x1b[H${screen(state, out.columns || 70).slice(0, out.rows || 20).map((l) => `${l}\x1b[K`).join('\r\n')}\x1b[J`);
const enter = () => { out.write('\x1b[?1049h\x1b[?25l'); if (process.stdin.isTTY) process.stdin.setRawMode(true); };
const leave = () => { if (process.stdin.isTTY) process.stdin.setRawMode(false); out.write('\x1b[?25h\x1b[?1049l'); };
const quit = () => { leave(); process.exit(0); };

const busy = () => state.phase === 'publishing' || state.phase === 'loading' || Object.values(state.drafts).some((d) => d.status === 'drafting');
setInterval(() => { if (busy()) { state.frame++; draw(); } }, 160).unref();

async function load() {
  const config = await loadConfig();
  if (config.problem) { state.phase = 'setup'; state.message = config.problem; return draw(); }
  const api = productive({ token: config.token, organizationId: config.organizationId });
  const from = new Date(); from.setDate(from.getDate() - LOOKBACK_DAYS);
  const personId = await api.personId(config.email);
  const entries = await api.entries(personId, localDate(from), state.today);
  const last = entries.at(-1);
  if (!last) throw new Error(`No entries in the last ${LOOKBACK_DAYS} days to copy the service from`);
  ctx = { config, api, personId, serviceId: last.serviceId, examples: entries.slice(-10).map((e) => bulletsFromNote(e.note)).filter((b) => b.length) };
  state.serviceName = last.serviceName;
  state.dates = missingDays(entries, { from: localDate(from), to: state.today });
  state.index = Math.max(0, state.dates.length - 1);
  state.phase = 'ready';
  draw();
  if (state.dates.length) redraft(state.dates[state.index]);
}

// Each draft or edit of a day bumps its generation; a draft that finishes after a newer
// draft or a manual edit is dropped instead of overwriting it.
const generation = {};

async function redraft(date) {
  const mine = (generation[date] = (generation[date] ?? 0) + 1);
  state.drafts[date] = { status: 'drafting' };
  draw();
  let next;
  try {
    const ev = await evidence({ date, email: ctx.config.email, roots: ctx.config.roots });
    const { bullets } = await draft({ date, examples: ctx.examples, ...ev });
    next = { status: 'ready', bullets };
  } catch (e) {
    next = { status: 'error', error: String(e.message).slice(0, 120), bullets: [] };
  }
  if (generation[date] !== mine) return;
  state.drafts[date] = next;
  draw();
}

function edit(date) {
  const current = state.drafts[date]?.bullets ?? [];
  const dir = mkdtempSync(join(tmpdir(), 'timesheet-'));
  const file = join(dir, `${date}.md`);
  writeFileSync(file, `${noteFromBullets(current)}\n`);
  leave();
  spawnSync(process.env.VISUAL || process.env.EDITOR || 'vi', [file], { stdio: 'inherit' });
  const bullets = cleanBullets(bulletsFromNote(readFileSync(file, 'utf8')));
  rmSync(dir, { recursive: true, force: true });
  generation[date] = (generation[date] ?? 0) + 1;
  state.drafts[date] = { status: 'ready', bullets };
  enter();
  draw();
}

async function publish(date) {
  const current = state.drafts[date];
  if (current?.status !== 'ready' || !current.bullets.length) return;
  state.phase = 'publishing';
  draw();
  try {
    await publishDay({ api: ctx.api, personId: ctx.personId, serviceId: ctx.serviceId, date, bullets: current.bullets });
    state.phase = 'done';
    state.message = `Published ${date}`;
    state.dates.splice(state.index, 1);
    state.index = Math.max(0, Math.min(state.index, state.dates.length - 1));
  } catch (e) {
    state.phase = 'error';
    state.message = String(e.message).slice(0, 160);
  }
  draw();
}

enter();
draw();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (key) => {
  if (key === 'q' || key === '\x1b' || key === '\x03') return quit();
  if (state.phase === 'publishing' || state.phase === 'loading' || state.phase === 'setup') return;
  // After a publish (or a failed one) the next key only dismisses the message, so a repeated
  // enter cannot publish the following day unseen.
  if (state.phase === 'done' || state.phase === 'error') { state.phase = 'ready'; return draw(); }
  const date = state.dates[state.index];
  if (!date) return;
  if (key === '\x1b[D' || key === 'h') state.index = Math.max(0, state.index - 1);
  else if (key === '\x1b[C' || key === 'l') state.index = Math.min(state.dates.length - 1, state.index + 1);
  else if (key === 'e') return edit(date);
  else if (key === 'r') return void redraft(date);
  else if (key === '\r') return void publish(date);
  const now = state.dates[state.index];
  if (now && !state.drafts[now]) return void redraft(now);
  draw();
});
out.on('resize', draw);

load().catch((e) => { state.phase = 'setup'; state.message = `✗ ${String(e.message).slice(0, 200)}`; draw(); });
