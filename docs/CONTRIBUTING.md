# Contributing to U-Rest

How the 3-person team works in parallel without colliding. This is the human companion to
`CLAUDE.md` (which holds the hard rules and is what AI agents read). **Trust is the product** —
the conventions here exist because this codebase moves other people's money.

## Team & lanes

Ownership is **feature-vertical**: each person owns whole features end-to-end (UI + API + `lib/` +
schema slice + i18n + tests). Everyone uses Claude Code, so there is no frontend/backend split.

| Person | GitHub | Lane | Owns |
|---|---|---|---|
| Aok | `@AokDesu` | infra + escrow money-core + integration | Dev DB, Railway, R2, secrets; `lib/ledger`, `lib/booking`, `lib/money`, quote engine, Opn, payouts, refunds, money E2E; `prisma/` schema integration; **merges every PR**; compliance/launch gate |
| bard | `@Chavaphon` | guest experience + AI concierge | search/detail, saved villas, instant-book + QR, per-booking messaging, reviews; the whole Phase-4 concierge; design tokens + app shell |
| poom | `@Mrmo0p` | identity + host authoring + admin/moderation | LINE login, OTP, admin auth; listing wizard + KYC, host dashboard/calendar; admin approval; disputes, reports/strikes |

Find your work: `gh issue list -R Web-URest/URest --assignee @me`. Every issue carries a milestone
(`M1`–`M5`), one `area:*` lane label, and `afk` or `hitl`.

## afk vs hitl — the agent-dispatch model

- **`afk`** = fully specified, no human keys/decisions needed → the owner can dispatch it to a
  background Claude agent on its own branch, then review the resulting PR.
- **`hitl`** = needs a human: a secret/key, a KYC or legal decision, schema sign-off, design judgement.

**Dispatched-agent lifecycle (afk):**
1. **Claim** — the agent comments `🤖 picking up #N on feat/N-slug`, branches `feat/<N>-<slug>` off the latest `main`.
2. **Work** — implements the single vertical slice; runs the gate `pnpm typecheck && pnpm lint && pnpm test`; obeys the shared-file protocol below.
3. **Signal done** — opens a PR (body `Closes #N`, the template filled, gate output pasted, `area:*` + milestone copied onto the PR). The open PR *is* "done"; never auto-merged.
4. **Blocked** — if it hits a missing key/decision mid-flight, it flips the issue `afk → hitl`, comments what's needed, and stops. A human resolves and either re-flags `afk` or finishes it.
5. **Merge** — Aok reviews + merges (see below); the squash-merge auto-closes the issue.

## Branch / PR / merge conventions

- **Branch:** `feat/<issue#>-<slug>` (e.g. `feat/14-listing-approval`). Other prefixes mirror labels: `fix/`, `docs/`, `chore/`. **One issue = one branch = one PR.**
- **Small PRs** — one vertical slice, reviewable in one sitting. Too big? Split into stacked PRs.
- **Stacked PRs** (B depends on A): branch B off A, open B with **base = A's branch** and note "Stacked on #A". Aok merges A first; GitHub retargets B to `main`; rebase and merge B. A cross-owner dependency becomes a "Blocked by #X" link, and the blocked issue stays out of `afk` until #X merges.
- **Only Aok (`@AokDesu`) merges** — every PR, including bard↔poom ones. Default **squash-merge** (one revertable commit per issue on `main`). Authors never self-merge.
- **Merge precondition:** CI green + Aok approval + (for shared-file PRs) the integration step done.
- **`main` stays deployable** (Railway auto-deploys it): no direct pushes; additive migrations only, so an app-code revert never strands the schema. A bad deploy is one `git revert` of one squash commit.

CODEOWNERS (`.github/CODEOWNERS`) auto-requests the right reviewer. On this private/free-tier repo
branch protection may not be enforceable, so "only Aok merges" is the real gate — CODEOWNERS is the
auto-request + convention.

## Shared-file protocol (the heart of safe parallelism)

Feature-vertical work means several people add to the same few files. Keep edits **additive,
owner-namespaced, and funnel the truly-serial ones through Aok.**

- **`prisma/schema.prisma` + migrations** — design in **`docs/DATA_MODEL.md` first**, then implement.
  **Additive only** (new models / optional columns merge cleanly across owners). **Aok integrates &
  orders migrations** at merge time, in PR order, so two devs never race a migration filename.
  Renames/drops/required-column-adds need Aok sign-off. Raw-SQL constraints (btree_gist exclusions,
  `num_nonnulls` CHECKs) are preserved per migration. A `Booking` snapshots price/rules onto its
  **own** fields (ADR-011) — it never mutates the `Listing` model, so the booking and listings lanes
  don't share a writer.
- **`src/lib/env.ts` + `.env.example`** — move in **lockstep, same PR** (CLAUDE.md rule 4). Prefix by
  lane: `AUTH_`, `LINE_`, `OPN_`, `R2_`, `ANTHROPIC_`/`CONCIERGE_` (unprefixed only for the existing
  `DATABASE_URL`, `DATA_ENCRYPTION_KEY`). Append within your prefix group; never reorder existing entries.
- **`messages/th.json` + `en.json`** — one top-level section per feature (`Auth.*`, `Listing.*`,
  `Booking.*`, `Admin.*`, `Concierge.*`, `Notification.*`, shared atoms in `Common.*`). **Thai-first**
  (`th.json` is the source); mirror the key into `en.json` in the same PR. Append within *your* section
  (disjoint JSON sub-trees merge cleanly); a key in one file but not the other is a review-blocker.
- **`src/app/globals.css` `@theme`** — land the design-token PR (#5) **first**, then **freeze**.
  Feature PRs *consume* tokens, never add/change them; a genuinely new token needs its own
  `area:design-system` PR + `DESIGN_SPEC.md` update (CLAUDE.md rule 8).

## Issue-tracker hygiene

Every issue carries, before it's actionable: a **milestone** (M1–M5), exactly one **`area:*`** lane,
an **assignee** (the lane owner), and **`afk`** or **`hitl`**. New incoming issues open with
`needs-triage`; triage sets the four fields and swaps `needs-triage` for `afk`/`hitl` (or `needs-info`).
The label → engineering-skill mapping lives in `docs/agents/triage-labels.md`.
