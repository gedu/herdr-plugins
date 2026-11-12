// What the user pointed at: a clicked GitHub URL, or selected text such as "1232", "#1232",
// "issue 1232" or "owner/repo#1232". A bare number belongs to the focused folder's repo.

// An owner or repo name: no "." or ".." (they would walk the API path) and no leading dash.
const segment = (s) => /^[A-Za-z0-9_.-]+$/.test(s) && !s.startsWith('-') && s !== '.' && s !== '..';
const target = (owner, name, number) => (segment(owner) && segment(name) && number > 0 ? { repo: `${owner}/${name}`, number } : null);

export function parseRemote(remote) {
  const m = /(?:^git@github\.com:|^ssh:\/\/git@github\.com\/|^https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(remote ?? '').trim());
  return m && segment(m[1]) && segment(m[2]) ? `${m[1]}/${m[2]}` : null;
}

export function targetOf({ url, selected, repo } = {}) {
  const link = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)(?:[/?#]|$)/.exec(String(url ?? ''));
  if (link) return target(link[1], link[2], Number(link[3]));

  const text = String(selected ?? '').trim();
  const qualified = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/.exec(text);
  if (qualified) return target(qualified[1], qualified[2], Number(qualified[3]));

  const bare = /^(?:(?:issue|pr|pull request)\s*)?#?(\d+)$/i.exec(text);
  if (!bare || !repo) return null;
  const [owner, name] = repo.split('/');
  return target(owner, name, Number(bare[1]));
}
