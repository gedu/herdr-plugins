// A small cache of what GitHub answered, so pressing the key again a moment later does not start
// from zero. One JSON file in the plugin's state folder, keyed by `owner/repo#number`; each entry is
// { at, issue } for an issue that exists or { at, missing: true } for a 404. It holds the issue text
// (private repos included), so the file is mode 600. A cache that cannot be read or written is
// simply empty: it never makes the card fail.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const FRESH_MS = 5 * 60_000;       // an answer this young is trusted without asking GitHub
export const REVALIDATE_MS = 60_000;      // the card refreshes a copy older than this, after showing it
export const KEEP_MS = 24 * 3600_000;     // older entries are dropped
export const MAX_ENTRIES = 100;

const fileIn = (dir) => join(dir, 'issues.json');

export const keyOf = ({ repo, number }) => `${repo.toLowerCase()}#${number}`;

export function freshness(entry, now, windowMs) {
  if (!entry) return 'none';
  return now - entry.at <= windowMs ? 'fresh' : 'stale';
}

export async function loadCache(dir) {
  if (!dir) return {};
  try {
    const parsed = JSON.parse(await readFile(fileIn(dir), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Merges `updates` into what is on disk (re-read, so a concurrent card's entries survive), drops
// what is too old or beyond MAX_ENTRIES (oldest first), and replaces the file atomically.
export async function saveCache(dir, updates, now) {
  if (!dir || !Object.keys(updates).length) return;
  try {
    const merged = { ...(await loadCache(dir)), ...updates };
    const kept = Object.entries(merged)
      .filter(([, entry]) => entry && now - entry.at <= KEEP_MS)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_ENTRIES);
    await mkdir(dir, { recursive: true });
    const tmp = `${fileIn(dir)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(Object.fromEntries(kept)), { mode: 0o600 });
    await rename(tmp, fileIn(dir));
  } catch {
    // The cache is a convenience.
  }
}
