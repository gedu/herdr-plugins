// The popup process: find weekdays without an entry, draft each one, publish on confirm.
// Keys: enter publish, e edit the bullets in place, left/right change day, r redraft, q or esc close.
import { loadConfig, evidence, draft } from './sources.js';
import { productive } from './productive.js';
import { localDate, weekdaysBetween, missingDays, startIndex, bulletsFromNote } from './day.js';
import { startEdit, editKey } from './editor.js';
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
  const [entries, holidays] = await Promise.all([
    api.entries(personId, localDate(from), state.today),
    api.holidays(localDate(from), state.today, config.holidayCalendarId),
  ]);
  const last = entries.at(-1);
  if (!last) throw new Error(`No entries in the last ${LOOKBACK_DAYS} days to copy the service from`);
  ctx = { config, api, personId, serviceId: last.serviceId, examples: entries.slice(-10).map((e) => bulletsFromNote(e.note)).filter((b) => b.length) };
  state.serviceName = last.serviceName;
  // Every working day of the window can be picked; days already logged show their note.
  // Holidays are left out: Productive refuses time on them.
  state.logged = {};
  for (const e of entries) state.logged[e.date] = [...(state.logged[e.date] ?? []), ...bulletsFromNote(e.note)];
  state.dates = weekdaysBetween(localDate(from), state.today).filter((d) => !holidays.includes(d));
  const missing = missingDays(entries, { from: localDate(from), to: state.today, holidays });
  state.index = startIndex(state.dates, missing, state.today);
  state.phase = 'ready';
  draw();
  const date = state.dates[state.index];
  if (date && !state.logged[date]) redraft(date);
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

// `e` edits the bullets inside the popup; esc keeps the result, ctrl+c drops it.
function edit(date) {
  state.edit = startEdit(state.drafts[date]?.bullets ?? []);
  state.editDate = date;
  out.write('\x1b[?25l');
  draw();
}

function editInput(key) {
  const { ed, done } = editKey(state.edit, key);
  if (!done) { state.edit = ed; return draw(); }
  const date = state.editDate;
  state.edit = null;
  if (done.bullets) {
    generation[date] = (generation[date] ?? 0) + 1;
    state.drafts[date] = { status: 'ready', bullets: done.bullets };
  }
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
    state.logged[date] = current.bullets;
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
  if (state.edit) return editInput(key);
  if (key === 'q' || key === '\x1b' || key === '\x03') return quit();
  if (state.phase === 'publishing' || state.phase === 'loading' || state.phase === 'setup') return;
  // After a publish (or a failed one) the next key only dismisses the message, so a repeated
  // enter cannot publish the following day unseen.
  if (state.phase === 'done' || state.phase === 'error') { state.phase = 'ready'; return draw(); }
  const date = state.dates[state.index];
  if (!date) return;
  if (key === '\x1b[D' || key === 'h') state.index = Math.max(0, state.index - 1);
  else if (key === '\x1b[C' || key === 'l') state.index = Math.min(state.dates.length - 1, state.index + 1);
  else if (state.logged[date]) { /* a logged day is read-only */ }
  else if (key === 'e') return edit(date);
  else if (key === 'r') return void redraft(date);
  else if (key === '\r') return void publish(date);
  const now = state.dates[state.index];
  if (now && !state.drafts[now] && !state.logged[now]) return void redraft(now);
  draw();
});
out.on('resize', draw);

load().catch((e) => { state.phase = 'setup'; state.message = `✗ ${String(e.message).slice(0, 200)}`; draw(); });
