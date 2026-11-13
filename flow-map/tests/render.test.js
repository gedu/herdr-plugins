import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../src/render/index.js';
import { rowText } from '../src/render/grid.js';
import { colors } from '../src/render/tokens.js';

const design = new URL('../design/', import.meta.url);
const load = (p) => JSON.parse(readFileSync(new URL(p, design), 'utf8'));
const golden = (name) => readFileSync(new URL(`screens/${name}.txt`, design), 'utf8').replace(/\n$/, '').split('\n');

const flow = load('fixtures/purchase-flow.json');
const flows = [flow, load('fixtures/checkout-ui.json'), load('fixtures/purchase-layers.json')];

// Where the renderer follows SPEC instead of the golden (cells as [row, col, expected char]).
// 1. SPEC §5 known quirk: `POST /orders/googlePurchase` ends flush against the next stub;
//    the renderer keeps a 1-cell gap, so the label is cut with `…`.
// 2. SPEC §3 "rows 2 and 3 disappear when empty": `web · noStore` has no issues, so it is 4 rows
//    tall (bottom border on row 26), while the golden draws an empty issue row.
// 3. SPEC §9: a flow with a blocked node shows `■` before its id on its tab (not on the active one).
const patches = [
  ...[...'■ purchase-layers  4/9'].map((ch, i) => [0, 44 + i, ch]),
  [21, 126, '…'], [21, 127, ' '],
  ...'╰───────────────────╯'.split('').map((ch, i) => [26, 118 + i, ch]),
  ...Array.from({ length: 21 }, (_, i) => [27, 118 + i, ' ']),
];
// Golden colors with no rule in SPEC: one word of a note drawn in green.
const colorSkips = [[37, 'CheckoutBrowser']];

function expectedLines() {
  const lines = golden('01-tree-flow').map((l) => [...l.padEnd(140)]);
  for (const [r, c, ch] of patches) lines[r][c] = ch;
  return lines.map((l) => l.join('').trimEnd());
}

function assertGrid(grid) {
  const want = expectedLines();
  assert.equal(grid.rows, 44);
  for (let r = 0; r < 44; r++) assert.equal(rowText(grid, r).trimEnd(), want[r], `row ${r}`);
}

// Walks the golden runs and the grid in order, comparing every non-space character.
function assertColors(grid) {
  const { lines } = load('screens/01-tree-flow.runs.json');
  const patched = new Set(patches.map(([r, c]) => `${r}:${c}`));
  for (let r = 0; r < 44; r++) {
    const cells = [];
    for (let c = 0; c < grid.cols; c++) {
      const cell = grid.cells[r * grid.cols + c];
      if (cell.ch && cell.ch !== ' ' && !patched.has(`${r}:${c}`)) cells.push({ c, cell });
    }
    const runs = [];
    for (const run of lines[r]) {
      const skip = colorSkips.some(([sr, word]) => sr === r && run.text === word);
      for (const ch of run.text) if (ch !== ' ') runs.push({ ch, run, skip });
    }
    const goldenRow = [...golden('01-tree-flow')[r] ?? ''];
    const want = runs.filter((x, i) => !patched.has(`${r}:${colOf(goldenRow, i)}`));
    assert.equal(cells.length, want.length, `row ${r} non-space count`);
    want.forEach(({ ch, run, skip }, i) => {
      const { c, cell } = cells[i];
      assert.equal(cell.ch, ch, `row ${r} col ${c} char`);
      if (skip) return;
      assert.equal(colors[cell.fg ?? 'text'].hex, run.fg, `row ${r} col ${c} '${ch}' fg`);
      assert.equal(colors[cell.bg ?? 'background'].hex, run.bg ?? colors.background.hex, `row ${r} col ${c} '${ch}' bg`);
      assert.equal(!!cell.bold, !!run.bold, `row ${r} col ${c} '${ch}' bold`);
    });
  }
}

// Column of the i-th non-space character of a golden row.
function colOf(chars, i) {
  let n = -1;
  for (let c = 0; c < chars.length; c++) if (chars[c] !== ' ' && ++n === i) return c;
  return -1;
}

const opts = { cols: 140, rows: 44, selected: flow.selected, view: 'map', flows };

test('01 tree flow from fixture pos/w matches the golden grid', () => {
  assertGrid(render(flow, opts));
});

test('01 tree flow colors match the golden runs', () => {
  const g = render(flow, opts);
  assertColors(g);
  assert.equal(g.cells[44].fg, 'blocked', '■ tab marker');
});

test('01 tree flow with automatic layout (no pos) matches the golden grid and colors', () => {
  const auto = structuredClone(flow);
  for (const n of auto.nodes) delete n.pos;
  const grid = render(auto, { ...opts, flows: [auto, ...flows.slice(1)] });
  assertGrid(grid);
  assertColors(grid);
});

function boxEdges(grid, row) {
  const line = [];
  for (let c = 0; c < grid.cols; c++) line.push(grid.cells[row * grid.cols + c].ch);
  return line;
}

test('a very long title is cut with … and the box borders stay aligned', () => {
  const f = {
    id: 'long', feature: 'x', layout: 'tree', now: '', agents: [], notes: [],
    nodes: [{ id: 'a', title: 'a title that is far too long to ever fit inside a node box', detail: 'detail '.repeat(20), state: 'done', issues: [] }],
    edges: [],
  };
  const g = render(f, { cols: 140, rows: 44, flows: [f] });
  const top = boxEdges(g, 6);
  const left = top.indexOf('╭');
  const right = top.indexOf('╮');
  assert.equal(right - left + 1, 33, 'clamped to max width');
  for (const r of [7, 8]) {
    const row = boxEdges(g, r);
    assert.equal(row[left], '│');
    assert.equal(row[right], '│', `row ${r} right border`);
    assert.equal(row[right - 2], '…', `row ${r} cut with …`);
  }
});

test('a wide (CJK/emoji) char in a title keeps the right border in its column', () => {
  const f = {
    id: 'wide', feature: 'x', layout: 'tree', now: '', agents: [], notes: [],
    nodes: [{ id: 'a', title: '日本語のタイトル🙂 and some more text here', state: 'in_progress', issues: [{ ref: 'PROJ-12', state: 'open' }] }],
    edges: [],
  };
  const g = render(f, { cols: 140, rows: 44, flows: [f] });
  const top = boxEdges(g, 6);
  const left = top.indexOf('┏');
  const right = top.indexOf('┓');
  for (const r of [7, 8]) assert.equal(boxEdges(g, r)[right], '┃', `row ${r}`);
  assert.equal(boxEdges(g, 9)[right], '┛');
  assert.match(rowText(g, 8), /PROJ-12 open/);
  assert.ok(left > 0);
});
