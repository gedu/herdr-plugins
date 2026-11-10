// Everything the panel asks of the machine: Herdr's CLI, git in agent folders, and the system
// opener for GitHub links. `exec` is injected so tests never touch the real machine.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { parseRemote } from './gh.js';
import { safeGithubUrl } from './url.js';

const TIMEOUT_MS = 15_000;
const MAX_BUFFER = 8 * 1024 * 1024;

// Runs a program with an argv list (never through a shell) and never throws.
export function execProgram(cmd, args, { cwd } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: 'utf8' }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? (error?.message ?? '')) });
    });
  });
}

function parseHerdr(r, what) {
  // Results come on stdout; error envelopes may come on stderr.
  let body = null;
  for (const text of [r.stdout, r.stderr]) {
    try { body = JSON.parse(text); break; } catch { /* not JSON */ }
  }
  if (r.code !== 0 || body?.error) throw new Error(body?.error?.message ?? (String(r.stderr).trim() || `herdr ${what} failed`));
  return body?.result ?? {};
}

const firstArray = (obj) => (Array.isArray(obj) ? obj : Object.values(obj ?? {}).find(Array.isArray) ?? []);

export function createHost({ exec = execProgram, bin = process.env.HERDR_BIN_PATH || 'herdr', exists = existsSync, platform = process.platform } = {}) {
  const herdr = (...args) => exec(bin, args);
  const git = (cwd, ...args) => exec('git', ['-C', cwd, '--no-optional-locks', ...args]);

  return {
    // [{ pane, terminal, workspace, session, title, app, status, cwd, focused }]
    async agents() {
      const list = firstArray(parseHerdr(await herdr('agent', 'list'), 'agent list'));
      const spaces = await herdr('workspace', 'list').then((r) => firstArray(parseHerdr(r, 'workspace list'))).catch(() => []);
      const label = new Map(spaces.map((w) => [w.workspace_id, w.label]));
      return list.map((a) => {
        const title = a.terminal_title_stripped || a.title || a.name || '';
        return {
          pane: a.pane_id, terminal: a.terminal_id, workspace: a.workspace_id,
          session: label.get(a.workspace_id) || title || a.workspace_id || '',
          title, app: a.display_agent || a.agent || 'agent', status: a.agent_status ?? 'unknown', cwd: a.cwd ?? null, focused: Boolean(a.focused),
        };
      });
    },

    // The pane id first; the terminal id if this Herdr wants that instead.
    async focus(agent) {
      for (const target of [agent?.pane, agent?.terminal].filter(Boolean)) {
        if ((await herdr('agent', 'focus', target)).code === 0) return true;
      }
      return false;
    },

    async branchOf(cwd) {
      const r = await git(cwd, 'branch', '--show-current');
      const name = r.stdout.trim();
      return r.code === 0 && name ? name : null; // empty: detached HEAD, mid-rebase
    },

    // true / false, or null when git can't tell. A folder that's gone (a removed worktree) has no branch.
    async branchExists(cwd, branch) {
      if (!exists(cwd)) return false;
      const r = await git(cwd, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
      if (r.code === 0) return true;
      return r.code === 1 ? false : null;
    },

    async remoteOf(cwd) {
      const r = await git(cwd, 'remote', 'get-url', 'origin');
      return r.code === 0 ? parseRemote(r.stdout) : null;
    },

    async open(url) {
      const safe = safeGithubUrl(url);
      if (!safe) return false;
      const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer.exe' : 'xdg-open';
      return (await exec(cmd, [safe])).code === 0;
    },
  };
}
