import { expect, mock, test } from 'claude-code/testing'

import { applyCreate, applyUpdate, filled, fromTodoWrite, handoffText } from './register'

const PANE = {
  plugin: 'agent-todos',
  component: 'Pane',
  requestId: 'agent-todos',
  props: { title: 'todos', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('TodoWrite fills the pane in sections, done count in the header', async ($, on) => {
  on('command.register', () => ({ value: { command: 'agent-todos' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Probar prefix+t', status: 'in_progress', activeForm: 'abriendo el panel lateral' },
      { content: 'Borrar ramas viejas', status: 'pending', activeForm: 'Borrando ramas' },
      { content: 'Leer setup.js', status: 'completed', activeForm: 'Leyendo setup.js' },
    ],
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^1\/3$/ }))?.text).toBe('1/3')
  expect((await ui.find({ type: 'Text', text: /^ahora$/ }))?.text).toBe('ahora')
  expect((await ui.find({ type: 'Text', text: /abriendo/ }))?.text).toBe('abriendo el panel lateral')
  expect((await ui.find({ type: 'Text', text: /^pendiente$/ }))?.text).toBe('pendiente')
  expect((await ui.find({ type: 'Text', text: /^hecho$/ }))?.text).toBe('hecho')
  expect(await ui.find({ type: 'Text', text: /strike/ })).toBeUndefined()
  await ui.unmount()
})

test('an empty list shows a hint and no sections', async ($) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /No todos/ }))?.text).toBe('No todos in this session yet.')
  expect(await ui.find({ type: 'Text', text: /^ahora$/ })).toBeUndefined()
  await ui.unmount()
})

test('task tools: create, update, delete', () => {
  let list = applyCreate([], '1', 'Write test', 'Writing test')
  list = applyCreate(list, '2', 'Ship')
  list = applyUpdate(list, { taskId: '1', status: 'in_progress' })
  expect(list[0]).toEqual({ id: '1', subject: 'Write test', detail: 'Writing test', status: 'in_progress' })
  list = applyUpdate(list, { taskId: '2', status: 'deleted' })
  expect(list.length).toBe(1)
})

test('detail is dropped when it repeats the subject; bar fills by ratio', () => {
  expect(fromTodoWrite([{ content: 'X', status: 'pending', activeForm: 'X' }])[0]?.detail).toBeUndefined()
  expect(filled(3, 8, 40)).toBe(15)
  expect(filled(0, 0, 40)).toBe(0)
})

test('the band above the prompt shows progress and the current task', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('tool.call', () => ({ result: {} }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Probar prefix+t', status: 'in_progress', activeForm: 'Probando' },
      { content: 'Leer setup.js', status: 'completed', activeForm: 'Leyendo' },
    ],
  })
  const ui = await $.ui.mount({ plugin: 'agent-todos', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80 }, surface: 'terminal' } as never)
  expect((await ui.find({ type: 'Text', text: /1\/2/ }))?.text).toBe(' 1/2')
  expect((await ui.find({ type: 'Text', text: /Probar/ }))?.text).toBe(' · Probar prefix+t')
  await ui.unmount()
})

const OPEN = [
  { content: 'Write the migration', status: 'in_progress', activeForm: 'Writing the migration' },
  { content: 'Run the suite', status: 'pending', activeForm: 'Running the suite' },
  { content: 'Read the spec', status: 'completed', activeForm: 'Reading the spec' },
] as const

const NOW = Date.parse('2026-11-16T12:00:00.000Z')

// A session in /work, with an in-memory store and a clock; `writes` records what the mod stored.
async function startSession($: any, on: any, entries: Record<string, unknown> = {}) {
  const writes: Record<string, unknown> = { ...entries }
  mock.clock(on, { now: NOW })
  on('store.get', (_: unknown, e: { key: string }) => ({ value: writes[e.key] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => { writes[e.key] = e.value; return { value: undefined } })
  on('store.delete', (_: unknown, e: { key: string }) => { delete writes[e.key]; return { value: undefined } })
  on('command.register', () => ({ value: { command: 'agent-todos' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.context', (_: unknown, e: { blocks: unknown[] }) => ({ blocks: e.blocks }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.id', () => ({ value: 'this-session' }))
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  return writes
}

test('an unfinished list is saved for this folder, and removed once every task is done', async ($, on) => {
  const store = await startSession($, on)
  const key = 'list:/work'

  await $.tool.call({ tool: 'TodoWrite', todos: [...OPEN] })
  const saved = store[key] as { tasks: Array<{ subject: string }>; sessionId: string }
  expect(saved.tasks.map((one) => one.subject)).toEqual(['Write the migration', 'Run the suite', 'Read the spec'])
  expect(saved.sessionId).toBe('this-session')

  await $.tool.call({ tool: 'TodoWrite', todos: OPEN.map((one) => ({ ...one, status: 'completed' as const })) })
  expect(store[key]).toBeUndefined()
})

test('/agent-todos clear also forgets the saved list', async ($, on) => {
  const store = await startSession($, on)
  await $.tool.call({ tool: 'TodoWrite', todos: [...OPEN] })
  expect(store['list:/work']).toBeDefined()
  await $.command.run({ command: 'agent-todos', args: 'clear' })
  expect(store['list:/work']).toBeUndefined()
})

test('a new session in the folder is told about the unfinished list', async ($, on) => {
  await startSession($, on, { 'list:/work': { at: new Date(NOW - 3600_000).toISOString(), sessionId: 'an-earlier-session', tasks: fromTodoWrite([...OPEN]) } })

  const out = await $.prompt.context({ blocks: [] })
  const block = out.blocks.find((one) => one.name === 'agent-todos')
  expect(block?.text).toContain('Write the migration')
  expect(block?.text).toContain('Run the suite')
})

test('the session that wrote the list is not handed its own list, and an old list is dropped', async ($, on) => {
  const store = await startSession($, on)
  await $.tool.call({ tool: 'TodoWrite', todos: [...OPEN] })
  expect((await $.prompt.context({ blocks: [] })).blocks.find((one) => one.name === 'agent-todos')).toBeUndefined()

  store['list:/work'] = { at: new Date(NOW - 15 * 24 * 3600 * 1000).toISOString(), sessionId: 'an-earlier-session', tasks: fromTodoWrite([...OPEN]) }
  expect((await $.prompt.context({ blocks: [] })).blocks.find((one) => one.name === 'agent-todos')).toBeUndefined()
})

test('the handoff text names each task with its state and says what to do', () => {
  const text = handoffText({ at: '2026-11-15T10:00:00.000Z', sessionId: 'x', tasks: fromTodoWrite([...OPEN]) })
  expect(text).toContain('[in progress] Write the migration')
  expect(text).toContain('[pending] Run the suite')
  expect(text).toContain('[done] Read the spec')
  expect(text).toContain('2026-11-15')
  expect(text).toMatch(/TaskCreate|TodoWrite/)
})
