// Goldens 02–07 and the interaction helpers (layout, hitTest, navigate).
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, layout, hitTest, navigate, drawTabs } from '../src/render/index.js';
import { createGrid, rowText } from '../src/render/grid.js';
import { colors } from '../src/render/tokens.js';

const design = new URL('../design/', import.meta.url);
const load = (p) => JSON.parse(readFileSync(new URL(p, design), 'utf8'));
const golden = (name) => readFileSync(new URL(`screens/${name}.txt`, design), 'utf8').replace(/\n$/, '').split('\n');

const tree = load('fixtures/purchase-flow.json');
const screens = load('fixtures/checkout-ui.json');
const layers = load('fixtures/purchase-layers.json');
const empty = load('fixtures/refunds-v2.json');
const three = [tree, screens, layers];
const four = [tree, screens, layers, empty];

const HINT = 'tab next flow · / all flows';
// Row 0 as text: tabs from col 1, 2 cols apart, the hint ending on the right margin.
const tabRow = (cols, tabs, hint = HINT) => (` ${tabs.join('  ')}`.padEnd(cols - 1 - hint.length) + hint).trimEnd();

// Compares a grid with a golden: text of every row, then the color of every non-space cell.
// patches: [row, col, text] where the renderer follows SPEC instead of the golden.
// rows: {row: text} replaces a whole row (its colors are then checked by the test itself).
// colorSkips: [row, fromCol, toCol] golden colors with no rule in SPEC.
// colorOverrides: [row, fromCol, toCol, style] where SPEC gives a different style than the golden.
function assertGolden(name, grid, { patches = [], rows = {}, colorSkips = [], colorOverrides = [] } = {}) {
  const { cols, rows: H } = grid;
  const lines = golden(name).map((l) => [...l.padEnd(cols)]);
  const patched = new Set();
  for (const [r, c, s] of patches) [...s].forEach((ch, i) => { lines[r][c + i] = ch; patched.add(`${r}:${c + i}`); });
  const want = lines.map((l, r) => (r in rows ? rows[r] : l.join('').trimEnd()));
  assert.equal(grid.rows, H);
  for (let r = 0; r < H; r++) assert.equal(rowText(grid, r).trimEnd(), want[r] ?? '', `${name} row ${r}`);

  const { lines: runs } = load(`screens/${name}.runs.json`);
  const inRange = (list, r, c) => list.find(([lr, a, b]) => lr === r && c >= a && c <= b);
  for (let r = 0; r < H; r++) {
    if (r in rows) continue;
    const have = [];
    for (let c = 0; c < cols; c++) {
      const cell = grid.cells[r * cols + c];
      if (cell.ch && cell.ch !== ' ' && !patched.has(`${r}:${c}`)) have.push({ c, cell });
    }
    const goldenRow = [...(golden(name)[r] ?? '')];
    const expected = [];
    let i = 0;
    for (const run of runs[r] ?? []) {
      for (const ch of run.text) {
        if (ch === ' ') continue;
        let n = -1;
        let col = -1;
        for (let c = 0; c < goldenRow.length; c++) if (goldenRow[c] !== ' ' && ++n === i) { col = c; break; }
        i++;
        if (!patched.has(`${r}:${col}`)) expected.push({ ch, run, col });
      }
    }
    assert.equal(have.length, expected.length, `${name} row ${r} non-space count`);
    expected.forEach(({ ch, run }, k) => {
      const { c, cell } = have[k];
      assert.equal(cell.ch, ch, `${name} row ${r} col ${c} char`);
      if (inRange(colorSkips, r, c)) return;
      const style = { fg: run.fg, bg: run.bg ?? colors.background.hex, bold: !!run.bold, ...(inRange(colorOverrides, r, c)?.[3] ?? {}) };
      assert.equal(colors[cell.fg ?? 'text'].hex, style.fg, `${name} row ${r} col ${c} '${ch}' fg`);
      assert.equal(colors[cell.bg ?? 'background'].hex, style.bg, `${name} row ${r} col ${c} '${ch}' bg`);
      assert.equal(!!cell.bold, style.bold, `${name} row ${r} col ${c} '${ch}' bold`);
    });
  }
}

