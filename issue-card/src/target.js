// What the user pointed at: a clicked GitHub URL, or selected text such as "1232", "#1232",
// "issue 1232" or "owner/repo#1232". A bare number belongs to the focused folder's repo.

// An owner or repo name: no "." or ".." (they would walk the API path) and no leading dash.
const segment = (s) => /^[A-Za-z0-9_.-]+$/.test(s) && !s.startsWith('-') && s !== '.' && s !== '..';
const target = (owner, name, number) => (segment(owner) && segment(name) && number > 0 ? { repo: `${owner}/${name}`, number } : null);

export function parseRemote(remote) {
  const m = /(?:^git@github\.com:|^ssh:\/\/git@github\.com\/|^https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(String(remote ?? '').trim());
  return m && segment(m[1]) && segment(m[2]) ? `${m[1]}/${m[2]}` : null;
}

const MAX_REFS = 9;
// A GitHub URL, owner/repo#n, or a bare #n that is not glued to a word, part of a longer
// token, or a hex color such as #000000 (at most five digits, nothing word-like after them).
const REF = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(?:issues|pull)\/(\d+)|(?<![\w/.-])([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)(?!\w)|(?<![\w&/#])#(\d{1,5})(?!\w)/g;

// Every issue reference in a screen of text, most recent (lowest on screen) first, once each.
export function refsIn(text, repo) {
  const [owner, name] = String(repo ?? '').split('/');
  const found = [];
  for (const m of String(text ?? '').matchAll(REF)) {
    const ref = m[3] ? target(m[1], m[2], Number(m[3]))
      : m[6] ? target(m[4], m[5], Number(m[6]))
        : repo ? target(owner, name, Number(m[7])) : null;
    if (ref) found.push(ref);
  }
  const seen = new Set();
  const out = [];
  for (const ref of found.reverse()) {
    const key = `${ref.repo}#${ref.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length === MAX_REFS) break;
  }
  return out;
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
