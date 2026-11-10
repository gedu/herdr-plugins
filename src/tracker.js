// Finds PRs from live agents, remembers which agent session owns each one, and keeps them fresh.
// Adapted from herdr-pr-flow's tracker (MIT, see LICENSE.upstream). It only reads, everything it
// touches is passed in, and it has no timers of its own, so it runs against fakes in tests.
//
// A PR leaves the list when:
// - it is closed, or merged more than 24 hours ago with its workflows finished (as upstream);
// - its owner agent switched to another branch or repo, and no other agent is on its branch;
// - its branch no longer exists locally in the owner's folder (dismissed for good);
// - the user dismisses it (for good).
import { parsePrUrl } from './gh.js';
import { prState } from './status.js';
import { sanitize } from './text.js';
import { flowActive } from './flow.js';

const DISCOVER_WORKING_MS = 30_000;
const DISCOVER_IDLE_MS = 120_000;
const REMOTE_TTL_MS = 60_000;
const SETTLED_FACTOR = 4;
const MERGED_KEEP_MS = 24 * 3_600_000;
const CONCURRENCY = 4;
const FLOW_POLL_MS = 15_000;
const DISMISSED_MAX = 500;

const clean = (pr) => ({ ...pr, title: sanitize(pr.title), body: sanitize(pr.body) });
const ownerOf = (a) => ({ pane: a.pane, terminal: a.terminal, workspace: a.workspace, session: a.session, app: a.app, cwd: a.cwd });

