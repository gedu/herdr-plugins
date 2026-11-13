import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, nodeRect } from '../src/popup.js';
import { menuRect, itemRow } from '../src/menu.js';
import * as store from '../src/store.js';
import { rowText } from '../src/render/grid.js';

const FIXTURES = new URL('../design/fixtures/', import.meta.url);
const COLS = 195;
const ROWS = 50;
let dir;
let saved;

beforeEach(() => {
  saved = process.env.HERDR_FLOWS_DIR;
  dir = mkdtempSync(join(tmpdir(), 'flow-map-popup-'));
  process.env.HERDR_FLOWS_DIR = dir;
  copyFileSync(new URL('purchase-flow.json', FIXTURES), join(dir, 'purchase-flow.json'));
  copyFileSync(new URL('refunds-v2.json', FIXTURES), join(dir, 'refunds-v2.json'));
});

afterEach(() => {
  if (saved === undefined) delete process.env.HERDR_FLOWS_DIR;
  else process.env.HERDR_FLOWS_DIR = saved;
  rmSync(dir, { recursive: true, force: true });
});

const readFlow = (id) => JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
const key = (name, ch) => ({ type: 'key', name, ...(ch ? { ch } : {}) });
const chars = (s) => [...s].map((ch) => key('char', ch));

async function open(opts = {}) {
  const app = createApp({ cols: COLS, rows: ROWS, flowId: 'purchase-flow', opener: () => {}, ...opts });
  await app.init();
  return app;
}

async function clickNode(app, id) {
  const r = nodeRect(app.state, app.ctx(), id);
  assert.ok(r, `node ${id} has a rect`);
  await app.handle({ type: 'mouse', kind: 'press', button: 0, col: r.col + 2, row: r.row + 1 });
  await app.handle({ type: 'mouse', kind: 'release', button: 0, col: r.col + 2, row: r.row + 1 });
}

test('click on a node selects it', async () => {
  const app = await open();
  await clickNode(app, 'ios');
  assert.equal(app.state.selected, 'ios');
  assert.equal(app.state.menu, null);
});

test('a second click on the selected node opens the state menu', async () => {
  const app = await open();
  await clickNode(app, 'ios');
  await clickNode(app, 'ios');
  assert.equal(app.state.menu?.node, 'ios');
  assert.equal(app.state.menu.mode, 'pick');
  // The menu is drawn inside the popup.
  const g = app.frame();
  const m = menuRect(app.state.menu, { cols: COLS, rows: ROWS });
  assert.ok(m.col >= 0 && m.row >= 0 && m.col + m.w <= COLS && m.row + m.h <= ROWS);
  assert.match(rowText(g, itemRow(m, 0)), /done/);
});

test('clicking `done` in the menu writes the state through the store as `you`', async () => {
  const app = await open();
  await clickNode(app, 'ios');
  await clickNode(app, 'ios');
  const m = menuRect(app.state.menu, { cols: COLS, rows: ROWS });
  await app.handle({ type: 'mouse', kind: 'press', button: 0, col: m.col + 3, row: itemRow(m, 0) });
  const flow = readFlow('purchase-flow');
  assert.equal(flow.nodes.find((n) => n.id === 'ios').state, 'done');
  assert.equal(flow.history.at(-1).who, 'you');
  assert.equal(app.state.menu, null);
  assert.equal(app.state.flows.get('purchase-flow').nodes.find((n) => n.id === 'ios').state, 'done');
});

test('keyboard path: s opens the menu, d marks done', async () => {
  const app = await open();
  await clickNode(app, 'android');
  await app.handle(key('char', 's'));
  assert.equal(app.state.menu?.node, 'android');
  await app.handle(key('char', 'd'));
  assert.equal(readFlow('purchase-flow').nodes.find((n) => n.id === 'android').state, 'done');
});

test('blocked asks for a reason and saves it', async () => {
  const app = await open();
  await clickNode(app, 'ios');
  await app.handle(key('char', 's'));
  await app.handle(key('char', 'b'));
  assert.equal(app.state.menu.mode, 'reason');
  for (const ev of chars('waiting on QA')) await app.handle(ev);
  await app.handle(key('enter'));
  const node = readFlow('purchase-flow').nodes.find((n) => n.id === 'ios');
  assert.equal(node.state, 'blocked');
  assert.equal(node.blocked_by, 'waiting on QA');
});

test('add note saves the text on the node (newest first, 5 kept) and in the history', async () => {
  const app = await open();
  await clickNode(app, 'ios');
  for (let i = 1; i <= 6; i++) {
    await app.handle(key('char', 's'));
    await app.handle(key('char', 'n'));
    assert.equal(app.state.menu.mode, 'note');
    for (const ev of chars(`note ${i}x`)) await app.handle(ev);
    await app.handle(key('backspace'));
    await app.handle(key('enter'));
  }
  const flow = readFlow('purchase-flow');
  const node = flow.nodes.find((n) => n.id === 'ios');
  assert.deepEqual(node.notes, ['note 6', 'note 5', 'note 4', 'note 3', 'note 2']);
  assert.equal(node.state, 'in_progress');
  assert.match(flow.history.at(-1).what, /note 6/);
  assert.equal(flow.history.at(-1).who, 'you');
});

