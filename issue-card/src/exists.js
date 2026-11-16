// Which references exist. A 404 from GitHub drops the reference (an issue number an agent made
// up); any other failure (offline, no login, rate limit) keeps it, so the card shows the real
// error instead of the plugin pretending the issue is not there.
// Answers younger than FRESH_MS come from the cache; the rest are asked in parallel, and what GitHub
// said comes back as cache entries so the card does not have to ask again.
import { FRESH_MS, freshness, keyOf } from './cache.js';

const isNotFound = ({ stderr = '', stdout = '' }) => /HTTP 404|Not Found/i.test(`${stderr}\n${stdout}`);

function entryOf(result, now) {
  if (result.code === 0) {
    try { return { at: now, issue: JSON.parse(result.stdout) }; } catch { return null; }
  }
  return isNotFound(result) ? { at: now, missing: true } : null;
}

export async function lookup(refs, run, cache = {}, now = Date.now()) {
  const known = refs.map((r) => {
    const entry = cache[keyOf(r)];
    return freshness(entry, now, FRESH_MS) === 'fresh' ? entry : null;
  });
  const fetched = await Promise.all(refs.map((r, i) => (known[i] ? null : run('gh', ['api', `repos/${r.repo}/issues/${r.number}`]))));
  const entries = {};
  const kept = refs.filter((r, i) => {
    const entry = known[i] ?? (fetched[i] ? entryOf(fetched[i], now) : null);
    if (entry && !known[i]) entries[keyOf(r)] = entry;
    return !entry?.missing;
  });
  return { refs: kept, entries };
}
