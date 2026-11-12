// The card's lines, from the GitHub issues API (which answers for pull requests too).
// Everything from GitHub is untrusted: escape codes and bidi controls are removed before display.
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const BIDI = /[‪-‮⁦-⁩]/g;
const BODY_LINES = 6;

export function sanitize(value) {
  return String(value ?? '').replace(ANSI, '').replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(BIDI, '').replace(/\t/g, '    ');
}

// The first `max` lines of text, with Markdown noise removed and runs of blank lines collapsed.
export function excerpt(body, max) {
  const text = sanitize(body)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '');
  const out = [];
  let count = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '').trimEnd();
    if (!line.trim()) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    if (count === max) break;
    out.push(line);
    count += 1;
  }
  while (out.at(-1) === '') out.pop();
  return out;
}

// Word wrap; a word longer than the line is cut.
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!word) continue;
    if (line && line.length + 1 + word.length > width) { lines.push(line); line = ''; }
    line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

const stateOf = (issue) => (issue.pull_request?.merged_at ? 'Merged' : issue.state === 'open' ? 'Open' : 'Closed');
const status = (issue) => `${stateOf(issue)} ${issue.pull_request ? 'pull request' : 'issue'}`;
const fit = (line, width) => (line.length > width ? `${line.slice(0, width - 1)}…` : line);

// The picker: one line per reference found on screen, the selected one marked.
export function listOf(items, { selected, width, repo }) {
  const rows = items.map((item, i) => {
    const label = item.repo === repo ? `#${item.number}` : `${item.repo}#${item.number}`;
    const text = item.issue
      ? `${sanitize(item.issue.title)}${stateOf(item.issue) === 'Open' ? '' : ` · ${stateOf(item.issue)}`}`
      : item.error ? sanitize(item.error) : 'Loading…';
    return fit(`${i === selected ? '▌' : ' '} ${label}  ${text}`, width);
  });
  return [' Issues on screen', '', ...rows, '', fit(' j/k move · enter card · q close', width)];
}

export function cardOf(issue, { width, height = Infinity }) {
  const inner = Math.max(10, width - 2);
  const pad = (lines) => lines.map((l) => ` ${l}`);
  const comments = Number(issue.comments) || 0;
  const head = [`#${issue.number}`, status(issue), `by ${sanitize(issue.user?.login) || 'unknown'}`, `${comments} comment${comments === 1 ? '' : 's'}`].join(' · ');
  const labels = (issue.labels ?? []).map((l) => sanitize(l.name)).filter(Boolean).join(', ');
  const rule = ` ${'─'.repeat(inner)}`;
  const top = [...pad(wrap(head, inner)), '', ...pad(wrap(sanitize(issue.title), inner)), ...(labels ? pad(wrap(labels, inner)) : []), rule];
  const bottom = [rule, ' o GitHub · q close'];
  let body = excerpt(issue.body, BODY_LINES).flatMap((l) => (l ? wrap(l, inner) : ['']));
  if (!body.length) body = ['No description.'];
  // The body gives way first, so the title and the keys line always fit.
  const room = Math.max(1, height - top.length - bottom.length);
  if (body.length > room) body = [...body.slice(0, room - 1), '…'];
  return [...top, ...pad(body), ...bottom];
}
