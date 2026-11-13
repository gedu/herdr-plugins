// render(flow, opts) → cell grid. Pure: no Herdr, no I/O.
import { createGrid } from './grid.js';
import { drawHeader, drawNotes, drawFooter } from './frame.js';
import { layoutTree, drawTree } from './tree.js';

// Layout depends only on the flow object, so it is computed once per object.
const layouts = new WeakMap();

export function treeLayout(flow) {
  let lay = layouts.get(flow);
  if (!lay) {
    lay = layoutTree(flow);
    layouts.set(flow, lay);
  }
  return lay;
}

function agentsByNode(flow) {
  const map = new Map();
  for (const a of flow.agents ?? []) {
    if (!map.has(a.node)) map.set(a.node, []);
    map.get(a.node).push(a);
  }
  return map;
}

export function render(flow, { cols, rows, selected, view = 'map', flows = [flow] } = {}) {
  const g = createGrid(cols, rows);
  drawHeader(g, flow, { flows });
  const dashed = (flow.edges ?? []).some((e) => e.style === 'dashed');
  if (view === 'map' && flow.nodes?.length) drawTree(g, flow, treeLayout(flow), { selected, agentsByNode: agentsByNode(flow) });
  drawNotes(g, flow.notes);
  drawFooter(g, { dashed });
  return g;
}

export { toAnsi, diff, colorMode } from './ansi.js';
