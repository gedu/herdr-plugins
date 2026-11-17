# wrap

Continue a Claude Code session after `/clear` without writing, copying or pasting a summary.

## Use

1. `/wrap` (optionally with notes: `/wrap the deploy is blocked on the API key`).
   Claude saves a session summary to Engram when it is available, and writes a brief for the
   next session: goal, what is done, next step, a TODOs table, decisions, key files.
2. `/clear`, or exit and start `claude` again in the same folder.
3. The new session starts with the brief loaded ("Wrap loaded: …"). Tell it to go on.

Each handoff loads once, in the folder it was written in, within 24 hours. `/resume` and
`/compact` keep their own context and never load one.

## Install

```sh
claude plugin marketplace add gedu/herdr-plugins   # once; or the path of a clone
claude plugin install wrap@herdr-plugins --scope user
```

Restart Claude Code afterwards.

## Details

| | |
| --- | --- |
| Where briefs live | `~/.claude/wraps/*.md`, each starting with a `cwd:` header. Loaded ones move to `used/`. |
| When one loads | A `SessionStart` hook on `clear` and `startup` picks the newest brief whose `cwd` is this folder. |
| Settings | `CLAUDE_WRAP_DIR` (other folder), `CLAUDE_WRAP_MAX_AGE_HOURS` (default 24). |
| Tests | `npm test` |
