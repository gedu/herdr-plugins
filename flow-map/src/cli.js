#!/usr/bin/env node
// `flow`: how agents report progress on a shared flow map. Never edit the JSON by hand.
import { execFile } from 'node:child_process';
import { parseArgs } from 'node:util';
import { create, flowsDir, LAYOUTS, list, load, STATES, update } from './store.js';

const HELP = `flow: a live map of a long feature, shared by every agent working on it.

  flow new "<feature>" [--layout tree|screens|layers] [--id <id>]   prints the new id
  flow node <id> <node> [--title t] [--detail d] [--state s] [--parent p [--label l]]
            [--ref 277|#277|PROJ-12|<url>[:state]]... [--blocked "<reason>"] [--layer L] [--remove]
  flow edge <id> <from> <to> [--label l] [--dashed]
  flow note <id> "<text>"          keeps the last 5 notes
  flow now  <id> "<text>"          what is happening right now
  flow here <id> <node> [--name n] this agent (its Herdr tab) works on <node>
  flow show <id>                   short text summary
  flow list                        every flow

States: ${STATES.join(' | ')}. A node is created on first use; ref state (open|merged|closed|draft|done) defaults to open.
Flows live in ${flowsDir()}.`;

const GLYPH = { done: '✓', in_progress: '●', pending: '○', blocked: '■' };

class UsageError extends Error {}

function parse(argv, options, count) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error.message);
  }
  const { positionals, values } = parsed;
  if (positionals.length !== count) throw new UsageError(`expected ${count} argument(s), got ${positionals.length}`);
  return { pos: positionals, opt: values };
}

// "277" or "#277" → {n:277}; anything else → {ref}. A trailing ":<state>" sets the state.
const REF_STATES = ['open', 'merged', 'closed', 'draft', 'done'];
export function parseRef(text) {
  let body = text;
  let state = 'open';
  const m = /^(.+):([a-z_]+)$/i.exec(text);
  if (m && REF_STATES.includes(m[2].toLowerCase())) {
    body = m[1];
    state = m[2].toLowerCase();
  }
  const num = /^#?(\d+)$/.exec(body);
  return num ? { n: Number(num[1]), state } : { ref: body, state };
}
const refKey = (r) => (r.n != null ? `#${r.n}` : r.ref);

function herdrTabs() {
  const bin = process.env.HERDR_BIN_PATH || 'herdr';
  return new Promise((resolve) => {
    execFile(bin, ['tab', 'list'], { timeout: 2000 }, (error, stdout) => {
      if (error) return resolve([]);
      try {
        resolve(JSON.parse(stdout).result?.tabs ?? []);
      } catch {
        resolve([]);
      }
    });
  });
}

// The calling agent's tab number, or the raw HERDR_TAB_ID, or null outside Herdr.
async function myTab() {
  const raw = process.env.HERDR_TAB_ID;
  if (!raw) return null;
  const tab = (await herdrTabs()).find((t) => t.tab_id === raw);
  return tab?.number ?? raw;
}

