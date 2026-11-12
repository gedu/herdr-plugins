# timesheet

Drafts the day's [Productive](https://productive.io) time entry from your commits and PRs,
shows it in a Herdr popup, and publishes it only when you press enter.

```text
 ⢴⣤⠞ Productive · time entry

 ‹ Thu 11-12 · today ›   2 days without an entry
 8 h · Senior React Native Engineer

 - SF Figma run
 - Figma factory improvements

 ↵ publish · e edit · ←→ day · r redraft · q close
```

## How it works

| Step | Source | Cost |
| --- | --- | --- |
| Days without an entry | Productive API, last 14 days (weekdays only) | free |
| What you did | your commits (`git log --author=<email>`) in repos under `roots`, PRs from `gh search prs --author=@me` | free |
| The bullets | `claude -p` with Haiku, no settings, no tools; your last 10 notes as style examples | about $0.001 per draft |
| Publishing | Productive API: 8 h on the service of your most recent entry | free |

Before sending, it checks the day again and refuses if an entry already exists, so a day you
logged in the web app is never logged twice.

A reminder toast appears on weekdays after `remind_hour` (default 17) when today has no entry,
at most once a day. It runs on tab switches and makes one Productive request, no model call.

## Keys

| Key | Does |
| --- | --- |
| `enter` | Publish the shown day |
| `e` | Edit the bullets in `$VISUAL` / `$EDITOR` (one `- bullet` per line) |
| `←` `→` | Move between days without an entry |
| `r` | Draft again |
| `q`, `esc` | Close |

## Setup

1. In Productive: Settings → API integrations → create a personal token.
2. Create `config.json` in the plugin config dir (`herdr plugin config-dir gedu.timesheet`):

   ```json
   {
     "token": "<your Productive API token>",
     "organization_id": "<the number in app.productive.io/<id>-...>",
     "roots": ["~/Documents/work", "~/Documents/side"],
     "remind_hour": 17
   }
   ```

   `email` defaults to `git config --global user.email`; set it when your Productive email differs.
   `roots` are scanned 4 levels deep for git repos.

3. Link the plugin and bind a key (see [`config/keys.toml`](../config/keys.toml)):

   ```sh
   herdr plugin link ./timesheet
   ```

Needs Node >= 20, git, the [Claude Code](https://claude.com/claude-code) CLI logged in, and
optionally `gh` for PR titles.

## Tests

```sh
npm test
```
