// Node detail (SPEC §8): replaces the map region; header and footer stay.
import { glyphs, stateOf } from './tokens.js';
import { strWidth } from './width.js';
import { fill, put, text } from './grid.js';
import { issueLabel, issueColor } from './issues.js';
import { pieces, right, sectionRule, noteLine, STATE_FG, STATE_LABEL } from './frame.js';

const MUTED = { fg: 'muted' };
const TOP = 7;
const TITLE_COL_W = 40;
const NOTE_ROWS = 3;

// Parent chain through tree edges (first incoming edge), root first.
function ancestors(flow, id) {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const into = new Map();
  for (const e of flow.edges ?? []) if (!into.has(e.to) && byId.has(e.from)) into.set(e.to, e.from);
  const out = [];
  const seen = new Set([id]);
  for (let p = into.get(id); p && !seen.has(p); p = into.get(p)) {
    seen.add(p);
    out.unshift(byId.get(p));
  }
  return out;
}

const two = (n) => String(n).padStart(2, '0');
const hhmm = (at) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? '' : `${two(d.getHours())}:${two(d.getMinutes())}`; };

function ago(at, now) {
  const ms = new Date(now).getTime() - new Date(at).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

export const selectedIssue = (node, detail = {}) => {
  const list = node?.issues ?? [];
  if (!list.length) return null;
  return list[Math.min(Math.max(0, detail.issue ?? 0), list.length - 1)];
};

// Footer keys for the detail view; `g` names the selected issue (`on GitHub` only for `#n`).
export function detailKeys(node, detail) {
  const issue = selectedIssue(node, detail);
  const label = issue ? issueLabel(issue) : '';
  return [
    ['esc', 'back to the map'], ['↑↓', 'choose issue'],
    ...(issue ? [['g', `open ${label}${label.startsWith('#') ? ' on GitHub' : ''}`]] : []),
    ['←→', 'previous / next node'], ['q', 'close'],
  ];
}

export function drawDetail(g, flow, id, { detail = {}, now, agentsByNode }) {
  const W = g.cols;
  const end = g.rows - 3;
  const node = flow.nodes.find((n) => n.id === id);
  if (!node) return;
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const state = STATE_FG[node.state] ? node.state : 'pending';
  const s = stateOf(state);
  let row = TOP;
  const line = (fn) => { if (row < end) fn(row); row++; };

  line((r) => {
    const crumbs = ancestors(flow, id).flatMap((n) => [[n.title ?? n.id, MUTED], [' › ', MUTED]]);
    pieces(g, 1, r, [...crumbs, [node.title ?? id, { fg: 'emphasis', bold: true }]]);
  });
  row++;
  line((r) => {
    const chip = [[' ', { bg: 'selection' }], [STATE_LABEL[state], { fg: STATE_FG[state], bg: 'selection', bold: s.titleBold }], [' ', { bg: 'selection' }]];
    const chipCol = right(g, r, chip) - strWidth(` ${STATE_LABEL[state]} `);
    text(g, 1, r, `${s.glyph} ${node.title ?? id}`, { fg: STATE_FG[state], bold: s.titleBold }, chipCol - 2);
  });
  line((r) => text(g, 1, r, node.description ?? node.detail ?? '', MUTED, W - 2));
  row++;

  const section = (label, fill_) => {
    line((r) => sectionRule(g, r, label));
    fill_();
    row++;
  };

  section('issues', () => {
    const issues = node.issues ?? [];
    if (!issues.length) return line((r) => text(g, 1, r, 'none', MUTED));
    const sel = selectedIssue(node, detail);
    const idW = Math.max(...issues.map((i) => strWidth(issueLabel(i)))) + 3;
    const stW = Math.max(...issues.map((i) => strWidth(i.state ?? ''))) + 3;
    for (const issue of issues) {
      line((r) => {
        const on = issue === sel;
        if (on) {
          fill(g, 1, r, W - 2, 1, { bg: 'selection' });
          put(g, 1, r, glyphs.selected_marker, { fg: 'accent' });
        }
        const fg = issueColor(issue);
        let c = 3;
        text(g, c, r, issueLabel(issue), { fg }, idW - 1);
        c += idW;
        text(g, c, r, issue.state ?? '', { fg }, stW - 1);
        c += stW;
        text(g, c, r, issue.title ?? '', on ? { fg: 'emphasis', bold: true } : { fg: 'text' }, Math.min(TITLE_COL_W - 2, W - 1 - c));
        c += TITLE_COL_W;
        if (issue.blocked_by && c < W - 2) text(g, c, r, `${stateOf('blocked').glyph} blocked by ${issue.blocked_by}`, { fg: 'blocked' }, W - 1 - c);
      });
    }
  });

  section('edges', () => {
    const edges = (flow.edges ?? []).filter((e) => byId.has(e.from) && byId.has(e.to));
    const into = edges.filter((e) => e.to === id);
    const out = edges.filter((e) => e.from === id);
    if (!into.length && !out.length) return line((r) => text(g, 1, r, 'none', MUTED));
    for (const e of into) {
      const note = e.note ?? e.label;
      line((r) => pieces(g, 1, r, [['in', MUTED], ['   '], ['←', { fg: 'edge' }], [' '], [byId.get(e.from).title ?? e.from, { fg: 'text' }], ...(note ? [[` · ${note}`, MUTED]] : [])]));
    }
    for (const e of out) {
      const main = e.label ?? byId.get(e.to).title ?? e.to;
      const note = e.note ?? (e.label ? byId.get(e.to).title : null);
      line((r) => pieces(g, 1, r, [['out', MUTED], ['  '], ['→', { fg: 'edge' }], [' '], [main, { fg: 'text' }], ...(note ? [[` · ${note}`, MUTED]] : [])]));
    }
  });

  section('agent', () => {
    const agents = agentsByNode.get(id) ?? [];
    if (!agents.length) return line((r) => text(g, 1, r, 'no agent on this node', MUTED));
    for (const a of agents) {
      const when = a.at && now ? ago(a.at, now) : '';
      line((r) => pieces(g, 1, r, [[glyphs.agent_tag, { fg: 'accent' }], [` tab ${a.tab}  working on this node`, { fg: 'text' }], ...(when ? [[` · last activity ${when}`, MUTED]] : [])]));
    }
  });

  section('notes', () => {
    const notes = node.notes ?? [];
    if (!notes.length) line((r) => text(g, 1, r, 'none', MUTED));
    for (const n of notes) line((r) => noteLine(g, r, n));
    row += Math.max(0, NOTE_ROWS - Math.max(1, notes.length));
  });

  const history = [...(node.history ?? [])].sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  if (history.length) section('history', () => {
    for (const h of history) {
      const who = h.who === 'you' ? [['you', { fg: 'emphasis', bold: true }]]
        : typeof h.who === 'number' || /^\d+$/.test(String(h.who)) ? [[`tab ${h.who}`, { fg: 'accent' }]]
          : [[String(h.who ?? ''), { fg: 'text' }]];
      line((r) => {
        text(g, 1, r, hhmm(h.at), MUTED, 5);
        pieces(g, 9, r, who, 16);
        text(g, 17, r, h.what ?? '', { fg: 'text' }, W - 18);
      });
    }
  });
}