const cell = (g, c, r) => g.cells[r * g.cols + c];
const strip = (f) => { const c = structuredClone(f); for (const n of c.nodes) { delete n.pos; delete n.w; } return c; };

// --- 02 screen flow -------------------------------------------------------------------------

test('02 screen flow matches the golden grid and colors', () => {
  const g = render(screens, { cols: 140, rows: 44, selected: 'plan-picker', flows: three });
  assertGolden('02-screen-flow', g, {
    rows: { 0: tabRow(140, [' ■ purchase-flow  5/9 ', ' checkout-ui  1/4 ', ' ■ purchase-layers  4/9 ']) },
    // SPEC §2: the selected node gets `▸` 2 cols left of the box on its title row.
    patches: [[12, 36, '▸']],
    // SPEC §2 / tokens: a pending title is muted, not bold (the golden draws it bold).
    colorOverrides: [[12, 76, 85, { bold: false }], [12, 112, 120, { bold: false }]],
    // Golden colors an issue number inside a note; SPEC has no rule for it.
    colorSkips: [[37, 18, 21]],
  });
  assert.equal(cell(g, 2, 0).fg, 'blocked', '■ marker of a flow with a blocked node');
  assert.equal(cell(g, 36, 12).fg, 'accent');
});

// --- 03 architecture ------------------------------------------------------------------------

const LAYER_POS = {
  screens: [54, 7, 29], hook: [54, 13, 29], 'checkout-port': [22, 20, 29], 'store-port': [86, 20, 29],
  'web-adapter': [22, 27, 29], placeholder: [70, 27, 27], 'expo-iap': [102, 27, 27], wlc: [22, 34, 29], orders: [101, 34, 29],
};
function layersFromGolden() {
  const f = structuredClone(layers);
  for (const n of f.nodes) { const [col, row, w] = LAYER_POS[n.id]; n.pos = { col, row }; n.w = w; }
  return f;
}
const LAYERS_ROW0 = tabRow(140, [' ■ purchase-flow  5/9 ', ' checkout-ui  1/4 ', ' purchase-layers  4/9 ']);

test('03 architecture from golden positions matches the golden grid and colors', () => {
  const f = layersFromGolden();
  const g = render(f, { cols: 140, rows: 44, selected: 'store-port', flows: [tree, screens, f] });
  assertGolden('03-architecture', g, {
    rows: { 0: LAYERS_ROW0 },
    patches: [
      [21, 84, '▸'],
      // SPEC §2: issue chips are two spaces apart (the golden uses ` · ` here only).
      [22, 88, '#273 merged  #277 open '],
    ],
  });
});

test('03 architecture automatic layout: layer rows, gutter, straight and dashed edges', () => {
  const f = structuredClone(layers);
  const g = render(f, { cols: 140, rows: 44, selected: 'store-port', flows: [tree, screens, f] });
  const lay = layout(f, { cols: 140, rows: 44 });
  assert.equal(lay.kind, 'layers');
  // Layer tops follow the golden: 2 connector rows when straight, 3 when branching or labelled.
  const top = (id) => lay.rects.get(id).row;
  assert.deepEqual(['screens', 'hook', 'checkout-port', 'web-adapter', 'wlc'].map(top), [7, 13, 20, 27, 34]);
  assert.equal(top('store-port'), 20);
  for (const [r, label] of [[8, 'UI'], [14, 'domain'], [21, 'ports'], [28, 'adapters'], [35, 'backend']]) {
    assert.ok(rowText(g, r).startsWith(` ${label}`), `gutter ${label}`);
  }
  // No box overlaps another, and every box sits right of the gutter.
  const rects = [...lay.rects.values()];
  for (const a of rects) {
    assert.ok(a.col >= 13);
    for (const b of rects) if (a !== b) assert.ok(a.row + a.h <= b.row || b.row + b.h <= a.row || a.col + a.w <= b.col || b.col + b.w <= a.col);
  }
  // The dashed edge expo-iap → orders: ┆ in the blocked color, both labels drawn whole.
  const ex = lay.rects.get('expo-iap');
  const c = ex.col + Math.floor(ex.w / 2);
  assert.equal(cell(g, c, ex.row + ex.h).ch, '┆');
  assert.equal(cell(g, c, ex.row + ex.h).fg, 'blocked');
  const map = Array.from({ length: 32 }, (_, r) => rowText(g, r + 6)).join('\n');
  for (const l of ['POST /orders/appleTransaction', 'POST /orders/googlePurchase', 'opens the checkout URL', 'POST /wlc/checkout-token']) assert.ok(map.includes(l), l);
});

