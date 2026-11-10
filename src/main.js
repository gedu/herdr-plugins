// The panel process Herdr runs in a split pane: owns the screen, stdin and timers.
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createGh } from './gh.js';
import { createHost, execProgram } from './herdr.js';
import { createTracker } from './tracker.js';
import { createApp } from './app.js';
import { parseInput } from './keys.js';

const TICK_MS = 5_000;
const FRAME_MS = 250;

const stateDir = process.env.HERDR_PLUGIN_STATE_DIR || join(homedir(), '.local', 'state', 'herdr-pr-pane');
mkdirSync(stateDir, { recursive: true });
const storeFile = join(stateDir, 'tracked.json');
const panelFile = join(stateDir, 'panel.json');

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const writeJson = (file, data) => { const tmp = `${file}.tmp`; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, file); };

const store = { load: () => readJson(storeFile) ?? {}, save: (data) => writeJson(storeFile, data) };
const settings = { pollMs: 30_000, ciWaitMs: 120_000, aiChecks: [] };
const host = createHost();
const tracker = createTracker({
  gh: createGh(execProgram), remoteOf: host.remoteOf, branchOf: host.branchOf, branchExists: host.branchExists, store, settings,
});
const context = (() => { try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}'); } catch { return {}; } })();
const app = createApp({ host, tracker, sessionPane: context.focused_pane_id ?? null });

// So the toggle action can find and close this pane.
const myPane = process.env.HERDR_PANE_ID || null;
if (myPane) writeJson(panelFile, { pane: myPane });

const out = process.stdout;
const size = () => ({ width: out.columns || 40, height: out.rows || 20 });
let last = '';
function draw(force = false) {
  const frame = app.frame(size()).map((l) => `${l}\x1b[K`).join('\r\n');
  if (!force && frame === last) return;
  last = frame;
  out.write(`\x1b[H${frame}\x1b[J`);
}

let busy = false;
async function tick(opts) {
  if (busy) return;
  busy = true;
  try { await app.tick(opts); } finally { busy = false; draw(); }
}

function quit() {
  out.write('\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[?1049l');
  if (myPane && readJson(panelFile)?.pane === myPane) rmSync(panelFile, { force: true });
  process.exit(0);
}

out.write('\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1006h');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (text) => {
  for (const event of parseInput(text)) {
    if (event.type === 'click') await app.click(event.row, event.col, size());
    else if ((await app.key(event.name)) === 'quit') quit();
    draw();
  }
});
out.on('resize', () => draw(true));
for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(signal, quit);

draw(true);
createGh(execProgram).authOk().then((ok) => { if (!ok) { app.state.error = 'GitHub CLI is not ready: run gh auth login, then press r.'; draw(); } });
tick();
setInterval(() => tick(), TICK_MS);
setInterval(() => draw(), FRAME_MS);
