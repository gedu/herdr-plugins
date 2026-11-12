// The popup process: fetch the issue through the user's own `gh` login and show the card.
// q, Escape or Enter closes it; o opens the issue on GitHub.
import { execFile } from 'node:child_process';
import { cardOf } from './card.js';

const repo = process.env.ISSUE_CARD_REPO;
const number = Number(process.env.ISSUE_CARD_NUMBER);
const out = process.stdout;
let lines = [` Loading ${repo}#${number}…`];
let link = null;

function draw() {
  const height = out.rows || 20;
  out.write(`\x1b[H${lines.slice(0, height).map((l) => `${l}\x1b[K`).join('\r\n')}\x1b[J`);
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
  if (key === 'q' || key === '\x1b' || key === '\r' || key === '\x03') quit();
  if (key === 'o' && link) {
    execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [link]);
    quit();
  }
});
out.on('resize', () => {
  if (link || lines.length > 1) draw();
});

execFile('gh', ['api', `repos/${repo}/issues/${number}`], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
  try {
    if (error) throw new Error(String(stderr).trim().split('\n')[0] || error.message);
    const issue = JSON.parse(stdout);
    // Only ever open GitHub links, whatever the API answered.
    link = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(issues|pull)\/\d+$/.test(issue.html_url) ? issue.html_url : null;
    lines = cardOf(issue, { width: out.columns || 60, height: out.rows || 18 });
  } catch (e) {
    lines = [` Could not load ${repo}#${number}`, ` ${String(e.message).slice(0, 200)}`, '', ' q close'];
  }
  draw();
});
