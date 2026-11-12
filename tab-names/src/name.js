// Pure naming rules: what a tab should be called, and which tabs this plugin may rename.
import { basename } from 'node:path';

const MAX = 32;

// Long repo names (three words or more) become their initials: food-revolution-network -> frn.
export function shortRepo(name) {
  const words = name.split(/[-_.]+/).filter(Boolean);
  return words.length >= 3 ? words.map((w) => w[0]).join('').toLowerCase() : name;
}

const truncate = (s) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s);

// git: { repoRoot: main checkout folder, top: this checkout's folder, branch: '' when detached }.
// A linked worktree is named after its folder (issue-436); the main checkout after its branch.
export function labelFor({ repoRoot, top, branch }) {
  const repo = shortRepo(basename(repoRoot));
  const where = top !== repoRoot ? basename(top) : branch;
  return truncate(where ? `${repo} · ${where}` : repo);
}

// Herdr names new tabs with digits; anything else came from a person (or another tool).
export const isDefaultLabel = (label) => /^\d+$/.test(label);

function agentPaneOf(tabId, panes) {
  const agents = panes.filter((p) => p.tab_id === tabId && p.agent);
  return agents.find((p) => p.focused) ?? agents[0] ?? null;
}

// labels: foreground_cwd -> label (missing when the folder is not in git).
// owned: tab_id -> the label this plugin last wrote. A tab is ours while its label still matches.
export function plan({ tabs, panes, labels, owned }) {
  const renames = [];
  const next = {};
  for (const tab of tabs) {
    const ours = owned[tab.tab_id] === tab.label;
    if (!ours && !isDefaultLabel(tab.label)) continue;
    const pane = agentPaneOf(tab.tab_id, panes);
    const label = pane && labels[pane.foreground_cwd || pane.cwd];
    if (!label) {
      if (ours) next[tab.tab_id] = tab.label;
      continue;
    }
    if (label !== tab.label) renames.push({ tab_id: tab.tab_id, label });
    next[tab.tab_id] = label;
  }
  return { renames, owned: next };
}
