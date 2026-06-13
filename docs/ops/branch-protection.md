# Enforcing the PR gate on `main`

**Problem this solves:** CI already runs on every PR and `main` push (`.github/workflows/ci.yml`,
the `checks` job), and `CODEOWNERS` auto-requests reviewers — but on a **free-tier private org repo
GitHub allows neither *required* status checks nor *required* reviews**. Both the classic
branch-protection API and the rulesets API return:

```
403: Upgrade to GitHub Pro or make this repository public to enable this feature.
```

So a PR can currently be merged without CI passing or a review. Hard enforcement needs the
`Web-URest` org on **GitHub Team** (or the repo made public). This doc is the one-step path to turn
it on the moment Team is active, plus the free interim we run until then.

## Getting GitHub Team for free (chosen path: GitHub Education)

Free GitHub Team for an **organization** is *not* available to students self-serve — the Student
Developer Pack only grants **personal** Pro. The free org route is faculty-sponsored:

1. A **KMUTT instructor/advisor** signs in to GitHub → **Settings → Billing & plans → Education
   benefits → Teacher**, and verifies with their KMUTT email + proof of faculty status.
2. Once verified, they request / apply **GitHub Team for free** for the `Web-URest` organization
   (academic use), or upgrade the org to Team via the education benefit.
3. (Optional, do regardless) each student claims the **Student Developer Pack** at
   <https://education.github.com/pack> for personal Pro + Copilot — useful, but it does **not**
   enforce the org repo by itself.

Verification can take a few days. Until it lands, use the interim below.

## Apply the ruleset (run once Team is active)

The ruleset is versioned at [`main-ruleset.json`](./main-ruleset.json). Apply it with:

```bash
gh api --method POST repos/Web-URest/URest/rulesets \
  --input docs/ops/main-ruleset.json
# verify:
gh api repos/Web-URest/URest/rulesets --jq '.[] | "\(.id)\t\(.name)\t\(.enforcement)"'
```

### What it enforces on `main`
- **CI must pass** — the `checks` status check is required (`strict` = the branch must also be up to
  date with `main` before merge).
- **Every change goes through a PR with ≥1 approving review** — no direct pushes to `main`.
- **Stale approvals are dismissed** when new commits are pushed.
- **No force-pushes, no deleting `main`.**

### Deliberate choice: review count, *not* `require_code_owner_review`
`CODEOWNERS` makes `@AokDesu` the owner of nearly everything and he's also the author of his own
infra/escrow PRs + the sole merger. If code-owner review were *required*, his own PRs could never be
satisfied (GitHub won't let an author approve their own PR, and he's the only owner on paths like
`prisma/`). So the rule requires **1 approval from anyone with write access** instead — which means:
- bard/poom PRs: approved by Aok (or each other).
- **Aok's own PRs: approved by bard or poom** (healthy peer review on the money-moving code).

`CODEOWNERS` still *auto-requests* the right reviewer on every PR — the ruleset just doesn't make the
code-owner specifically mandatory. If you ever want a break-glass, add a `bypass_actors` entry for the
org-admin role to `main-ruleset.json` (not included by default, on purpose).

## Free interim (already in effect — no Team needed)
- **CODEOWNERS auto-request is live now** (the file is on `main`): every new PR pings its lane
  reviewer automatically, so reviews/comments can happen. Note: a PR authored by the sole owner of a
  path (Aok on `prisma/`, `env.ts`, etc.) gets no auto-reviewer — manually request bard or poom.
- **Convention (`docs/CONTRIBUTING.md`):** only Aok merges, and only after **CI is green** and there
  is **≥1 review** — including a bard/poom review on Aok's own PRs. This is the same gate as the
  ruleset, enforced by one person's discipline until Team makes it mechanical.
