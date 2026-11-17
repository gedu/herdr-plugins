---
description: Save where this session is, so the next one (after /clear or a restart here) continues from it
argument-hint: "[anything the next session must know]"
---

The person is about to clear or restart this session and wants the next one to continue the
work without them retyping anything. Do these steps, then stop.

1. **Memory.** If Engram memory tools are available, save a session summary for this project
   (Goal, Discoveries, Accomplished, Next Steps, Relevant Files). Skip this step if they are not.

2. **Brief file.** Write one Markdown file to `$HOME/.claude/wraps/` (absolute path; create
   the folder if needed), named `<YYYYMMDD-HHMMSS>-<short-topic-slug>.md`. It must start with this
   header, using the absolute current working directory of this session:

   ```
   ---
   cwd: <absolute cwd>
   ---
   ```

   Then the brief, written to the next session as its prompt, in the language the person has been
   writing in:
   - **Goal**: what we are building or fixing, and why.
   - **Done**: what was finished, with branches, commits and PRs.
   - **Pending / next**: the next concrete step first.
   - **TODOs**: a table (task, status, notes) when there is more than one open item.
   - **Decisions and constraints** the person stated, quoted when short.
   - **Key files** and how to check the work (test commands).
   - Notes from the person: $ARGUMENTS

   Facts only, no greeting. Leave out secrets and tokens.

3. **Reply** with one short line naming the file and saying: run `/clear` (or exit and start
   Claude again in this folder) and the next session loads it once by itself.