// --- 04 node detail -------------------------------------------------------------------------

function detailFlow() {
  const f = structuredClone(tree);
  const a = f.nodes.find((n) => n.id === 'android');
  a.description = 'purchaseToken · its own endpoint · its own storefront format';
  a.issues = [
    { n: 277, state: 'open', title: 'Real adapter (expo-iap)', blocked_by: 'the client: store products and /orders/* are not on staging' },
    { n: 273, state: 'merged', title: 'StorePort and placeholder adapters' },
  ];
  a.notes = [
    'Android returns a purchaseToken, not a signedTransaction, so it has its own endpoint and its own storefront format.',
    'It runs on the placeholder adapter until #277 (expo-iap) lands.',
  ];
  a.history = [
    { at: '2026-11-13T12:01:00Z', who: 2, what: 'added a note about purchaseToken' },
    { at: '2026-11-13T11:40:00Z', who: 3, what: 'linked #277 to iOS and Android' },
    { at: '2026-11-13T11:12:00Z', who: 2, what: 'state → in progress' },
    { at: '2026-11-13T10:30:00Z', who: 'you', what: 'created the node' },
  ];
  f.agents.find((x) => x.tab === 2).at = '2026-11-13T12:01:00Z';
  f.edges.find((e) => e.to === 'android').note = 'restore, start free trial';
  Object.assign(f.edges.find((e) => e.from === 'android'), { label: 'POST /orders/googlePurchase', note: 'placeholder adapter for now: no network call' });
  return f;
}
const TREE_ROW0 = tabRow(140, [' purchase-flow  5/9 ', ' checkout-ui  1/4 ', ' ■ purchase-layers  4/9 ']);

test('04 node detail matches the golden grid and colors', () => {
  const f = detailFlow();
  const g = render(f, { cols: 140, rows: 44, selected: 'android', view: 'detail', detail: { issue: 0 }, now: new Date('2026-11-13T12:05:00Z'), flows: [f, screens, layers] });
  assertGolden('04-node-detail', g, { rows: { 0: TREE_ROW0 } });
});

test('04 detail: an issue ref that is not a number has no "on GitHub" hint', () => {
  const f = detailFlow();
  f.nodes.find((n) => n.id === 'android').issues = [{ ref: 'PROJ-12', state: 'open', title: 'a ticket' }];
  const g = render(f, { cols: 140, rows: 44, selected: 'android', view: 'detail', detail: { issue: 0 }, flows: [f] });
  assert.match(rowText(g, 43), /g open PROJ-12 {3}/);
  assert.match(rowText(g, 13), /▸ PROJ-12/);
});

// --- 05 narrow vertical ---------------------------------------------------------------------

const NOTES_05 = [
  'Web is built and merged (#278, #454). StorePort (#273) is merged;',
  'iOS and Android run on a placeholder because the stores differ.',
  '■ Blocked: the real adapter #277 (expo-iap) waits on the client',
  'for store products and the /orders/* endpoints on staging.',
];

