# U-Rest — agent instructions

Escrow-protected Thai pool-villa booking marketplace. Real startup, pilot phase, 2-dev student team, ฿1,000/month infra ceiling. **Trust is the product** — every convention below exists because this codebase moves other people's money.

## Source-of-truth documents (read before designing anything)

| Question | Document |
|---|---|
| What does feature X do? Exact states, timers, flows | `PRODUCT_FLOWS.md` — THE functional contract |
| Why is the architecture like this? | `docs/adr/ADR-001…009` (payments, hosting, ledger, monolith, notifications, AI, auth, i18n, tooling) |
| AI concierge implementation | `docs/AI_CONCIERGE_SPEC.md` |
| Scope, metrics, launch gate | `PRD.md` |
| Visual tokens/components | `DESIGN_SPEC.md` + `design/mockups/` (reference, not pixel-contract) |

Never contradict a locked decision silently — if a task seems to require it, stop and surface the conflict.

## Hard rules (violations are review-blockers)

1. **Money is integer satang** (`Int`, 1 baht = 100 satang) in every schema field, payload, and prop. Use `src/lib/money.ts` helpers. No floats, ever. Display formatting only at the UI edge.
2. **Booking/ledger/listing state transitions happen ONLY inside their `src/lib/<domain>/` module.** No page, component, or API route writes a status field directly. The transition functions mirror `PRODUCT_FLOWS.md` §2 state machines exactly.
3. **Timestamps are UTC in the database** (`timestamptz`); `Asia/Bangkok` conversion happens at display only. Timers/deadlines are DB rows swept by cron (`WHERE deadline < now()`), never in-process `setTimeout`.
4. **Configuration comes from `src/lib/env.ts`** (zod-validated at boot) — never `process.env` directly. New variable = update `env.ts` + `.env.example` in the same PR.
5. **TypeScript strict stays strict.** No `any`, no `@ts-ignore` without a comment explaining the upstream type bug. `noUncheckedIndexedAccess` is on — handle the `undefined`.
6. **Webhooks are idempotent**: Opn events recorded in a `WebhookEvent` table (unique event id) before processing; replays are no-ops; charge → ledger mutation in one transaction.
7. **Thai-first i18n**: user-facing strings live in `messages/th.json` (source) + `messages/en.json` — never hardcoded in components. Use `Link`/`useRouter` from `src/i18n/navigation.ts`, not `next/link`.
8. **Design tokens only** — colors/radii/shadows come from `globals.css` `@theme` (mapped from DESIGN_SPEC §3). Inventing hex values is palette drift; don't.
9. **KYC documents and secrets never touch the public bucket, client bundles, or logs.** Private R2 + presigned URLs only (ADR-007).

## Style

- **Boring over clever.** The novelty budget is spent on escrow + AI. Auth, CRUD, and UI should be the most conventional Next.js (App Router, server components by default) you can write. The ONE sanctioned place for extra rigor is the ledger (ADR-003: append-only, property-tested).
- Don't add abstractions, helpers, or error handling for scenarios that can't happen. Don't build ahead of the current phase (phases: 1 foundation → 2 listings → 3 booking/escrow → 4 AI → 5 trust/polish).
- Tests mirror blast radius: ledger = fast-check property tests, money paths = Playwright E2E (Phase 3+), components = RTL only where logic lives, everything else = plain Vitest units.

## Commands

| | |
|---|---|
| `pnpm dev` | dev server |
| `pnpm db:up` / `pnpm db:down` | local Postgres+pgvector (Docker) |
| `pnpm db:migrate` | prisma migrate dev |
| `pnpm typecheck && pnpm lint && pnpm test` | the PR gate (CI runs the same) |
| `pnpm build` | production build (standalone output for Railway) |

## Workflow

- `main` is always deployable (Railway deploys it). Work on branches, PR even between the two devs, small PRs.
- Phase 4 only: any change to AI prompts/tools/model requires `pnpm eval:concierge` to pass (the ~102-case golden set is the launch gate — see AI_CONCIERGE_SPEC §6).
