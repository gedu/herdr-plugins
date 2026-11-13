// Design tokens: the only source of colors, state styles and glyphs. Loaded once per process.
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'));

export const colors = raw.colors;
export const states = raw.states;
export const glyphs = raw.glyphs;
export const layout = raw.layout;
export const issueStates = raw.issue_states;

// Border pieces per state: corners `tl tr bl br`, horizontal, vertical, color token and title style.
export const boxStyles = Object.fromEntries(Object.entries(states).map(([name, s]) => {
  const [tl, tr, bl, br] = [...s.corners];
  return [name, { tl, tr, bl, br, h: s.h, v: s.v, glyph: s.glyph, fg: s.color, titleBold: name !== 'pending' }];
}));

export const stateOf = (name) => boxStyles[name] ?? boxStyles.pending;
