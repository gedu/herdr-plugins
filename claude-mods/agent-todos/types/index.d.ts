export type Status = 'pending' | 'in_progress' | 'completed'
export type Task = { id: string; subject: string; detail?: string; status: Status }

declare module 'claude-code' {
  interface PluginState {
    'agent-todos': { tasks: Shaped<Task[]> }
  }
}
