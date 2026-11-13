// The popup process. With one reference it shows its card; with several it shows a list first.
// Issues come from the user's own `gh` login. Keys: j/k or arrows move, enter opens the card,
// esc goes back to the list (or closes), o opens on GitHub, q closes.
import { execFile, spawn } from 'node:child_process';
import { cardOf, listOf } from './card.js';

const GITHUB_LINK = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|pull)\/\d+$/;
const repo = process.env.ISSUE_CARD_REPO || '';
const items = String(process.env.ISSUE_CARD_REFS || '').split(',').map((s) => /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/.exec(s))
  .filter(Boolean).map((m) => ({ repo: m[1], number: Number(m[2]) }));
const out = process.stdout;
let selected = 0;
let mode = items.length === 1 ? 'card' : 'list';
let notice = '';

function frame() {
  const size = { width: out.columns || 60, height: out.rows || 18 };
  if (!items.length) return [' Nothing to show.', '', ' q close'];
  if (mode === 'list') return listOf(items, { selected, width: size.width, repo });
  const item = items[selected];
  if (item.issue) return cardOf(item.issue, size);
  return item.error ? [` Could not load ${item.repo}#${item.number}`, ` ${item.error}`, '', ' q close'] : [` Loading ${item.repo}#${item.number}…`];
}

// The last row shows what `o` did when it could not open the link.
function draw() {
  const rows = out.rows || 18;
  const lines = frame().slice(0, notice ? rows - 1 : rows);
  if (notice) lines.push(...Array(Math.max(0, rows - 1 - lines.length)).fill(''), notice);
  out.write(`\x1b[H${lines.map((l) => `${l}\x1b[K`).join('\r\n')}\x1b[J`);
}

function quit() {
  out.write('\x1b[?25h\x1b[?1049l');
  process.exit(0);
}

out.write('\x1b[?1049h\x1b[?25l');
draw();
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (key) => {
  if (key === 'q' || key === '\x03') quit();
  notice = '';
  if (mode === 'list') {
    if (key === 'j' || key === '\x1b[B') selected = Math.min(items.length - 1, selected + 1);
    else if (key === 'k' || key === '\x1b[A') selected = Math.max(0, selected - 1);
    else if (key === '\r' || key === 'l' || key === '\x1b[C') mode = 'card';
    else if (key === '\x1b') quit();
  } else if (key === '\x1b' || key === 'h' || key === '\x1b[D') {
    if (items.length > 1) mode = 'list'; else quit();
  } else if (key === '\r') quit();
  if (key === 'o') {
    const item = items[selected];
    const link = item?.issue?.html_url;
    if (GITHUB_LINK.test(link ?? '')) return openLink(link);
    notice = item?.issue ? ` No GitHub link for this issue (${link ?? 'none'})` : ' Still loading, try again in a moment';
  }
  draw();
});

// The opener runs in its own session (detached), so closing the popup cannot kill it before it
// hands the link to the browser; the popup closes once it has, and says why when it could not.
function openLink(link) {
  const cmd = process.platform === 'darwin' ? '/usr/bin/open' : 'xdg-open';
  notice = ` Opening ${link}…`;
  draw();
  const child = spawn(cmd, [link], { detached: true, stdio: 'ignore' });
  child.on('error', (e) => { notice = ` Could not open the browser: ${e.message}`; draw(); });
  child.on('exit', (code) => {
    if (code === 0) quit();
    notice = ` ${cmd} exited with code ${code}`;
    draw();
  });
}
out.on('resize', draw);

for (const item of items) {
  execFile('gh', ['api', `repos/${item.repo}/issues/${item.number}`], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
    try {
      if (error) throw new Error(String(stderr).trim().split('\n')[0] || error.message);
      item.issue = JSON.parse(stdout);
    } catch (e) {
      item.error = String(e.message).replace(/^gh: /, '').slice(0, 200);
    }
    draw();
  });
}
