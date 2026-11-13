// One JSON file per flow, shared by every worktree: $HERDR_FLOWS_DIR or ~/.local/state/herdr-flows.
// Every write is locked, validated and atomic (write a tmp file, then rename).
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { withLock } from './lock.js';
import { idFor, validId } from './ids.js';

export const STATES = ['done', 'in_progress', 'pending', 'blocked'];
export const LAYOUTS = ['tree', 'screens', 'layers'];
const HISTORY = 50;

export const NODE_NOTES = 5;

// A note on one node: newest first, the last NODE_NOTES kept. The popup and `flow note --node`
// both write through this, so the two never disagree on order or length.
export function addNodeNote(flow, nodeId, text) {
  const node = flow.nodes?.find((n) => n.id === nodeId);
  if (!node) throw new Error(`no node "${nodeId}" in flow "${flow.id}"`);
  node.notes = [text, ...(Array.isArray(node.notes) ? node.notes : [])].slice(0, NODE_NOTES);
  return node;
}

export const flowsDir = () => process.env.HERDR_FLOWS_DIR || join(homedir(), '.local', 'state', 'herdr-flows');
const fileOf = (id) => join(flowsDir(), `${id}.json`);

function checkId(id) {
  if (!validId(id)) throw new Error(`bad flow id "${id}": use lowercase letters, digits, - or _`);
}

export async function load(id) {
  checkId(id);
  try {
    return JSON.parse(await readFile(fileOf(id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`no flow "${id}" (see: flow list)`);
    throw error;
  }
}

export function validate(flow) {
  if (!LAYOUTS.includes(flow.layout)) throw new Error(`bad layout "${flow.layout}": use ${LAYOUTS.join('|')}`);
  const ids = new Set();
  for (const node of flow.nodes ?? []) {
    if (!node.id) throw new Error('a node has no id');
    if (ids.has(node.id)) throw new Error(`duplicate node "${node.id}"`);
    ids.add(node.id);
    if (!STATES.includes(node.state)) throw new Error(`bad state "${node.state}" on "${node.id}": use ${STATES.join('|')}`);
  }
  for (const edge of flow.edges ?? []) {
    for (const end of [edge.from, edge.to]) if (!ids.has(end)) throw new Error(`edge ${edge.from} → ${edge.to}: no node "${end}"`);
  }
  for (const agent of flow.agents ?? []) {
    if (agent.node != null && !ids.has(agent.node)) throw new Error(`agent on missing node "${agent.node}"`);
  }
  return flow;
}

function stamp(flow, who, what) {
  const at = new Date().toISOString();
  flow.updated = at;
  flow.history = [...(flow.history ?? []), { at, who: who ?? 'cli', what: what ?? 'update' }].slice(-HISTORY);
}

async function writeAtomic(id, flow) {
  const tmp = `${fileOf(id)}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(flow, null, 2)}\n`);
  await rename(tmp, fileOf(id));
}

async function locked(lockName, fn) {
  await mkdir(flowsDir(), { recursive: true });
  const result = await withLock(join(flowsDir(), lockName), fn);
  if (!result.ran) throw new Error('flow is busy, try again');
  return result.value;
}

// Creates a flow with an easy id (or the given one) and returns it.
export function create(feature, { layout = 'tree', id, who, what } = {}) {
  return locked('.new.lock', async () => {
    const taken = await ids();
    if (id) {
      checkId(id);
      if (taken.includes(id)) throw new Error(`id "${id}" is taken`);
    }
    const flow = {
      id: id ?? idFor(feature, taken),
      feature,
      layout,
      now: '',
      agents: [],
      nodes: [],
      edges: [],
      notes: [],
    };
    validate(flow);
    stamp(flow, who, what ?? `new: ${feature}`);
    await writeAtomic(flow.id, flow);
    return flow;
  });
}

// Lock, read, let fn change the flow, validate, write. fn may return a history text.
export function update(id, fn, { who, what } = {}) {
  checkId(id);
  return locked(`${id}.json.lock`, async () => {
    const flow = await load(id);
    const said = await fn(flow);
    validate(flow);
    stamp(flow, who, what ?? (typeof said === 'string' ? said : 'update'));
    await writeAtomic(id, flow);
    return flow;
  });
}

async function ids() {
  const names = await readdir(flowsDir()).catch(() => []);
  return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).sort();
}

// Summaries for the switcher and `flow list`.
export async function list() {
  const rows = [];
  for (const id of await ids()) {
    let flow;
    try {
      flow = await load(id);
    } catch {
      continue;
    }
    const nodes = flow.nodes ?? [];
    rows.push({
      id,
      feature: flow.feature ?? id,
      done: nodes.filter((n) => n.state === 'done').length,
      total: nodes.length,
      blocked: nodes.some((n) => n.state === 'blocked'),
      updated: flow.updated ?? null,
      agents: flow.agents ?? [],
    });
  }
  return rows;
}
