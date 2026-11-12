# Agent notes

- Setting up a machine: follow "Set up a new Mac" in [README.md](README.md). Append keys from
  `config/keys.toml`; never overwrite the person's Herdr config.
- One plugin per folder, each with its own `herdr-plugin.toml`, `package.json` and README.
- Node >= 20, ES modules, no dependencies. Tests: `npm test` inside the plugin folder
  (`node --test tests/*.test.js`).
- Herdr plugin docs: https://raw.githubusercontent.com/herdrdev/herdr/v0.9.5/docs/next/website/src/content/docs/plugins.mdx
- Herdr caches a linked plugin's manifest: after editing `herdr-plugin.toml`, run `herdr plugin link ./<folder>` again
  (code changes in `src/` apply on the next run without it).
