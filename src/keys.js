// Raw terminal input to events: keys by name, and left clicks from SGR mouse reports (0-based cells).
const ARROWS = { A: 'up', B: 'down', C: 'right', D: 'left' };

export function parseInput(text) {
  const events = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(rest);
    if (mouse) {
      const [, b, x, y, kind] = mouse;
      const button = Number(b);
      if (kind === 'M' && button === 0) events.push({ type: 'click', row: Number(y) - 1, col: Number(x) - 1 });
      else if (kind === 'M' && button === 64) events.push({ type: 'key', name: 'up' });
      else if (kind === 'M' && button === 65) events.push({ type: 'key', name: 'down' });
      i += mouse[0].length;
      continue;
    }
    const arrow = /^\x1b[[O]([ABCD])/.exec(rest);
    if (arrow) { events.push({ type: 'key', name: ARROWS[arrow[1]] }); i += arrow[0].length; continue; }
    const other = /^\x1b\[[0-9;]*[~A-Za-z]/.exec(rest);
    if (other) { i += other[0].length; continue; } // unhandled escape sequence
    const ch = text[i];
    if (ch === '\x1b') events.push({ type: 'key', name: 'escape' });
    else if (ch === '\r' || ch === '\n') events.push({ type: 'key', name: 'enter' });
    else if (ch === '\x7f' || ch === '\b') events.push({ type: 'key', name: 'backspace' });
    else if (ch === '\x03') events.push({ type: 'key', name: 'ctrl-c' });
    else if (ch >= ' ') events.push({ type: 'key', name: ch });
    i += 1;
  }
  return events;
}
