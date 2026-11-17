import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Status, Task } from '../types'

const PANE = 'agent-todos'
const TITLE = 'todos'

// Session state: each agent session keeps its own list, never another's.
const tasks = atom({ plugin: 'agent-todos', key: 'tasks' } as const, [], { shape: 'tasks-1' })

export const COLORS = {
  bg: '#0b0e17',
  text: '#d5d9e4',
  muted: '#8a93a8',
  doneText: '#7d869b',
  strong: '#f2f4f9',
  accent: '#7aa7ff',
  accentDim: '#5979b9', // #7aa7ff at 70% over the background
  track: '#2a3144',
} as const

// The detail line only when it says something the subject does not.
function detailOf(subject: string, activeForm?: string): string | undefined {
  const detail = activeForm?.trim()
  return detail && detail !== subject.trim() ? detail : undefined
}

export function fromTodoWrite(todos: Array<{ content: string; status: Status; activeForm: string }>): Task[] {
  return todos.map((one, i) => ({
    id: `todo-${i}`,
    subject: one.content,
    detail: detailOf(one.content, one.activeForm),
    status: one.status,
  }))
}

export function applyCreate(list: Task[], id: string, subject: string, activeForm?: string): Task[] {
  return [...list.filter((one) => one.id !== id), { id, subject, detail: detailOf(subject, activeForm), status: 'pending' }]
}

export function applyUpdate(
  list: Task[],
  change: { taskId: string; subject?: string; activeForm?: string; status?: Status | 'deleted' },
): Task[] {
  if (change.status === 'deleted') return list.filter((one) => one.id !== change.taskId)
  return list.map((one) => {
    if (one.id !== change.taskId) return one
    const subject = change.subject ?? one.subject
    return {
      ...one,
      subject,
      detail: change.activeForm !== undefined ? detailOf(subject, change.activeForm) : one.detail,
      status: change.status && change.status !== 'deleted' ? change.status : one.status,
    }
  })
}

// Sample list for `/agent-todos demo`: one of each state.
const DEMO: Task[] = [
  { id: 'demo-1', subject: 'Probar el panel de todos en herdr', detail: 'abriendo el panel lateral', status: 'in_progress' },
  { id: 'demo-2', subject: 'Instalar agent-todos para todas las sesiones nuevas', status: 'pending' },
  { id: 'demo-3', subject: 'Desactivar odd-todos', status: 'completed' },
]

// Handoff: the unfinished list is kept per folder in $.store, so the next session there
// (after /clear or an exit) can be told about it and continue.
const HANDOFF_DAYS = 14
const BLOCK = 'agent-todos'

export type Snapshot = { at: string; sessionId: string; tasks: Task[] }

const keyFor = (cwd: string) => `list:${cwd}`
const hasOpen = (list: Task[]) => list.some((one) => one.status !== 'completed')
const LABEL: Record<Status, string> = { in_progress: 'in progress', pending: 'pending', completed: 'done' }

export function handoffText(snapshot: Snapshot): string {
  const lines = snapshot.tasks.map((one) => `- [${LABEL[one.status]}] ${one.subject}${one.detail ? ` (${one.detail})` : ''}`)
  return [
    `An earlier session in this folder (${snapshot.at.slice(0, 10)}) left this todo list unfinished:`,
    ...lines,
    'If the person asks to continue that work, recreate the open items with your task tools (TaskCreate or TodoWrite) and carry on.',
    'If the request is unrelated, ignore this list and do not recreate it.',
  ].join('\n')
}

// The snapshot a new session should be told about, or undefined: none saved, saved by this very
// session (its own list), or older than HANDOFF_DAYS.
export function handoffFor(saved: unknown, sessionId: string, now: number): Snapshot | undefined {
  const snapshot = saved as Snapshot | undefined
  if (!snapshot || !Array.isArray(snapshot.tasks) || snapshot.sessionId === sessionId) return undefined
  if (!hasOpen(snapshot.tasks)) return undefined
  const age = now - Date.parse(snapshot.at)
  return Number.isFinite(age) && age <= HANDOFF_DAYS * 24 * 3600 * 1000 ? snapshot : undefined
}

async function saveHandoff($: EngineInterface, list: Task[]) {
  try {
    const key = keyFor(await $.session.cwd())
    if (!hasOpen(list)) return await $.store.delete(key)
    const snapshot: Snapshot = { at: new Date(await $.clock.now()).toISOString(), sessionId: await $.session.id(), tasks: list }
    await $.store.set(key, snapshot)
  } catch {
    // The handoff is a convenience; the pane keeps working without it.
  }
}

// Cells of the done part of a bar `width` wide.
export function filled(done: number, total: number, width: number): number {
  return total === 0 ? 0 : Math.round((done / total) * width)
}

async function openPane($: EngineInterface): Promise<string> {
  const opened = await $.ui.open({ id: PANE, title: TITLE })
  return opened.isPlaced ? 'Todos pane opened.' : `Todos pane is waiting: ${opened.reason}`
}

// Opens the pane the first time this session gets a list; closing it sticks
// until /todos opens it again.
async function setTasks($: EngineInterface, fn: (list: Task[]) => Task[]) {
  try {
    const before = await read($, tasks)
    const after = await update($, tasks, fn)
    await saveHandoff($, after)
    if (before.length === 0 && after.length > 0) await openPane($)
  } catch {
    // A failed write only leaves the pane stale; the tool call itself stands.
  }
}

