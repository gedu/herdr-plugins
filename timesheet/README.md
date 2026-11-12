# timesheet

Drafts the day's [Productive](https://productive.io) time entry from your commits and PRs,
shows it in a Herdr popup, and publishes it only when you press enter.

```text
 ⢴⣤⠞ Productive · time entry

 ‹ Wed 11-11 ›   1 day without an entry
 8 h · Senior React Native Engineer

 - SF Figma run
 - Figma factory improvements

 ↵ publish · e edit · ←→ day · r redraft · q close
```

## How it works

| Step | Source | Cost |
| --- | --- | --- |
| Days without an entry | Productive API, last 14 days, weekdays minus public holidays | free |
| What you did | your commits (`git log --author=<email>`) in repos under `roots`, PRs from `gh search prs --author=@me` | free |
| The bullets | `claude -p` with Haiku, no settings, no tools; your last 10 notes as style examples | about $0.001 per draft |
| Publishing | Productive API: 8 h on the service of your most recent entry | free |

It opens on today. When today already has an entry it says so and does nothing (no draft,
nothing to publish); earlier days are still reachable with `←`. On a weekend or holiday it opens
on the newest day without an entry. Holidays
are left out because Productive refuses time on them (`422: Time tracking forbidden on holidays`).

Before sending, it checks the day again and refuses if an entry already exists, so a day you
logged in the web app is never logged twice.

A reminder toast appears on weekdays after `remind_hour` (default 17) when today has no entry,
at most once a day. It runs on tab switches and makes one Productive request, no model call.

## Keys

| Key | Does |
| --- | --- |
| `enter` | Publish the shown day |
| `e` | Edit the bullets in `$VISUAL` / `$EDITOR` (one `- bullet` per line) |
| `←` `→` | Pick another working day of the last 14 (logged days show their note, read-only) |
| `r` | Draft again |
| `q`, `esc` | Close |

## Setup

1. In Productive: Settings → API integrations → create a personal token.
2. Link the plugin, then save the token (it is checked against Productive before anything is written):

   ```sh
   herdr plugin link ./timesheet
   cd timesheet && npm run setup -- --org <id>   # <id>: the number in app.productive.io/<id>-...
   ```

   It asks for the token without echoing it (or reads it from stdin: `pbpaste | npm run setup -- --org <id>`),
   and writes `config.json` in the plugin config dir with mode 600, keeping any other settings.
   `--org` is only needed the first time. Run it again whenever the token changes.

   Optional settings in that `config.json` (`herdr plugin config-dir gedu.timesheet`):

   ```json
   {
     "roots": ["~/Documents/work", "~/Documents/side"],
     "remind_hour": 17,
     "email": "<when your Productive email differs from git config user.email>",
     "holiday_calendar_id": "<optional: pin one holiday calendar>"
   }
   ```

   `roots` are scanned 4 levels deep for git repos (default `~/Documents`). The API does not say
   which holiday calendar is yours, so all calendars the token sees are used unless
   `holiday_calendar_id` pins one.

3. Bind a key (see [`config/keys.toml`](../config/keys.toml)).

Needs Node >= 20, git, the [Claude Code](https://claude.com/claude-code) CLI logged in, and
optionally `gh` for PR titles.

## Tests

```sh
npm test
```
