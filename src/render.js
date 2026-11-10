// Turns the tracker's cards into terminal lines: colored dots in the list, a timeline in the
// detail. Pure: (state, size) -> { lines, hits }, where `hits` maps screen cells to actions so
// the loop can answer mouse clicks. Nothing here prints or runs anything.
import { translator } from './i18n.js';
import { facts, steps, flowLine, flowRows } from './present.js';
import { sanitize } from './text.js';

const t = translator('en');

const S = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
  sel: '\x1b[48;5;236m', accent: '\x1b[38;5;75m',
};

// prState tones (status.js) and present.js tones, to colors.
const TONE = {
  ok: S.green, bad: S.red, cya: S.cyan, warn: S.yellow, pur: S.magenta, f1: S.gray,
  run: S.cyan, wait: S.yellow, merged: S.magenta, dim: S.gray, todo: S.gray, comment: S.yellow, merge: S.green,
};
const MARK = { ok: '✓', bad: '✗', run: '◌', wait: '●', warn: '!', todo: '○', merged: '✓' };
const SPIN = ['◐', '◓', '◑', '◒'];

export const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

const wide = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3)
  || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
  || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd);
const zero = (cp) => (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f;
const charWidth = (ch) => { const cp = ch.codePointAt(0); return zero(cp) ? 0 : wide(cp) ? 2 : 1; };

export function visibleWidth(text) {
  let w = 0;
  for (const ch of String(text)) w += charWidth(ch);
  return w;
}

function fit(text, room) {
  if (visibleWidth(text) <= room) return text;
  let out = '', w = 0;
  for (const ch of text) {
    const cw = charWidth(ch);
    if (w + cw > room - 1) break;
    out += ch; w += cw;
  }
  return room > 0 ? `${out}…` : '';
}

const oneLine = (value) => sanitize(value).replace(/\s+/g, ' ').trim();

// Every segment is cleaned here, so no string from GitHub or Herdr can write escape sequences
// (colors, OSC 8 links, screen clears) or bidi controls to the terminal, whatever path it took.
const clean = (value) => sanitize(value).replace(/\n/g, ' ');

// One screen line from [text, style] segments, cut to the width. A background fills the whole line.
function paint(segs, width, bg = '', fill = Boolean(bg)) {
  let out = '', used = 0;
  for (const [raw, style = ''] of segs) {
    if (used >= width) break;
    const text = fit(clean(raw), width - used);
    out += `${bg}${style}${text}${S.reset}`;
    used += visibleWidth(text);
  }
  if (fill && used < width) out += `${bg}${' '.repeat(width - used)}${S.reset}`;
  return out;
}

function wrap(text, width, max = 3) {
  const words = oneLine(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (visibleWidth(next) <= width) { line = next; continue; }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length > max) { lines.length = max; lines[max - 1] = fit(`${lines[max - 1]} …`, width); }
  return lines.map((l) => fit(l, width));
}

function agentMark(agent, now) {
  if (!agent) return ['–', S.gray];
  if (agent.status === 'working') return [SPIN[Math.floor(now / 250) % SPIN.length], S.cyan];
  if (agent.status === 'blocked') return ['●', S.yellow];
  if (agent.status === 'done') return ['●', S.green];
  if (agent.status === 'idle') return ['○', S.gray];
  return ['·', S.gray];
}

const STATUS_WORD = { working: t('a_working'), idle: t('a_idle'), done: t('a_done'), blocked: t('a_blocked'), unknown: t('a_unknown') };
const whoOf = (card) => card.agent ?? card.owner;
const groupKey = (card) => whoOf(card)?.pane ?? 'none';

// The list's order: the focused session's PRs, then each other session's, grouped.
export function listOrder(cards, sessionPane) {
  const mine = cards.filter((c) => sessionPane && c.owner?.pane === sessionPane);
  const rest = cards.filter((c) => !mine.includes(c));
  const groups = new Map();
  for (const c of rest) groups.set(groupKey(c), [...(groups.get(groupKey(c)) ?? []), c]);
  return [...mine, ...[...groups.values()].flat()];
}

function cardRows(card, { width, selected, now }) {
  const bg = selected ? S.sel : '';
  const bar = selected ? ['▌', S.accent] : [' '];
  const tone = card.loading ? 'f1' : card.status.tone;
  const title = card.loading ? `${card.repo} #${card.number}` : oneLine(card.pr.title);
  const left = paint([bar, ['●', TONE[tone]], [' '], [title, S.bold]], width - 3, bg, true);
  const rows = [{ text: left + paint([[' ✕ ', S.gray]], 3, bg), hits: [{ action: 'go', url: card.url, from: 0, to: width - 3 }, { action: 'dismiss', url: card.url, from: width - 2, to: width - 1 }] }];
  const name = String(card.repo).split('/')[1] ?? card.repo;
  const second = [[' '], ['  '], [`${name} #${card.number}`, S.gray]];
  if (card.loading) second.push([' · ', S.gray], [card.error ? oneLine(card.error) : t('loading'), card.error ? S.red : S.gray]);
  else for (const f of facts(card, t)) second.push([' · ', S.gray], [f.label, TONE[f.tone] ?? S.gray]);
  rows.push({ text: paint(second, width, bg), hits: [{ action: 'go', url: card.url, from: 0, to: width }] });
  const flow = card.loading ? null : flowLine(card, t);
  if (flow) rows.push({ text: paint([[' '], ['  '], [flow.label, TONE[flow.tone]], [flow.more ? ` ${flow.more}` : '', S.gray]], width, bg), hits: [] });
  return rows;
}

function groupHeader(card, now, width) {
  const who = whoOf(card);
  if (!who) return paint([[' '], ['– ', S.gray], ['no agent', S.gray]], width);
  const status = card.agent ? STATUS_WORD[card.agent.status] ?? card.agent.status : 'gone';
  return paint([[' '], agentMark(card.agent, now), [' '], [`${who.app} · ${oneLine(who.session)}`, S.blue], [` · ${status}`, S.gray]], width);
}

function listBody(state, { width, now }) {
  const rows = [];
  const push = (text, extra = {}) => rows.push({ text, hits: [], ...extra });
  const order = listOrder(state.cards, state.sessionPane);
  const mine = order.filter((c) => state.sessionPane && c.owner?.pane === state.sessionPane);
  if (state.sessionPane) {
    push(paint([[' THIS SESSION', `${S.bold}${S.gray}`], state.sessionName ? [` · ${oneLine(state.sessionName)}`, S.gray] : ['']], width));
    if (!mine.length) push(paint([['   No PR in this session', S.gray]], width));
    else push(groupHeader(mine[0], now, width));
    for (const c of mine) for (const r of cardRows(c, { width, selected: c.url === state.selected, now })) rows.push({ ...r, card: c.url });
    push('');
  }
  const rest = order.filter((c) => !mine.includes(c));
  if (rest.length) push(paint([[state.sessionPane ? ' OTHER SESSIONS' : ' ALL SESSIONS', `${S.bold}${S.gray}`]], width));
  let last = null;
  for (const c of rest) {
    if (groupKey(c) !== last) { if (last !== null) push(''); push(groupHeader(c, now, width)); last = groupKey(c); }
    for (const r of cardRows(c, { width, selected: c.url === state.selected, now })) rows.push({ ...r, card: c.url });
  }
  if (!state.cards.length && !state.error) {
    push('');
    push(paint([[' No pull requests yet', S.bold]], width));
    for (const l of wrap(t('empty_body'), width - 2)) push(paint([[` ${l}`, S.gray]], width));
  }
  return rows;
}

function detailBody(card, { width, now }) {
  const rows = [];
  const push = (text, hits = []) => rows.push({ text, hits });
  if (!card) { push(paint([[' This PR is no longer listed.', S.gray]], width)); return rows; }
  for (const l of wrap(card.loading ? `${card.repo} #${card.number}` : card.pr.title, width - 2)) push(paint([[` ${l}`, S.bold]], width));
  push(paint([[` ${card.repo} #${card.number}`, S.gray]], width));
  if (card.pr) push(paint([[' ⎇ ', S.gray], [`${card.pr.headRefName} → ${card.pr.baseRefName}`, S.gray]], width));
  push('');
  const who = whoOf(card);
  const status = card.agent ? STATUS_WORD[card.agent.status] ?? card.agent.status : 'no longer running';
  const label = who ? `${who.app} · ${oneLine(who.session)} · ${status}` : 'No agent on this PR';
  const go = card.agent ? '  ↵ Go ' : '';
  push(paint([[' '], agentMark(card.agent, now), [' '], [label], [go, S.accent]], width, S.sel), card.agent ? [{ action: 'go', url: card.url, from: 0, to: width }] : []);
  if (card.loading) { push(''); push(paint([[` ${card.error ? oneLine(card.error) : t('loading')}`, card.error ? S.red : S.gray]], width)); return rows; }
  push('');
  push(paint([[' PROGRESS', `${S.bold}${S.gray}`]], width));
  const items = [...steps(card, t, now), ...flowRows(card, t, now)];
  items.forEach((s, i) => {
    const tone = TONE[s.tone] ?? S.gray;
    push(paint([['  '], [MARK[s.tone] ?? '○', tone], [' '], [oneLine(s.label), s.tone === 'todo' ? S.gray : S.bold]], width));
    const more = i < items.length - 1;
    if (s.note) push(paint([['  '], [more ? '│ ' : '  ', S.gray], [oneLine(s.note), S.gray]], width));
    if (more) push(paint([['  │', S.gray]], width));
  });
  if (card.issues?.length) {
    push('');
    push(paint([[' LINKED ISSUES', `${S.bold}${S.gray}`]], width));
    for (const i of card.issues) push(paint([['  '], [`#${i.number}`, i.state === 'OPEN' ? S.green : S.magenta], [' '], [oneLine(i.title)]], width));
  }
  return rows;
}

export function render(state, { width, height, now = Date.now() }) {
  const w = Math.max(10, width), h = Math.max(4, height);
  const detail = state.view === 'detail';
  const card = detail ? state.cards.find((c) => c.url === state.selected) : null;
  const head = detail
    ? [{ text: paint([[' ← List', S.gray], [' '.repeat(Math.max(1, w - 18))], ['o GitHub', S.gray]], w), hits: [{ action: 'back', from: 0, to: 8 }] }]
    : [{ text: paint([[' Pull requests', S.bold], [`  ${state.cards.length}`, S.gray]], w), hits: [{ action: 'refresh', from: 0, to: w }] }];
  head.push({ text: paint([['─'.repeat(w), S.gray]], w), hits: [] });
  const errors = state.error ? wrap(state.error, w - 2, 4).map((l) => ({ text: paint([[` ${l}`, S.red]], w), hits: [] })) : [];
  const body = [...errors, ...(detail ? detailBody(card, { width: w, now }) : listBody(state, { width: w, now }))];
  const foot = { text: paint([[detail ? ' ← back · ↵ go · o web · x hide' : ' ↵ go · → info · x hide · o web · r', S.gray]], w), hits: [] };

  // Keep the selected card on screen.
  const room = h - head.length - 1;
  let offset = 0;
  if (!detail && state.selected) {
    const first = body.findIndex((r) => r.card === state.selected);
    const lastRow = body.length - 1 - [...body].reverse().findIndex((r) => r.card === state.selected);
    if (first >= 0 && lastRow >= room) offset = Math.min(first, lastRow - room + 1);
  }
  const shown = body.slice(offset, offset + room);
  while (shown.length < room) shown.push({ text: '', hits: [] });
  const rows = [...head, ...shown, foot];
  return {
    lines: rows.map((r) => r.text),
    hits: rows.flatMap((r, row) => r.hits.map((hit) => ({ ...hit, row }))),
  };
}
