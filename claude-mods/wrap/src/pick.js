// Pure: which saved handoff a new session in `cwd` should load, and how it is framed.
export const MAX_AGE_MS = 24 * 3_600_000;

const trim = (path) => path.replace(/\/+$/, '');

// A handoff file starts with a `cwd:` header between --- lines; the rest is the prompt.
export function parseHandoff(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const cwd = match && /^cwd:\s*(.+)$/m.exec(match[1])?.[1].trim();
  return cwd ? { cwd, body: match[2].trim() } : null;
}

// files: [{ name, mtimeMs, text }] → the newest one written for this folder, or null.
export function pickHandoff(files, { cwd, now, maxAgeMs = MAX_AGE_MS }) {
  const here = trim(cwd);
  const fits = files
    .map((f) => ({ ...f, parsed: parseHandoff(f.text) }))
    .filter((f) => f.parsed && trim(f.parsed.cwd) === here && now - f.mtimeMs <= maxAgeMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return fits[0] ? { name: fits[0].name, body: fits[0].parsed.body } : null;
}

export function contextFor({ name, body }) {
  return [
    `Handoff from the previous session in this folder (${name}). The person cleared or restarted`,
    'the session on purpose to continue from here: treat it as your starting brief, check it against',
    'the repository before acting, and wait for their next message.',
    '',
    body,
  ].join('\n');
}
