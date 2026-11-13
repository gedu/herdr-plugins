// Empty state (SPEC §11): ghost boxes in track color and a centered message.
import { glyphs, stateOf } from './tokens.js';
import { strWidth } from './width.js';
import { box, hline, put } from './grid.js';
import { pieces } from './frame.js';

const GHOST_W = 25;
const GHOST_H = 4;
const SPREAD = 24;
const CONTENT_H = 20;
const TRACK = { fg: 'track' };
const LINES = ['An agent adds nodes as it works. The map draws itself', 'the first time it reports progress.'];

export function drawEmpty(g) {
  const W = g.cols;
  const top = 6 + Math.max(0, Math.floor((g.rows - 9 - CONTENT_H - 2) / 2));
  const col = Math.floor((W - GHOST_W) / 2);
  const pc = col + Math.floor(GHOST_W / 2);
  const spread = Math.max(0, Math.min(SPREAD, pc - Math.floor(GHOST_W / 2) - 1));
  const dashed = glyphs.edge.dashed_v;
  box(g, col, top, GHOST_W, GHOST_H, 'pending', TRACK);
  put(g, pc, top + 4, dashed, TRACK);
  if (spread) {
    hline(g, pc - spread, top + 5, spread * 2 + 1, stateOf('pending').h, TRACK);
    put(g, pc - spread, top + 5, glyphs.edge.tl, TRACK);
    put(g, pc, top + 5, glyphs.edge.t_up, TRACK);
    put(g, pc + spread, top + 5, glyphs.edge.tr, TRACK);
    for (const c of [pc - spread, pc + spread]) {
      put(g, c, top + 6, dashed, TRACK);
      box(g, c - Math.floor(GHOST_W / 2), top + 7, GHOST_W, GHOST_H, 'pending', TRACK);
    }
  }
  const center = (row, list) => pieces(g, Math.max(1, Math.floor((W - list.reduce((n, [s]) => n + strWidth(s), 0)) / 2)), row, list);
  center(top + 13, [[`${stateOf('pending').glyph}  no map for this feature yet`, { fg: 'emphasis', bold: true }]]);
  LINES.forEach((l, i) => center(top + 15 + i, [[l, { fg: 'muted' }]]));
  center(top + 19, [['waiting for an agent ', { fg: 'muted' }], ['▍', { fg: 'accent' }]]);
  return top;
}