test('05 narrow vertical matches the golden grid and colors', () => {
  const f = strip(tree);
  f.notes = NOTES_05; // the golden was drawn with shorter notes than the fixture
  const g = render(f, { cols: 76, rows: 44, selected: 'android', flows: [f, screens, layers] });
  assert.equal(layout(f, { cols: 76, rows: 44 }).kind, 'vertical');
  assertGolden('05-narrow-vertical', g, {
    patches: [
      // §3 widths (no fixture `w`) need 124 columns; the golden says 118.
      [6, 34, '124'],
      // S2: when `· next: …` does not fit it is dropped whole; the golden also drops a word that fits.
      [4, 48, 'adapter'],
      // SPEC §10: edge labels are indented under the title (title col + 2); the golden uses +3 here only.
      [12, 10, 'POST /wlc/checkout-token '],
      // The right column shows issues, else the detail (the golden shows the root's detail only).
      [24, 60, 'no store on web'],
      // The golden appends ` · detail` to two leaf titles (web, native) by hand; the renderer shows
      // the title only (the detail goes to the right column when there are no issues).
      [13, 14, '                  '], [14, 17, '                  '],
    ],
  });
});

// --- 06 empty -------------------------------------------------------------------------------

test('06 empty state matches the golden grid and colors', () => {
  const g = render(empty, { cols: 140, rows: 44, flows: four });
  assertGolden('06-empty-state', g, {
    rows: { 0: tabRow(140, [' ■ purchase-flow  5/9 ', ' checkout-ui  1/4 ', ' ■ purchase-layers  4/9 ', ' refunds-v2  0/0 ']) },
  });
  assert.equal(layout(empty, { cols: 140, rows: 44 }).kind, 'empty');
});

// --- 07 flow switcher -----------------------------------------------------------------------

test('07 flow list matches the golden grid and colors (rows 16–26 are design annotations)', () => {
  const g = render(tree, { cols: 140, rows: 44, view: 'list', list: { index: 0 }, flows: four });
  const rows = { 0: tabRow(140, [' purchase-flow  5/9 ', ' checkout-ui  1/4 ', ' ■ purchase-layers  4/9 ', ' refunds-v2  0/0 '], 'esc close the list') };
  for (let r = 16; r <= 26; r++) rows[r] = '';
  assertGolden('07-flow-switcher', g, {
    rows,
    // The feature column is 36 wide plus a 2-col gap: longer features are cut with `…`
    // (the golden shortens `Purchase screens · built one at a time` by hand).
    patches: [[6, 25, 'Purchase screens · built one at a t…']],
  });
});

test('07 tab bar: markers ● (unseen) and ■ (blocked), the active tab without a marker', () => {
  const g = createGrid(140, 1);
  const flows = [tree, { ...screens, unseen: true }, layers, empty];
  drawTabs(g, 0, tree, flows);
  assert.equal(rowText(g, 0).trimEnd(), golden('07-flow-switcher')[18]);
  const ch = (s) => rowText(g, 0).indexOf(s);
  assert.equal(cell(g, ch('●'), 0).fg, 'accent');
  assert.equal(cell(g, ch('■'), 0).fg, 'blocked');
});

test('07 tab bar collapsed: ‹ N and N more › around the visible tabs, active tab visible', () => {
  const extra = (id) => ({ id, nodes: [{ id: 'a', state: 'done' }, { id: 'b', state: 'pending' }] });
  const flows = [extra('a-flow'), extra('b-flow'), tree, { ...screens, unseen: true }, layers, extra('c-flow'), extra('d-flow')];
  const g = createGrid(92, 1);
  drawTabs(g, 0, tree, flows);
  assert.equal(rowText(g, 0).trimEnd(), golden('07-flow-switcher')[24]);
  assert.equal(cell(g, 1, 0).fg, 'muted');
  // The last flow active: it is still shown.
  const h = createGrid(92, 1);
  drawTabs(h, 0, flows[6], flows);
  assert.match(rowText(h, 0), /d-flow {2}1\/2/);
  assert.match(rowText(h, 0), /^ ‹ \d/);
});

// --- layout, clipping, label fit ------------------------------------------------------------

test('layout dispatches on flow.layout and width; result is cached per flow and size', () => {
  assert.equal(layout(tree, { cols: 140, rows: 44 }).kind, 'tree');
  assert.equal(layout(screens, { cols: 140, rows: 44 }).kind, 'screens');
  assert.equal(layout(screens, { cols: 100, rows: 44 }).kind, 'vertical');
  assert.equal(layout(layers, { cols: 140, rows: 44 }).kind, 'layers');
  const a = layout(tree, { cols: 140, rows: 44 });
  const b = layout(tree, { cols: 140, rows: 44 });
  assert.equal(a.rects, b.rects);
});

