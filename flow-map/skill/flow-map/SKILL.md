---
name: flow-map
description: "Trigger: the person names a flow map id (\"you work on purchases\", \"flow purchases\"), asks to map, track or visualize a long feature, screen flow or architecture, or a `flow` id shows up in the task. Keep the shared flow map current with the `flow` command while you work."
---

# Flow map

A live map of a long feature (boxes by state) that the person watches in a Herdr popup
(`prefix+m`). Several agents update the same map by its id. Never edit the JSON by hand.

## Start (one call)

```sh
flow show <id>      # unknown id? `flow list`. No map yet and asked for one? `flow new "<feature>" [--layout tree|screens|layers]`
```

## While you work

| When | Run |
| --- | --- |
| You start on a node | `flow here <id> <node>` then `flow node <id> <node> --state in_progress` |
| A new piece appears | `flow node <id> <node> --title "Short title" --detail "one line" --parent <parent> [--label "POST /x"]` |
| It has a ticket/PR | `--ref 277` or `--ref 277:merged`, `--ref PROJ-12`, `--ref <url>` (any tracker) |
| It is done | `flow node <id> <node> --state done` |
| It is blocked | `flow node <id> <node> --blocked "why, in a few words"` |
| Something worth knowing | `flow note <id> "plain sentence"` (about one node: add `--node <node>`) |
| The focus changes | `flow now <id> "what happens now · next: …"` |

Rules: node ids are short kebab-case (`ios`, `store-port`); titles under ~25 chars, details one
line. Update when a node changes state, not on every step. `flow help` has every option.
