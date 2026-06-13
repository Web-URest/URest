## What & why
<!-- One paragraph. Link the issue so it auto-closes on merge. -->
Closes #

## Lane
<!-- Set the area:* label + milestone on this PR. For an afk PR, name the dispatched branch. -->
Area: `area:` · Milestone: `M`

## PR gate (CI runs the same — must be green before merge)
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass locally
- [ ] Small PR — one vertical slice, reviewable in one sitting

## Hard-rule checklist (tick what this PR touches; CLAUDE.md has the full list)
- [ ] **Money** is integer satang via `lib/money.ts` — no floats; format only at the UI edge (rule 1)
- [ ] **State transitions** happen only inside `lib/<domain>/`, never in routes/components (rule 2)
- [ ] **Deadlines** are DB rows for the cron sweep, not in-process timers; timestamps UTC (rule 3)
- [ ] **New env var** ⇒ updated `src/lib/env.ts` AND `.env.example` in THIS PR, correct prefix (rule 4)
- [ ] **No `any` / no bare `@ts-ignore`**; handled `undefined` from `noUncheckedIndexedAccess` (rule 5)
- [ ] **Webhooks** idempotent via `WebhookEvent`; charge → ledger in one transaction (rule 6)
- [ ] **User-facing strings** in `messages/th.json` (source) + `en.json`, under my feature section — none hardcoded (rule 7)
- [ ] **Colors/radii/shadows** from `globals.css @theme` only — no invented hex (rule 8)
- [ ] **Secrets/KYC** never in the client bundle, public bucket, or logs (rule 9)
- [ ] **No new sensitive column / encrypted field** without updating ADR-010 first; Thai national ID never stored (rule 10)

## Schema / migrations (delete this section if N/A)
- [ ] Updated **`docs/DATA_MODEL.md` design FIRST**, then `schema.prisma`
- [ ] Change is **additive** (new model / optional column) — no rename/drop without @AokDesu sign-off
- [ ] Raw-SQL constraints (btree_gist exclusions, CHECKs) preserved in the migration
- [ ] @AokDesu integrates the migration (shared-file protocol — `docs/CONTRIBUTING.md`)

## Locked decisions
- [ ] This PR doesn't silently contradict a locked ADR / PRODUCT_FLOWS decision (if it must, I surfaced it on the issue)
