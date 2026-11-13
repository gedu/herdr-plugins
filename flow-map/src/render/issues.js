// Issue chips, not tied to GitHub: `{n, state}` shows `#n`, `{ref, state}` shows the ref as is.
import { issueStates } from './tokens.js';
import { strWidth } from './width.js';

export const issueLabel = (issue) => (issue.ref != null ? String(issue.ref) : `#${issue.n}`);

export const issueColor = (issue) => issueStates[issue.state] ?? 'muted';

// Merged first (stable), each chip `label state` in its own color.
export function chips(issues = []) {
  const sorted = [...issues].sort((a, b) => (b.state === 'merged') - (a.state === 'merged'));
  return sorted.map((i) => ({ text: `${issueLabel(i)} ${i.state}`, fg: issueColor(i) }));
}

export const CHIP_GAP = 2;

export const chipsWidth = (list) => list.reduce((n, c, i) => n + strWidth(c.text) + (i ? CHIP_GAP : 0), 0);
