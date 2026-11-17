---
description: Load the brief /wrap saved for this folder, when it did not load by itself after /clear
---

The person ran `/wrap` earlier and wants to continue from that brief now. Load it by hand:

1. In `$HOME/.claude/wraps/`, find the `.md` files whose header line `cwd: <path>` is exactly this
   session's current working directory (ignore a trailing slash). Take the newest one by
   modification time. Do not look in `used/`.
2. If there is none, say so in one line and list the `cwd:` of the briefs that do exist, so the
   person can `cd` there. Stop.
3. Read it, then move it to `$HOME/.claude/wraps/used/` (create the folder if needed) so it is not
   loaded twice.
4. Treat everything below its header as your starting brief from the previous session: check it
   against the repository, then reply with one line naming the next step from the brief and wait
   for the person to say go.