test('a long note scrolls inside its field and never leaves the menu box', async () => {
  const app = await open();
  await clickNode(app, 'ios');
  await app.handle(key('char', 's'));
  await app.handle(key('char', 'n'));
  for (const ev of chars('x'.repeat(300))) await app.handle(ev);
  const g = app.frame();
  const m = menuRect(app.state.menu, { cols: COLS, rows: ROWS });
  for (let r = m.row; r < m.row + m.h; r++) {
    const line = rowText(g, r);
    // Nothing of the field spills to the right of the box.
    assert.equal(line.slice(m.col + m.w).includes('x'), false, `row ${r}`);
  }
  assert.ok(rowText(g, m.row + 2).includes('…'));
});

test('esc closes the menu without writing; q in a note is text, not quit', async () => {
  let quit = 0;
  const app = await open({ onQuit: () => quit++ });
  await clickNode(app, 'ios');
  const before = readFileSync(join(dir, 'purchase-flow.json'), 'utf8');
  await app.handle(key('char', 's'));
  await app.handle(key('escape'));
  assert.equal(app.state.menu, null);
  await app.handle(key('char', 's'));
  await app.handle(key('char', 'n'));
  await app.handle(key('char', 'q'));
  assert.equal(quit, 0);
  assert.equal(app.state.menu.input, 'q');
  await app.handle(key('escape'));
  assert.equal(app.state.menu, null);
  assert.equal(readFileSync(join(dir, 'purchase-flow.json'), 'utf8'), before);
  await app.handle(key('char', 'q'));
  assert.equal(quit, 1);
});

test('a file change keeps the selection, the open view and the scroll', async () => {
  const app = await open();
  await clickNode(app, 'android');
  await app.handle(key('enter'));
  assert.equal(app.state.view, 'detail');
  const scroll = app.state.scroll;
  await store.update('purchase-flow', (f) => { f.nodes.find((n) => n.id === 'web').state = 'pending'; }, { who: 'tab 2' });
  await app.reload(['purchase-flow']);
  assert.equal(app.state.selected, 'android');
  assert.equal(app.state.view, 'detail');
  assert.equal(app.state.scroll, scroll);
  assert.equal(app.state.flows.get('purchase-flow').nodes.find((n) => n.id === 'web').state, 'pending');
});

test('when the selected node is removed, its parent is selected', async () => {
  const app = await open();
  await clickNode(app, 'ios');
  await store.update('purchase-flow', (f) => {
    f.nodes = f.nodes.filter((n) => n.id !== 'ios');
    f.edges = f.edges.filter((e) => e.from !== 'ios' && e.to !== 'ios');
    f.agents = f.agents.filter((a) => a.node !== 'ios');
  });
  await app.reload(['purchase-flow']);
  assert.equal(app.state.selected, 'store-port');
});

test('another flow changing marks it unseen; tab switches flows and clears it', async () => {
  const app = await open();
  await store.update('refunds-v2', (f) => { f.now = 'moving'; }, { who: 'tab 4' });
  await app.reload(['refunds-v2']);
  assert.equal(app.state.unseen.has('refunds-v2'), true);
  await app.handle(key('tab'));
  assert.equal(app.state.flowId, 'refunds-v2');
  assert.equal(app.state.unseen.has('refunds-v2'), false);
  await app.handle(key('backtab'));
  assert.equal(app.state.flowId, 'purchase-flow');
});

test('clicking a tab in row 0 switches flow', async () => {
  const app = await open();
  const g = app.frame();
  const col = rowText(g, 0).indexOf('refunds-v2');
  assert.ok(col > 0);
  await app.handle({ type: 'mouse', kind: 'press', button: 0, col, row: 0 });
  assert.equal(app.state.flowId, 'refunds-v2');
});

test('g opens a URL ref, and only a URL', async () => {
  const opened = [];
  const app = await open({ opener: (url) => opened.push(url) });
  await clickNode(app, 'ios');
  await app.handle(key('char', 'g'));
  assert.deepEqual(opened, []);
  assert.match(app.state.message, /#277/);
  await store.update('purchase-flow', (f) => { f.nodes.find((n) => n.id === 'ios').issues = [{ ref: 'https://example.com/T-1', state: 'open' }]; });
  await app.reload(['purchase-flow']);
  await app.handle(key('char', 'g'));
  assert.deepEqual(opened, ['https://example.com/T-1']);
});
