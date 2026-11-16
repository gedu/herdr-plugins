import { expect, test } from 'claude-code/testing'

import { applyCreate, applyUpdate, filled, fromTodoWrite } from './register'

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