test('label fit: with room, sibling gaps widen so every edge label is drawn whole', () => {
  const f = strip(tree);
  const g = render(f, { cols: 195, rows: 50, flows: [f] });
  const map = Array.from({ length: 34 }, (_, r) => rowText(g, r + 6)).join('\n');
  for (const e of f.edges) if (e.label) assert.ok(map.includes(e.label), `label "${e.label}" whole`);
  assert.ok(!map.includes('…'), 'nothing cut');
  const lay = layout(f, { cols: 195, rows: 50 });
  const c = (id) => lay.rects.get(id).col + Math.floor(lay.rects.get(id).w / 2);
  assert.ok(c('nostore') - c('android') >= 'POST /orders/googlePurchase'.length + 3);
});

test('label fit: too narrow for the wide layout, labels are cut with … instead', () => {
  const f = strip(tree);
  const g = render(f, { cols: 128, rows: 44, flows: [f] });
  assert.equal(layout(f, { cols: 128, rows: 44 }).kind, 'tree');
  const map = Array.from({ length: 30 }, (_, r) => rowText(g, r + 6)).join('\n');
  assert.ok(map.includes('…'));
});

function chain(n) {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, title: `step ${i}`, state: i < 3 ? 'done' : 'pending', issues: [] }));
  const edges = nodes.slice(1).map((x, i) => ({ from: `n${i}`, to: x.id }));
  return { id: 'chain', feature: 'tall', layout: 'tree', now: '', agents: [], nodes, edges, notes: ['one note', 'two notes'] };
}

test('map clipping: a tall map never draws over the notes; ▼ / ▲ N more mark hidden nodes', () => {
  const f = chain(12);
  const g = render(f, { cols: 100, rows: 40, selected: 'n0', flows: [f] });
  const ruleRow = 40 - 4 - 2;
  assert.match(rowText(g, ruleRow), /^ ── notes ─/);
  assert.match(rowText(g, ruleRow + 1), /one note/);
  assert.match(rowText(g, ruleRow - 1), /▼ \d+ more/);
  assert.equal(cell(g, rowText(g, ruleRow - 1).indexOf('▼'), ruleRow - 1).fg, 'muted');
  assert.equal(g.scroll, 0);
  // Selecting the last node scrolls so it is visible, with ▲ at the top of the map.
  const s = render(f, { cols: 100, rows: 40, selected: 'n11', flows: [f] });
  assert.ok(s.scroll > 0);
  assert.match(rowText(s, 6), /▲ \d+ more/);
  const text = Array.from({ length: ruleRow - 6 }, (_, r) => rowText(s, r + 6)).join('\n');
  assert.ok(text.includes('step 11'));
  // The popup keeps the scroll: passing it back renders the same frame.
  const again = render(f, { cols: 100, rows: 40, selected: 'n11', scroll: s.scroll, flows: [f] });
  assert.equal(again.scroll, s.scroll);
  assert.equal(layout(f, { cols: 100, rows: 40, scroll: s.scroll, selected: 'n11' }).scroll, s.scroll);
});

function fan(n) {
  const f = chain(1);
  for (let i = 1; i <= n; i++) {
    f.nodes.push({ id: `n${i}`, title: `step ${i}`, state: 'pending', issues: [] });
    f.edges.push({ from: 'n0', to: `n${i}` });
  }
  return f;
}

test('vertical layout scrolls with the selection: ▲ / ▼ N more rows', () => {
  const f = fan(30);
  const g = render(f, { cols: 40, rows: 30, selected: 'n30', flows: [f] });
  assert.equal(layout(f, { cols: 40, rows: 30 }).kind, 'vertical');
  assert.ok(g.scroll > 0);
  const all = Array.from({ length: 30 }, (_, r) => rowText(g, r)).join('\n');
  assert.match(all, /▲ \d+ more/);
  assert.ok(all.includes('step 30'));
  const top = render(f, { cols: 40, rows: 30, selected: 'n0', flows: [f] });
  assert.equal(top.scroll, 0);
  assert.match(Array.from({ length: 30 }, (_, r) => rowText(top, r)).join('\n'), /▼ \d+ more/);
});

