// Pure drawing for the popup: state in, screen lines out (with ANSI colors).
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `\x1b[38;2;${n >> 16};${(n >> 8) & 255};${n & 255}m`; };
const RESET = '\x1b[0m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const GREEN = rgb('#B7CC85');
const RED = rgb('#CB7C94');

// One color per shape of the mark: left petal, center, top. Shades of one hue until real brand colors are set.
export const LOGO = `${rgb('#9CC3CF')}⢴${rgb('#6FA0AF')}⣤${rgb('#4A7480')}⠞${RESET}`;

const DOTS = ['●○○', '●●○', '●●●', '○●●', '○○●', '○○○'];
export const dots = (frame) => DOTS[frame % DOTS.length];

export const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

function fit(line, width) {
  const chars = [...plain(line)];
  if (chars.length <= width) return line;
  return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function dayLabel(date, today) {
  const [y, m, d] = date.split('-').map(Number);
  return `${DAYS[new Date(y, m - 1, d).getDay()]} ${date.slice(5)}${date === today ? ' · today' : ''}`;
}

const KEYS = ' ↵ publish · e edit · ←→ day · r redraft · q close';
const EDIT_KEYS = ' type · ↵ new bullet · ↑↓ bullet · esc done · ctrl+c cancel';

// The cursor is the cell under it drawn inverted (a space past the end). A line wider than
// `room` shows the part around the cursor.
const CURSOR_ON = '\x1b[7m';
function withCursor(line, col, room) {
  const cs = [...line];
  const start = Math.max(0, col - Math.max(1, room - 1));
  const under = cs[col] ?? ' ';
  const after = cs.slice(col + 1, start + room).join('');
  return `${cs.slice(start, col).join('')}${CURSOR_ON}${under}\x1b[27m${after}`;
}

export function screen(state, width) {
  const w = Math.max(20, width);
  const lines = [` ${LOGO} ${BOLD}Productive${RESET}${GRAY} · time entry${RESET}`, ''];
  if (state.phase === 'setup' || state.phase === 'loading') {
    lines.push(state.phase === 'setup' ? ` ${state.message}` : ` ${LOGO} Loading ${dots(state.frame ?? 0)}`, '', `${GRAY} q close${RESET}`);
    return lines.map((l) => fit(l, w));
  }
  const date = state.dates[state.index];
  if (!date) {
    lines.push(` ${GREEN}✓${RESET} Every weekday is logged.`, '', `${GRAY} q close${RESET}`);
    return lines.map((l) => fit(l, w));
  }
  const logged = state.logged ?? {};
  const count = state.dates.filter((d) => !logged[d]).length;
  const summary = count ? `${count} day${count === 1 ? '' : 's'} without an entry` : 'every day logged';
  lines.push(` ${state.dates.length > 1 ? '‹ ' : ''}${BOLD}${dayLabel(date, state.today)}${RESET}${state.dates.length > 1 ? ' ›' : ''}${GRAY}   ${summary}${RESET}`);
  lines.push(`${GRAY} 8 h · ${state.serviceName ?? 'service of your last entry'}${RESET}`, '');
  if (logged[date]) {
    lines.push(...logged[date].map((b) => ` - ${b}`), '');
    const done = date === state.today ? 'Today is already logged · nothing to do' : 'Already logged';
    lines.push(` ${GREEN}✓ ${done}${RESET}${GRAY} · ←→ day · q close${RESET}`);
    return lines.map((l) => fit(l, w));
  }
  if (state.edit) {
    lines.push(...state.edit.lines.map((l, i) => ` - ${i === state.edit.row ? withCursor(l, state.edit.col, w - 4) : l}`), '');
    lines.push(`${GRAY}${EDIT_KEYS}${RESET}`);
    return lines.map((l) => (l.includes(CURSOR_ON) ? l : fit(l, w)));
  }
  const draft = state.drafts?.[date];
  if (!draft || draft.status === 'drafting') lines.push(` ${LOGO} Drafting ${dots(state.frame ?? 0)}`);
  else if (draft.status === 'error') lines.push(` ${RED}Could not draft: ${draft.error}${RESET}`, `${GRAY} press e to write it, or r to retry${RESET}`);
  else if (!draft.bullets.length) lines.push(`${GRAY} No commits or PRs found for this day. Press e to write the note.${RESET}`);
  else lines.push(...draft.bullets.map((b) => ` - ${b}`));
  lines.push('');
  if (state.phase === 'publishing') lines.push(` ${LOGO} Publishing ${dots(state.frame ?? 0)}`);
  else if (state.phase === 'done') lines.push(` ${GREEN}✓${RESET} ${state.message}`);
  else if (state.phase === 'error') lines.push(` ${RED}✗${RESET} ${state.message}`);
  else lines.push(`${GRAY}${KEYS}${RESET}`);
  return lines.map((l) => fit(l, w));
}
