# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual
label strings used in `Web-URest/URest`.

| Canonical role (mattpocock/skills) | Label in our tracker | Meaning |
| --- | --- | --- |
| `ready-for-agent` | **`afk`** | Fully specified, no human keys/decisions — a background Claude agent can pick it up |
| `ready-for-human` | **`hitl`** | Needs a human: a secret/key, a KYC or legal decision, schema sign-off, or design judgement |
| `needs-triage` | `needs-triage` | New incoming issue — lane / owner / afk-vs-hitl not yet decided |
| `needs-info` | `needs-info` | Blocked: waiting on clarification before it can proceed |
| `wontfix` | `wontfix` | Will not be actioned |

`afk` and `hitl` predate this setup and are already wired into the team's agent-dispatch workflow
(see `docs/CONTRIBUTING.md`), so they are the source of truth for the agent/human split — do **not**
create `ready-for-agent` / `ready-for-human` labels. `needs-triage` / `needs-info` are for *future
incoming* issues; the existing backlog is already classified into `afk`/`hitl` + an `area:*` lane.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label
string from this table.
