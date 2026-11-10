// Every call here only reads from GitHub, through the user's own `gh` login.
// Ported from herdr-pr-flow (MIT, see LICENSE.upstream) without the comment and merge writers.
// `exec` is (command, args) => Promise<{code, stdout, stderr}>; args are an argv list, never a shell string.
const PR_FIELDS = [
  'number', 'title', 'body', 'url', 'state', 'isDraft', 'headRefName', 'headRefOid', 'baseRefName',
  'statusCheckRollup', 'reviewDecision', 'latestReviews', 'mergeStateStatus', 'mergeable',
  'additions', 'deletions', 'changedFiles', 'createdAt', 'mergedAt', 'closedAt', 'updatedAt', 'mergeCommit',
].join(',');

const THREADS_QUERY = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){
  reviewThreads(first:100){nodes{isResolved isOutdated path line}}
  commits(last:1){nodes{commit{committedDate}}}
  closingIssuesReferences(first:10){nodes{number title state url}}
}}}`;

export function parsePrUrl(url) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?:[/?#]|$)/.exec(String(url));
  return m ? { owner: m[1], name: m[2], repo: `${m[1]}/${m[2]}`, number: Number(m[3]), url: `https://github.com/${m[1]}/${m[2]}/pull/${m[3]}` } : null;
}

export function parseRemote(remote) {
  const m = /(?:^git@github\.com:|^ssh:\/\/git@github\.com\/|^https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(remote).trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export function createGh(exec) {
  const run = async (args) => {
    const r = await exec('gh', args);
    if (r.code !== 0) throw new Error(String(r.stderr).trim() || `gh ${args[0]} failed`);
    return String(r.stdout);
  };
  const json = async (args) => JSON.parse(await run(args));
  return {
    // Open PRs only: an agent sitting on `main` would otherwise pick up an old merged PR.
    discover: async (repo, branch) => (await json(['pr', 'list', '-R', repo, '--head', branch, '--state', 'open', '--limit', '1', '--json', 'url']))[0]?.url ?? null,
    fetchPr: (url) => json(['pr', 'view', url, '--json', PR_FIELDS]),
    fetchThreads: async (url) => {
      const p = parsePrUrl(url);
      // -f keeps owner and name literal: with -F, gh would read a file for a value starting with "@".
      const data = await json(['api', 'graphql', '-f', `query=${THREADS_QUERY}`, '-f', `owner=${p.owner}`, '-f', `name=${p.name}`, '-F', `number=${p.number}`]);
      const pull = data.data.repository.pullRequest;
      return { threads: pull.reviewThreads.nodes, issues: pull.closingIssuesReferences?.nodes ?? [], headCommittedAt: pull.commits.nodes[0]?.commit.committedDate ?? null };
    },
    fetchRuns: async (repo, sha) => (await json(['api', `repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=50`])).workflow_runs.map((r) => ({
      id: r.id, name: r.name ?? r.display_title ?? 'workflow', status: r.status, conclusion: r.conclusion, url: r.html_url, updatedAt: r.updated_at,
    })),
    fetchJobs: async (repo, runId) => (await json(['api', `repos/${repo}/actions/runs/${Number(runId)}/jobs?per_page=50`])).jobs.map((j) => ({
      id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, steps: (j.steps ?? []).map((x) => ({ number: x.number, name: x.name, status: x.status, conclusion: x.conclusion })),
    })),
    authOk: async () => (await exec('gh', ['auth', 'status', '--active'])).code === 0,
  };
}
