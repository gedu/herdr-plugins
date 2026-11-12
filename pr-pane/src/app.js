// What the panel does with keys, clicks and timer ticks. No terminal I/O here: main.js owns
// the screen and stdin, so this runs against fakes in tests.
import { render, listOrder } from './render.js';

export function createApp({ host, tracker, sessionPane = null }) {
  const state = { cards: [], sessionPane, sessionName: '', view: 'list', selected: null, error: '' };
  const app = { host, state };

  const order = () => listOrder(state.cards, state.sessionPane);
  const find = (url) => state.cards.find((c) => c.url === url);

  function sync() {
    state.cards = tracker.cards();
    const list = order();
    if (!list.some((c) => c.url === state.selected)) state.selected = list[0]?.url ?? null;
    if (state.view === 'detail' && !find(state.selected)) state.view = 'list';
  }

  app.tick = async ({ force = false } = {}) => {
    let agents;
    try {
      agents = await app.host.agents();
    } catch (error) {
      state.error = error.message;
      return;
    }
    // While the panel itself has focus no agent is focused: keep the last session.
    const focused = agents.find((a) => a.focused);
    if (focused) {
      state.sessionPane = focused.pane;
      state.sessionName = focused.session;
    } else if (state.sessionPane) {
      state.sessionName = agents.find((a) => a.pane === state.sessionPane)?.session ?? state.sessionName;
    }
    await tracker.tick(agents, { force });
    state.error = tracker.lastError();
    sync();
  };

  async function go(url) {
    const card = find(url);
    if (card?.agent) await app.host.focus(card.agent);
  }

  function move(step) {
    const list = order();
    if (!list.length) return;
    const at = Math.max(0, list.findIndex((c) => c.url === state.selected));
    state.selected = list[Math.min(list.length - 1, Math.max(0, at + step))].url;
  }

  function dismiss(url) {
    if (!url) return;
    const list = order();
    const at = list.findIndex((c) => c.url === url);
    tracker.dismiss(url);
    sync();
    const next = order();
    state.selected = next[Math.min(Math.max(at, 0), next.length - 1)]?.url ?? null;
    state.view = 'list';
  }

  // Returns 'quit' when the panel should close.
  app.key = async (name) => {
    const url = state.selected;
    if (name === 'q' || name === 'ctrl-c') return 'quit';
    if (name === 'o') { if (url) await app.host.open(url); return; }
    if (name === 'x') return dismiss(url);
    if (name === 'enter' || name === 'g') return go(url);
    if (name === 'r') return app.tick({ force: true });
    if (state.view === 'detail') {
      if (['escape', 'left', 'h', 'backspace'].includes(name)) state.view = 'list';
      return;
    }
    if (name === 'down' || name === 'j') move(1);
    else if (name === 'up' || name === 'k') move(-1);
    else if ((name === 'right' || name === 'l' || name === 'i') && url) state.view = 'detail';
  };

  // `row` and `col` are 0-based screen cells.
  app.click = async (row, col, size) => {
    const hit = render(state, size).hits.find((h) => h.row === row && col >= h.from && col < h.to);
    if (!hit) return;
    if (hit.url) state.selected = hit.url;
    if (hit.action === 'go') return go(hit.url);
    if (hit.action === 'dismiss') return dismiss(hit.url);
    if (hit.action === 'back') state.view = 'list';
    if (hit.action === 'refresh') return app.tick({ force: true });
  };

  app.frame = (size) => render(state, size).lines;
  return app;
}