export function createTracker({ gh, remoteOf, branchOf, branchExists, store, settings, now = Date.now }) {
  const saved = store.load() ?? {};
  const tracked = saved.tracked ?? {};
  const dismissed = new Set(saved.dismissed ?? []);
  const live = new Map(); // url -> { pr, threads, issues, fetchedAt, error }
  const flows = new Map(); // url -> { runs, jobs, checkedAt }
  const discovered = new Map(); // repo:branch -> at
  const previous = new Map(); // pane -> status
  const remotes = new Map(); // cwd -> { at, repo }
  let agents = [];
  let lastError = '';

  const save = () => store.save({ tracked, dismissed: [...dismissed].slice(-DISMISSED_MAX) });

  async function repoOf(cwd) {
    const hit = remotes.get(cwd);
    if (hit && now() - hit.at < REMOTE_TTL_MS) return hit.repo;
    const repo = await remoteOf(cwd).catch(() => null);
    remotes.set(cwd, { at: now(), repo });
    return repo;
  }

  function forget(url, { forever = false } = {}) {
    delete tracked[url];
    live.delete(url);
    flows.delete(url);
    if (forever) dismissed.add(url);
  }

  const onBranch = (entry) => agents.filter((a) => a.repo === entry.repo && a.branch === entry.branch);
  const pick = (list) => list.find((a) => a.status === 'working') ?? list[0] ?? null;

  // A working agent may open a PR at any moment; an idle one rarely does.
  async function discover(agent) {
    const { repo, branch } = agent;
    if (Object.values(tracked).some((t) => t.repo === repo && t.branch === branch)) return;
    const key = `${repo}:${branch}`;
    const wait = agent.status === 'working' ? DISCOVER_WORKING_MS : DISCOVER_IDLE_MS;
    if (now() - (discovered.get(key) ?? -Infinity) < wait) return;
    discovered.set(key, now());
    const found = await gh.discover(repo, branch).catch((error) => { lastError = error.message; return null; });
    const parsed = parsePrUrl(found);
    if (!parsed || dismissed.has(parsed.url)) return;
    const owner = pick(agents.filter((a) => a.repo === repo && a.branch === branch)) ?? agent;
    tracked[parsed.url] = { url: parsed.url, repo: parsed.repo, number: parsed.number, branch, headSha: '', headSeenAt: now(), owner: ownerOf(owner) };
    save();
    await refresh(parsed.url);
  }

  async function refresh(url) {
    const entry = tracked[url];
    if (!entry) return;
    try {
      const [pr, extra] = await Promise.all([gh.fetchPr(url), gh.fetchThreads(url)]);
      if (pr.headRefOid !== entry.headSha) {
        entry.headSha = pr.headRefOid;
        // A PR first seen long after its last commit should not wait for CI to appear.
        const committed = extra.headCommittedAt ? Date.parse(extra.headCommittedAt) : now();
        entry.headSeenAt = Math.min(committed, now());
      }
      const issues = (extra.issues ?? []).map((i) => ({ ...i, title: sanitize(i.title) }));
      live.set(url, { pr: clean(pr), threads: extra.threads, issues, fetchedAt: now() });
      lastError = '';
      if (pr.state === 'MERGED') await refreshFlow(url);
    } catch (error) {
      lastError = error.message;
      live.set(url, { ...live.get(url), error: error.message, fetchedAt: now() });
    }
    save();
  }

  // After a merge only Actions changes. Jobs are fetched for unfinished runs, and once more when a run finishes.
  async function refreshFlow(url) {
    const entry = tracked[url];
    const sha = live.get(url)?.pr?.mergeCommit?.oid;
    if (!entry || !sha) return;
    const old = flows.get(url) ?? { runs: [], jobs: {} };
    const runs = await gh.fetchRuns(entry.repo, sha).catch(() => old.runs);
    const jobs = { ...old.jobs };
    const due = runs.filter((r) => r.status !== 'completed' || (old.runs.some((o) => o.id === r.id && o.status !== 'completed') && !jobs[r.id]?.final));
    await Promise.all(due.map(async (r) => {
      const list = await gh.fetchJobs(entry.repo, r.id).catch(() => null);
      if (list) jobs[r.id] = { jobs: list, final: r.status === 'completed' };
    }));
    flows.set(url, { runs, jobs, checkedAt: now() });
  }

  const flowBusy = (url) => {
    const pr = live.get(url)?.pr;
    return pr?.state === 'MERGED' && Boolean(pr.mergeCommit?.oid) && flowActive(flows.get(url)?.runs, pr.mergedAt, now());
  };

  // Ownership and the user's removal rules, from what the agents are doing right now.
  async function reconcile() {
    for (const entry of Object.values(tracked)) {
      const owner = agents.find((a) => a.pane === entry.owner?.pane);
      const moved = owner && owner.branch && owner.repo && (owner.branch !== entry.branch || owner.repo !== entry.repo);
      if (!owner || moved) {
        const heir = pick(onBranch(entry));
        if (heir) entry.owner = ownerOf(heir);
        else if (moved) { forget(entry.url); continue; }
      }
      const cwd = entry.owner?.cwd;
      if (cwd && entry.branch && (await branchExists(cwd, entry.branch).catch(() => null)) === false) forget(entry.url, { forever: true });
    }
  }

  function prune() {
    for (const entry of Object.values(tracked)) {
      const pr = live.get(entry.url)?.pr;
      if (!pr) continue;
      const mergedAt = pr.mergedAt ? Date.parse(pr.mergedAt) : 0;
      if (pr.state === 'CLOSED' || (pr.state === 'MERGED' && now() - mergedAt > MERGED_KEEP_MS && !flowBusy(entry.url))) forget(entry.url);
    }
  }

  async function inBatches(items, fn) {
    for (let i = 0; i < items.length; i += CONCURRENCY) await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }

  // One round. `list` is what Herdr says about its agents right now:
  // [{ pane, terminal, workspace, session, app, status, cwd, focused }].
  async function tick(list, { force = false } = {}) {
    if (force) discovered.clear();
    agents = await Promise.all(list.filter((a) => a.cwd).map(async (a) => {
      const [repo, branch] = await Promise.all([repoOf(a.cwd), branchOf(a.cwd).catch(() => null)]);
      return { ...a, repo, branch };
    }));
    // An agent that just finished has probably pushed or opened a PR, so look now.
    const finished = agents.filter((a) => previous.get(a.pane) === 'working' && a.status !== 'working');
    for (const a of finished) if (a.repo && a.branch) discovered.delete(`${a.repo}:${a.branch}`);
    for (const a of agents) previous.set(a.pane, a.status);
    await reconcile();
    const seen = new Set();
    const unique = agents.filter((a) => {
      const key = `${a.repo}:${a.branch}`;
      if (!a.repo || !a.branch || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await inBatches(unique, discover);
    const fresh = new Set(finished.flatMap((a) => Object.values(tracked).filter((t) => t.repo === a.repo && t.branch === a.branch).map((t) => t.url)));
    const due = Object.values(tracked).filter((entry) => {
      const data = live.get(entry.url);
      if (!data) return true;
      if (['MERGED', 'CLOSED'].includes(data.pr?.state)) return false;
      if (force || fresh.has(entry.url)) return true;
      const owned = agents.some((a) => a.pane === entry.owner?.pane);
      return now() - data.fetchedAt >= settings.pollMs * (owned ? 1 : SETTLED_FACTOR);
    });
    await inBatches(due, (e) => refresh(e.url));
    const flowing = Object.values(tracked).filter((e) => !due.includes(e) && flowBusy(e.url) && now() - (flows.get(e.url)?.checkedAt ?? -Infinity) >= FLOW_POLL_MS);
    await inBatches(flowing, (e) => refreshFlow(e.url));
    prune();
    save();
  }

  // Open PRs by latest activity, then merged ones whose workflows have settled.
  function cards() {
    const out = [];
    for (const entry of Object.values(tracked)) {
      const data = live.get(entry.url);
      const agent = agents.find((a) => a.pane === entry.owner?.pane) ?? null;
      const base = { key: entry.url, url: entry.url, repo: entry.repo, number: entry.number, branch: entry.branch, owner: entry.owner ?? null, agent };
      if (!data?.pr) { out.push({ ...base, loading: true, error: data?.error }); continue; }
      const status = prState(data.pr, { now: now(), headSeenAt: entry.headSeenAt, threads: data.threads }, settings);
      const flow = data.pr.state === 'MERGED' && data.pr.mergeCommit?.oid ? { ...(flows.get(entry.url) ?? { runs: [], jobs: {} }), active: flowBusy(entry.url) } : null;
      out.push({ ...base, pr: data.pr, threads: data.threads, issues: data.issues ?? [], status, flow });
    }
    const rank = (c) => (c.pr?.state === 'MERGED' && !c.flow?.active ? 1 : 0);
    const time = (c) => Date.parse(c.pr?.updatedAt ?? 0) || 0;
    return out.sort((a, b) => rank(a) - rank(b) || time(b) - time(a));
  }

  return {
    tick,
    cards,
    dismiss: (url) => { forget(url, { forever: true }); save(); },
    lastError: () => lastError,
  };
}
