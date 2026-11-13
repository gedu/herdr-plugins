// Raw stdin → events. Pure: no I/O. Keys are {type:'key', name, ch?}; SGR-1006 mouse reports are
// {type:'mouse', kind: press|release|drag|wheel, button, col, row, wheel?} with 0-based col/row.
// An escape sequence cut at the end of a chunk is kept until the next chunk; a lone ESC stays
// pending until flush() (the caller flushes after a short pause, so a plain esc still works).

const SIMPLE = {
  '\r': 'enter', '\n': 'enter', '\t': 'tab', '\x7f': 'backspace', '\b': 'backspace', '\x03': 'ctrl-c',
};
const CSI_KEYS = { A: 'up', B: 'down', C: 'right', D: 'left', Z: 'backtab', H: 'home', F: 'end' };
const WHEEL = ['up', 'down', 'left', 'right'];

function mouse(params, final) {
  const [b, x, y] = params.split(';').map(Number);
  if (![b, x, y].every(Number.isInteger)) return null;
  const col = x - 1;
  const row = y - 1;
  if (b & 64) return { type: 'mouse', kind: 'wheel', wheel: WHEEL[b & 3], button: b & ~(4 | 8 | 16 | 32), col, row };
  const button = b & 3;
  if (b & 32) return { type: 'mouse', kind: 'drag', button, col, row };
  return { type: 'mouse', kind: final === 'M' ? 'press' : 'release', button, col, row };
}

// One escape sequence starting at s[i] (s[i] === ESC). Returns {event, end} or null when incomplete.
function escape(s, i) {
  if (i + 1 >= s.length) return null;
  const next = s[i + 1];
  if (next === 'O') {
    if (i + 2 >= s.length) return null;
    const name = CSI_KEYS[s[i + 2]];
    return { event: name ? { type: 'key', name } : { type: 'key', name: 'unknown', seq: s.slice(i, i + 3) }, end: i + 3 };
  }
  if (next !== '[') return { event: { type: 'key', name: 'escape' }, end: i + 1 };
  // CSI: parameter bytes 0x30–0x3F, intermediate 0x20–0x2F, final 0x40–0x7E.
  let j = i + 2;
  while (j < s.length && s.charCodeAt(j) >= 0x20 && s.charCodeAt(j) <= 0x3f) j++;
  if (j >= s.length) return null;
  const code = s.charCodeAt(j);
  const seq = s.slice(i, j + 1);
  if (code < 0x40 || code > 0x7e) return { event: { type: 'key', name: 'unknown', seq: s.slice(i, j) }, end: j };
  const params = s.slice(i + 2, j);
  const final = s[j];
  if (params.startsWith('<') && (final === 'M' || final === 'm')) {
    const ev = mouse(params.slice(1), final);
    return { event: ev ?? { type: 'key', name: 'unknown', seq }, end: j + 1 };
  }
  const name = CSI_KEYS[final];
  return { event: name && /^(1(;\d+)?)?$/.test(params) ? { type: 'key', name } : { type: 'key', name: 'unknown', seq }, end: j + 1 };
}

export function createParser() {
  let rest = '';
  const run = (s, final) => {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\x1b') {
        const got = escape(s, i);
        if (!got) {
          if (!final) break;
          out.push({ type: 'key', name: 'escape' });
          i++;
          continue;
        }
        out.push(got.event);
        i = got.end;
        continue;
      }
      if (SIMPLE[ch]) out.push({ type: 'key', name: SIMPLE[ch] });
      else {
        const cp = s.codePointAt(i);
        const char = String.fromCodePoint(cp);
        if (cp >= 0x20) out.push({ type: 'key', name: 'char', ch: char });
        i += char.length;
        continue;
      }
      i++;
    }
    rest = s.slice(i);
    return out;
  };
  return {
    feed: (chunk) => run(rest + chunk, false),
    // Resolves whatever is pending: a lone ESC becomes the esc key.
    flush: () => (rest ? run(rest, true) : []),
    pending: () => rest.length > 0,
  };
}

// One complete chunk → events (pending input is flushed).
export function parse(chunk) {
  const p = createParser();
  return [...p.feed(chunk), ...p.flush()];
}