function nodeOf(flow, id) {
  const node = flow.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node "${id}" in ${flow.id}`);
  return node;
}

function upsertEdge(flow, from, to, { label, style }) {
  let edge = flow.edges.find((e) => e.from === from && e.to === to);
  if (!edge) flow.edges.push((edge = { from, to }));
  if (label != null) edge.label = label;
  if (style != null) edge.style = style;
}

function show(flow) {
  const nodes = flow.nodes ?? [];
  const done = nodes.filter((n) => n.state === 'done').length;
  const out = [`${flow.id} · ${flow.feature} · ${done}/${nodes.length} done · ${flow.layout}`];
  const w = Math.max(0, ...nodes.map((n) => n.id.length));
  const tw = Math.max(0, ...nodes.map((n) => (n.title ?? '').length));
  for (const n of nodes) {
    const refs = (n.issues ?? []).map((r) => `${refKey(r)}${r.state && r.state !== 'open' ? ` ${r.state}` : ''}`).join(', ');
    const tail = [refs, n.state === 'blocked' && n.blocked_by ? `blocked: ${n.blocked_by}` : ''].filter(Boolean).join(' · ');
    out.push(`${GLYPH[n.state] ?? '?'} ${n.id.padEnd(w)}  ${tail ? (n.title ?? '').padEnd(tw) + '  ' + tail : n.title ?? ''}`.trimEnd());
  }
  for (const a of flow.agents ?? []) out.push(`agent: ${a.tab == null ? '?' : `tab ${a.tab}`} → ${a.node}${a.name ? ` (${a.name})` : ''}`);
  if (flow.now) out.push(`now: ${flow.now}`);
  for (const note of flow.notes ?? []) out.push(`- ${note}`);
  return out.join('\n');
}

const commands = {
  async new(argv) {
    const { pos, opt } = parse(argv, { layout: { type: 'string' }, id: { type: 'string' } }, 1);
    if (opt.layout && !LAYOUTS.includes(opt.layout)) throw new UsageError(`bad layout "${opt.layout}": use ${LAYOUTS.join('|')}`);
    const flow = await create(pos[0], { layout: opt.layout ?? 'tree', id: opt.id, who: await who() });
    return flow.id;
  },

  async node(argv) {
    const { pos, opt } = parse(argv, {
      title: { type: 'string' }, detail: { type: 'string' }, state: { type: 'string' },
      parent: { type: 'string' }, label: { type: 'string' }, ref: { type: 'string', multiple: true },
      blocked: { type: 'string' }, layer: { type: 'string' }, remove: { type: 'boolean' },
    }, 2);
    const [id, nodeId] = pos;
    if (opt.state && !STATES.includes(opt.state)) throw new UsageError(`bad state "${opt.state}": use ${STATES.join('|')}`);
    let said;
    await update(id, (flow) => {
      if (opt.remove) {
        nodeOf(flow, nodeId);
        flow.nodes = flow.nodes.filter((n) => n.id !== nodeId);
        flow.edges = flow.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
        flow.agents = (flow.agents ?? []).filter((a) => a.node !== nodeId);
        return (said = `removed ${nodeId}`);
      }
      let node = flow.nodes.find((n) => n.id === nodeId);
      const isNew = !node;
      if (isNew) flow.nodes.push((node = { id: nodeId, title: nodeId, detail: '', state: 'pending', issues: [] }));
      if (opt.title != null) node.title = opt.title;
      if (opt.detail != null) node.detail = opt.detail;
      if (opt.layer != null) node.layer = opt.layer;
      if (opt.blocked != null) {
        node.state = 'blocked';
        node.blocked_by = opt.blocked;
        if (opt.detail == null) node.detail = opt.blocked;
      } else if (opt.state) {
        node.state = opt.state;
      }
      if (node.state !== 'blocked') delete node.blocked_by;
      node.issues ??= [];
      for (const text of opt.ref ?? []) {
        const ref = parseRef(text);
        const i = node.issues.findIndex((r) => refKey(r) === refKey(ref));
        if (i >= 0) node.issues[i] = ref;
        else node.issues.push(ref);
      }
      if (opt.parent) upsertEdge(flow, opt.parent, nodeId, { label: opt.label });
      return (said = `${isNew ? 'added' : 'updated'} ${nodeId} (${node.state})`);
    }, { who: await who() });
    return `${id}: ${said}`;
  },

  async edge(argv) {
    const { pos, opt } = parse(argv, { label: { type: 'string' }, dashed: { type: 'boolean' } }, 3);
    const [id, from, to] = pos;
    await update(id, (flow) => {
      upsertEdge(flow, from, to, { label: opt.label, style: opt.dashed ? 'dashed' : undefined });
      return `edge ${from} → ${to}`;
    }, { who: await who() });
    return `${id}: edge ${from} → ${to}`;
  },

  async note(argv) {
    const { pos } = parse(argv, {}, 2);
    await update(pos[0], (flow) => {
      flow.notes = [...(flow.notes ?? []), pos[1]].slice(-5);
      return `note: ${pos[1]}`;
    }, { who: await who() });
    return `${pos[0]}: note added`;
  },

  async now(argv) {
    const { pos } = parse(argv, {}, 2);
    await update(pos[0], (flow) => {
      flow.now = pos[1];
      return `now: ${pos[1]}`;
    }, { who: await who() });
    return `${pos[0]}: now set`;
  },

  async here(argv) {
    const { pos, opt } = parse(argv, { name: { type: 'string' } }, 2);
    const [id, nodeId] = pos;
    const tab = await myTab();
    await update(id, (flow) => {
      nodeOf(flow, nodeId);
      flow.agents ??= [];
      const prev = flow.agents.find((a) => (tab == null ? a.tab == null && a.name === opt.name : a.tab === tab));
      const agent = { tab, node: nodeId, name: opt.name ?? prev?.name };
      if (agent.name == null) delete agent.name;
      flow.agents = flow.agents.filter((a) => a !== prev);
      flow.agents.push(agent);
      return `here: ${nodeId}`;
    }, { who: tab == null ? 'cli' : `tab ${tab}` });
    return `${id}: ${tab == null ? 'this agent' : `tab ${tab}`} → ${nodeId}`;
  },

  async show(argv) {
    const { pos } = parse(argv, {}, 1);
    return show(await load(pos[0]));
  },

  async list(argv) {
    parse(argv, {}, 0);
    const rows = await list();
    if (!rows.length) return 'no flows yet (flow new "<feature>")';
    const w = Math.max(...rows.map((r) => r.id.length));
    return rows.map((r) => `${r.id.padEnd(w)}  ${`${r.done}/${r.total}`.padEnd(5)}  ${r.feature}${r.blocked ? '  ■ blocked' : ''}`).join('\n');
  },

  help: async () => HELP,
};

let whoCache;
// History author: "tab N" inside Herdr, else "cli".
async function who() {
  whoCache ??= myTab().then((tab) => (tab == null ? 'cli' : `tab ${tab}`));
  return whoCache;
}

const [arg = 'help', ...rest] = process.argv.slice(2);
const cmd = arg === '--help' || arg === '-h' ? 'help' : arg;
const run = Object.hasOwn(commands, cmd) ? commands[cmd] : null;
if (!run) {
  console.error(`flow: unknown command "${cmd}" (see: flow help)`);
  process.exit(1);
}
try {
  console.log(await run(rest));
} catch (error) {
  console.error(`flow ${cmd}: ${error.message}${error instanceof UsageError ? ' (see: flow help)' : ''}`);
  process.exit(1);
}
