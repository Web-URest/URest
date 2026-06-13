# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `Web-URest/URest`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,assignees,milestone --jq '[.[] | {number, title, body, labels: [.labels[].name], assignees: [.assignees[].login], milestone: .milestone.title}]'` with appropriate `--label`, `--assignee`, `--milestone`, and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Assign**: `gh issue edit <number> --add-assignee <login>`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Labels in use

- `afk` / `hitl` — the agent-runnable vs needs-a-human split (see `triage-labels.md`).
- `area:*` — the feature lane (one per issue): `area:infra`, `area:design-system`, `area:schema`, `area:auth`, `area:listings`, `area:booking`, `area:ledger-payments`, `area:admin`, `area:concierge`, `area:notifications`, `area:i18n`. Filter your own lane with `gh issue list --assignee @me`.
- Milestones `M1`–`M5` map to the build phases (Foundation → Listings → Booking & escrow → AI concierge → Trust & launch).

## When a skill says "publish to the issue tracker"

Create a GitHub issue. New incoming issues open with `needs-triage`; triage sets milestone + `area:*` + assignee, then swaps `needs-triage` for `afk`/`hitl` (or `needs-info` if unclear).

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
