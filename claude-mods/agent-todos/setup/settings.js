// The one setting agent-todos needs: Claude Code ships its task tools off, and without them
// agents have no todos to show.
export const TODO_ENV = 'CLAUDE_CODE_ENABLE_TODO_TOOLS';

// Returns a copy of `settings` with the switch on; everything else is kept as it was.
export function withTodoTools(settings) {
  const base = settings && typeof settings === 'object' ? settings : {};
  if (base.env?.[TODO_ENV] === '1') return { settings: base, changed: false };
  return { settings: { ...base, env: { ...(base.env ?? {}), [TODO_ENV]: '1' } }, changed: true };
}
