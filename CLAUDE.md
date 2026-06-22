# U-Rest — agent instructions

Escrow-protected Thai pool-villa booking marketplace. Real startup, pilot phase, 3-dev student team, ฿1,000/month infra ceiling. **Trust is the product** — every convention below exists because this codebase moves other people's money.

## Source-of-truth documents (read before designing anything)

| Question | Document |
|---|---|
| What does feature X do? Exact states, timers, flows | `PRODUCT_FLOWS.md` — THE functional contract |
| Why is the architecture like this? | `docs/adr/ADR-001…013` (payments, hosting, ledger, monolith, notifications, AI, auth, i18n, tooling, data protection, data model, in-app booking obligation, design-system workflow) |
| AI concierge implementation | `docs/AI_CONCIERGE_SPEC.md` |
| Table shapes, enums, raw-SQL constraints | `docs/DATA_MODEL.md` — change the design there BEFORE touching schema.prisma |
| Scope, metrics, launch gate | `PRD.md` |
| Visual tokens/components | `DESIGN_SPEC.md` (§3 tokens) + the **`src/components/ui/`** component library, previewed at the dev-only **`/styleguide`** route (ADR-013); contribution rules in `docs/DESIGN_SYSTEM.md`. DESIGN_SPEC §9 keeps the historical audit's still-open build gaps — §9 item A2 must NOT be copied. |

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
10. **The Thai national ID number is never stored, in any form** — and only `PayoutAccount.accountNumberEnc` + `User.totpSecretEnc` (role=ADMIN rows) hold field-encrypted data (via `src/lib/crypto.ts`). Adding sensitive columns or expanding the encrypted-fields list requires updating ADR-010 first.

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

- `main` is always deployable (Railway deploys it). Work on branches, small PRs — see **`docs/CONTRIBUTING.md`** for the full team workflow: feature-vertical ownership, branch naming `feat/<issue#>-slug`, the shared-file protocol, and the `afk`/`hitl` agent-dispatch lifecycle.
- **One issue = one branch = one PR; only the lead (Aok / `@AokDesu`) merges.** Every PR auto-requests its `CODEOWNERS` reviewer. `afk` = a fully-specified issue a background Claude agent can pick up; `hitl` = needs a human (keys, decisions). Pick up work from your lane: `gh issue list --assignee @me`.
- Shared files have a protocol (`docs/CONTRIBUTING.md` § shared-file): `schema.prisma` is additive-only + Aok-integrated (`docs/DATA_MODEL.md` first); `env.ts` + `.env.example` move in lockstep; `messages/{th,en}.json` are append-only per feature section; `globals.css` `@theme` is frozen after the design-token PR.
- Phase 4 only: any change to AI prompts/tools/model requires `pnpm eval:concierge` to pass (the ~102-case golden set is the launch gate — see AI_CONCIERGE_SPEC §6).

## Agent skills

### Issue tracker

Issues and PRDs live in the `Web-URest/URest` GitHub Issues, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles map to this repo's existing labels: `ready-for-agent → afk`, `ready-for-human → hitl`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `docs/adr/` (+ a `CONTEXT.md` once `/grill-with-docs` creates one). See `docs/agents/domain.md`.