const succeeded = (ran: { deny?: string; isError?: boolean }) => ran.deny === undefined && ran.isError !== true

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agent-todos', description: "Show this session's agent todos in a pane. Args: demo | clear", argumentHint: '[demo|clear]' })
    return next(e)
  })

  on('command.run', { command: 'agent-todos' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'demo') {
      await update($, tasks, () => DEMO)
      return { text: `Demo todos loaded. ${await openPane($)}` }
    }
    if (arg === 'clear') {
      await update($, tasks, () => [])
      await saveHandoff($, [])
      return { text: 'Todos cleared.' }
    }
    return { text: await openPane($) }
  })

  // A new conversation (a fresh session, or after /clear) is told about the list the last one left.
  on('prompt.context', async ($, e, next) => {
    try {
      const saved = await $.store.get(keyFor(await $.session.cwd()))
      const snapshot = handoffFor(saved, await $.session.id(), await $.clock.now())
      if (snapshot) return next({ ...e, blocks: [...e.blocks, { name: BLOCK, text: handoffText(snapshot) }] })
    } catch {
      // Without the handoff the session simply starts empty.
    }
    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (succeeded(ran)) await setTasks($, () => fromTodoWrite(e.todos))
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const id = (ran.result as { task?: { id?: string } } | undefined)?.task?.id
    if (succeeded(ran) && id) await setTasks($, (list) => applyCreate(list, id, e.subject, e.activeForm))
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (succeeded(ran) && (ran.result as { success?: boolean } | undefined)?.success !== false) await setTasks($, (list) => applyUpdate(list, e))
    return ran
  }).catch(($, e, next) => next(e))

  // Fixed band above the prompt: click "TODOs" to open or close the pane.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, tasks)
    if (e.props.hasSurvey || list.length === 0) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const done = list.filter((one) => one.status === 'completed').length
    const current = list.find((one) => one.status === 'in_progress') ?? list.find((one) => one.status === 'pending')
    const cells = filled(done, list.length, 8)
    const toggle = async () => {
      const isUp = (await $.ui.panes()).some((pane) => pane.id === PANE)
      if (isUp) await $.ui.close({ id: PANE })
      else await openPane($)
    }

    return (
      <Box flexDirection="row">
        <Button key="toggle" label="TODOs" onPress={() => void toggle()} />
        <Text> </Text>
        <Text color={COLORS.accent}>{'━'.repeat(cells)}</Text>
        <Text color={COLORS.track}>{'━'.repeat(8 - cells)}</Text>
        <Text color={COLORS.muted}> {done}/{list.length}</Text>
        <Text color={COLORS.text} wrap="truncate-end">{current ? ` · ${current.subject}` : ' · all done'}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, tasks)
    const width = Math.max(10, (e.props.bodyColumns ?? 40) - 2)
    const rows = e.props.scroll?.bodyRows ?? 0
    const now = list.filter((one) => one.status === 'in_progress')
    const pending = list.filter((one) => one.status === 'pending')
    const done = list.filter((one) => one.status === 'completed')
    const cells = filled(done.length, list.length, width)

    // Glyph in a 2-column box, text beside it: wrapped lines hang under the text.
    const row = (glyph: string, glyphColor: string, text: string, textColor: string, bold = false) => (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text color={glyphColor}>{glyph}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1}>
          <Text color={textColor} bold={bold} wrap="wrap">{text}</Text>
        </Box>
      </Box>
    )
    const section = (label: string, body: RenderChildren[]) => (
      <Box flexDirection="column" marginTop={1}>
        <Text color={COLORS.muted}>{label}</Text>
        {body}
      </Box>
    )

    return (
      <Box flexDirection="column" backgroundColor={COLORS.bg} paddingX={1} minHeight={rows}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text color={COLORS.strong} bold>{TITLE}</Text>
          <Text color={COLORS.muted}>{list.length ? `${done.length}/${list.length}` : ''}</Text>
        </Box>
        <Box flexDirection="row">
          <Text color={COLORS.accent}>{'━'.repeat(cells)}</Text>
          <Text color={COLORS.track}>{'━'.repeat(width - cells)}</Text>
        </Box>
        {list.length === 0 && (
          <Box marginTop={1}>
            <Text color={COLORS.muted} wrap="wrap">No todos in this session yet.</Text>
          </Box>
        )}
        {now.length > 0 &&
          section(
            'ahora',
            now.map((one) => (
              <Box flexDirection="column">
                {row('●', COLORS.accent, one.subject, COLORS.strong, true)}
                {one.detail && (
                  <Box paddingLeft={2}>{row('⎿', COLORS.muted, one.detail, COLORS.muted)}</Box>
                )}
              </Box>
            )),
          )}
        {pending.length > 0 && section('pendiente', pending.map((one) => row('○', COLORS.muted, one.subject, COLORS.text)))}
        {done.length > 0 && section('hecho', done.map((one) => row('✓', COLORS.accentDim, one.subject, COLORS.doneText)))}
      </Box>
    )
  })
}
