# timesheet

Objective: a Herdr plugin that drafts the day's Productive time entry from git/PR evidence and publishes it after confirmation.
Branch: `feat/timesheet` · Delivery: single PR (or direct to main per repo habit) · Test runner: `node --test` in `timesheet/`.

## Specs

- S1. "subir 8hs, y un par de bullet points de lo que hice estaria bueno, mostrandome antes en un popup". One 8 h entry per day with 2-4 short bullets, shown in a Herdr popup before anything is sent. Nothing is published without an explicit confirm.
- S2. "get the issues I worked on, and get the Jira ticket and get an small summary, look at the previous days I wrote something, they don't have to be exact". Evidence: the day's commits by the user's git email across repos under `~/Documents/CK` and `~/Documents/mine`, the day's PRs via `gh`, Jira keys found in them; the user's previous entries are style examples.
- S3. Hybrid ("I think hybrid, is the cheapes, I don't wanna spend a lot"): Productive through its REST API with a personal token (read entries, find missing weekdays, create); bullets drafted by `claude -p` with no settings, Haiku, about $0.001 per draft.
- S4. "something like Publishing, ... some Logo from productive, and some animated dots" / "like this: ⢴⣤⠞ Publishing ●●○, is almost perfect". While publishing the popup shows `⢴⣤⠞ Publishing ●●○` with animated dots, then a done or error line.
- S5. "me olvido a veces de las tareas": a reminder toast at the end of a weekday when today has no entry, once per day; and the popup lists recent weekdays with no entry so they can be filled.
- S6. Opened with `prefix+t` (free in Herdr 0.9.5 defaults and the user's config).
- S7. Never post twice: re-check the date right before creating; if an entry exists, do not create.
- Assumption: same service as the most recent entry; 480 minutes; note as the HTML list Productive stores (`<ul><li><p>…`), like the existing entries.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1-S3, S5, S7 | inline | done (API calls pending a token) | ae65844; RED/GREEN day.test.js; live draft 2026-11-12 $0.0009 |
| T2 | S1, S4, S6 | inline | done (live publish pending a token) | ae65844; RED/GREEN ui.test.js; pty smoke: setup screen, q closes |
| T3 | S5 | inline | done (live toast pending a token) | ae65844; RED/GREEN shouldRemind |

T1: pure day/note/prompt logic + Productive client + evidence + draft. T2: popup and action, keys, docs. T3: end-of-day reminder hook.

## Log

- L1 (2026-11-12): "otra cosa tambien, vos podes conectarte a https://app.productive.io/52239-callstack/time/me?date=2026-11-12, porque me olvido a veces de las tareas, y capaz en algun momento del dia, subir 8hs, y un par de bullet points de lo que hice estaria bueno, mostrandome antes en un popup"
- L2: Productive history read (2026-10-29..11-12): one 8 h entry per weekday, service "Senior React Native Engineer", 2-4 bullets, entries 11-04..11-12 created in one batch; 10-31 and 11-11 have no entry.
- L3: `claude -p` via the claude.ai connector costs $0.23-$1.79 per call (connector needs the full user settings); with `--setting-sources ""` Haiku costs $0.001 but loses the connector. User chose the hybrid (S3).
- L4: API contract from the official OpenAPI spec: base `https://api.productive.io/api/v2`, headers `X-Auth-Token`, `X-Organization-Id`, `Content-Type: application/vnd.api+json`; `filter[person_id|after|before]`, `page[size|number]`; `people?filter[email]`; create body `{data:{type:"time_entries",attributes:{date,time:480,note},relationships:{person,service}}}`.
- L5: `claude -p` from Node with stdin left open pulled ~157k extra context tokens ($0.01-0.16/draft); closing stdin brings it to ~$0.0005-0.0009. Fixed in run().
- L6: Next: user adds the Productive token to config.json; then verify personId/entries live (read-only) and the first publish with the user watching.
- L7: Live reads verified with the token: person 1162553, 10 entries, service "Senior React Native Engineer", missing weekdays [2026-11-11] (10-31 is a Saturday, not a gap). API notes are HTML; publishing now posts the same HTML list.
- L8 (2026-11-12): user: "tried it but got that error, today is november 12, not sure what happended, worst case give me the chance to pick up the date, if will take time, instead of being a big center popup, can be maybe at top right and a bit smaller, maybe the half ot it". Cause: today was logged, so the popup offered 11-11 (Polish Independence Day); Productive answered 422 "Time tracking forbidden on holidays" and nothing was sent. Fix: holidays excluded (API /holidays; filter[subsidiary_id] from the spec returns 400, the person has no calendar link, so all visible calendars or config holiday_calendar_id), every working day pickable with ←/→, logged days read-only, popup 50% x 14. Herdr popups cannot be positioned (always centered).
- L9 (2026-11-12): user: "well, if there is something already for today it should tell me and do nothing". The popup now always opens on today; a logged today shows "✓ Today is already logged · nothing to do", with no draft and no publish. Older days stay reachable with ←.
