// SessionStart hook: after /clear, or a fresh start in the same folder, load the handoff that
// /wrap saved there. Each handoff loads once: it moves to used/ so the next start is clean.
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pickHandoff, contextFor, MAX_AGE_MS } from './pick.js';

const LOAD_ON = new Set(['clear', 'startup']);

function main() {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return; }
  if (!LOAD_ON.has(input.source) || !input.cwd) return;

  const dir = process.env.CLAUDE_WRAP_DIR || join(homedir(), '.claude', 'wraps');
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith('.md')); } catch { return; }
  const files = names.flatMap((name) => {
    try {
      const path = join(dir, name);
      return [{ name, mtimeMs: statSync(path).mtimeMs, text: readFileSync(path, 'utf8') }];
    } catch { return []; }
  });

  const hours = Number(process.env.CLAUDE_WRAP_MAX_AGE_HOURS);
  const maxAgeMs = hours > 0 ? hours * 3_600_000 : MAX_AGE_MS;
  const picked = pickHandoff(files, { cwd: input.cwd, now: Date.now(), maxAgeMs });
  if (!picked) return;

  mkdirSync(join(dir, 'used'), { recursive: true });
  renameSync(join(dir, picked.name), join(dir, 'used', picked.name));
  process.stdout.write(JSON.stringify({
    systemMessage: `Wrap loaded: ${picked.name}`,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: contextFor(picked) },
  }));
}

// A hook must never block the session: any failure means "no handoff".
try { main(); } catch { /* start without a handoff */ }
