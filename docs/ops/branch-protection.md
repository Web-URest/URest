# Enforcing the PR gate on `main`

**Problem this solves:** CI already runs on every PR and `main` push (`.github/workflows/ci.yml`,
the `checks` job), and `CODEOWNERS` auto-requests reviewers — but on a **free-tier private org repo
GitHub allows neither *required* status checks nor *required* reviews**. Both the classic
branch-protection API and the rulesets API return:

```
403: Upgrade to GitHub Pro or make this repository public to enable this feature.
```

So a PR can be merged without CI passing or a review. Enforcement needs the repo to be either
**public** or on a paid/Education **GitHub Team** plan. This doc is the one-step path to turn it on,
plus the interim we run until then.

## The plan (decided 2026-06-13)

1. **Build phase → public.** Make the repo public to unlock rulesets/branch protection **for free**,
   and apply the ruleset below. The repo carries a **proprietary, all-rights-reserved `LICENSE`**, so
   public visibility grants no usage rights (it's viewable, not open source). Git history was checked
   clean of secrets before going public (`.env` gitignored, no keys ever committed).
2. **Launch → private + GitHub Team.** When the product is ready, flip the repo private and subscribe
   to **GitHub Team** (~฿420/mo for 3 seats, within the ฿1,000 ceiling) to keep the same enforcement;
   re-apply the ruleset then.
   - *Free alternative:* a KMUTT instructor applies as a **GitHub Educator** (Settings → Billing →
     Education benefits → Teacher, verified with a KMUTT email) and upgrades the `Web-URest` org to
     **GitHub Team for free** for academic use. Keeps it private at no cost; needs a faculty sponsor +
     a few days' verification. (The Student Developer Pack only gives *personal* Pro — it does not
     cover an org repo.)
3. **If the pilot is shelved**, the repo can be relicensed open (MIT/Apache) and kept public as a
   portfolio piece. Loosening a license later is always possible; un-granting an open one is not.

## Apply the ruleset (once the repo is public, or once on GitHub Team)

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

## Interim (until the ruleset is applied)
- **CODEOWNERS auto-request is live now** (the file is on `main`): every new PR pings its lane
  reviewer automatically. Note: a PR authored by the sole owner of a path (Aok on `prisma/`,
  `env.ts`, etc.) gets no auto-reviewer — manually request bard or poom.
- **Convention (`docs/CONTRIBUTING.md`):** only Aok merges, and only after **CI is green** and there
  is **≥1 review** — including a bard/poom review on Aok's own PRs. This is the same gate as the
  ruleset, enforced by discipline until the ruleset makes it mechanical.