// --- hitTest and navigate -------------------------------------------------------------------

test('hitTest: border and inside of a box hit it, outside and header do not', () => {
  const opts = { cols: 140, rows: 44 };
  assert.equal(hitTest(tree, opts, 46, 6), 'root', 'top-left border');
  assert.equal(hitTest(tree, opts, 76, 9), 'root', 'bottom-right border');
  assert.equal(hitTest(tree, opts, 60, 7), 'root', 'inside');
  assert.equal(hitTest(tree, opts, 45, 7), null, 'left of the box');
  assert.equal(hitTest(tree, opts, 60, 0), null, 'tab row');
  assert.equal(hitTest(tree, opts, 90, 25), 'android');
});

test('hitTest in the vertical layout: the whole row of a node', () => {
  const f = strip(tree);
  const opts = { cols: 76, rows: 44 };
  assert.equal(hitTest(f, opts, 40, 20), 'android');
  assert.equal(hitTest(f, opts, 40, 19), null, 'edge label row');
});

test('navigate tree: ↓ first child, ↑ parent, ←→ siblings', () => {
  const o = { cols: 140, rows: 44 };
  assert.equal(navigate(tree, o, 'root', 'down'), 'web-port');
  assert.equal(navigate(tree, o, 'store-port', 'down'), 'ios');
  assert.equal(navigate(tree, o, 'store-port', 'up'), 'root');
  assert.equal(navigate(tree, o, 'store-port', 'left'), 'web-port');
  assert.equal(navigate(tree, o, 'ios', 'right'), 'android');
  assert.equal(navigate(tree, o, 'android', 'left'), 'ios');
  assert.equal(navigate(tree, o, 'android', 'down'), 'adapter');
  assert.equal(navigate(tree, o, 'adapter', 'up'), 'ios');
  assert.equal(navigate(tree, o, 'root', 'up'), 'root');
  assert.equal(navigate(tree, o, 'native', 'right'), 'ios', 'nearest to the right across subtrees');
  assert.equal(navigate(tree, o, null, 'down'), 'root');
});

test('navigate screens: ←→ along the flow', () => {
  const o = { cols: 140, rows: 44 };
  assert.equal(navigate(screens, o, 'plan-picker', 'right'), 'checkout');
  assert.equal(navigate(screens, o, 'plan-picker', 'left'), 'login');
  assert.equal(navigate(screens, o, 'success', 'right'), 'success');
});

test('navigate layers: ↑↓ along dependencies, ←→ within a layer', () => {
  const o = { cols: 140, rows: 44 };
  assert.equal(navigate(layers, o, 'hook', 'down'), 'checkout-port');
  assert.equal(navigate(layers, o, 'store-port', 'up'), 'hook');
  assert.equal(navigate(layers, o, 'store-port', 'down'), 'placeholder');
  assert.equal(navigate(layers, o, 'store-port', 'left'), 'checkout-port');
  assert.equal(navigate(layers, o, 'placeholder', 'right'), 'expo-iap');
});

test('navigate vertical: ↑↓ by rows', () => {
  const f = strip(tree);
  const o = { cols: 76, rows: 44 };
  assert.equal(navigate(f, o, 'android', 'up'), 'ios');
  assert.equal(navigate(f, o, 'android', 'down'), 'adapter');
  assert.equal(navigate(f, o, 'root', 'up'), 'root');
  assert.equal(navigate(screens, { cols: 100, rows: 44 }, 'plan-picker', 'right'), 'checkout', 'screens stay ←→ in the list');
});

// --- performance ----------------------------------------------------------------------------

test('render at 195×50 stays well under a frame budget', () => {
  const f = strip(tree);
  const opts = { cols: 195, rows: 50, selected: 'android', flows: three };
  render(f, opts);
  const n = 200;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) render(f, opts);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  assert.ok(ms < 5, `${ms.toFixed(3)} ms per frame`);
});
