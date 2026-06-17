# Money-path E2E suite (#29)

Playwright E2E over the booking money path (#20–#23). Runs the **real app** (UI → server
actions → charge → webhook → ledger) against a **real test Postgres** (`urest_e2e`), with only the
Opn HTTP boundary faked by a local mock (`e2e/opn-mock.ts`) so it's deterministic — no public URL,
no sandbox flakiness, no secrets. The webhook still **re-fetches** the charge from the mock (the real
verification path), so nothing about the security model is bypassed.

## Run it

```bash
pnpm db:up                 # local Postgres (Docker)
pnpm e2e                   # boots the mock + `pnpm dev`, migrates urest_e2e, runs the suite
pnpm e2e e2e/specs/<f>     # a single spec
```

Runs nightly in CI (`.github/workflows/e2e.yml`) + on `workflow_dispatch`. PR CI stays unit/lint/typecheck.

## Harness (`e2e/harness.ts`)

Direct DB access for what the UI can't: seed users + Auth.js sessions (`authjs.session-token`
cookie), seed a `PUBLISHED` listing, drive host-side transitions (`acceptAs`/`declineAs`), `tick`
the cron sweeps with a controlled `now`, and `payViaMockAndWebhook` (mark the charge paid on the mock
+ POST the webhook). Uses the app's `@/lib/db` client so imported transitions/sweeps share the test DB.

## Coverage → PRD §6 (Product gate)

| Spec | PRD §6 checkbox |
|---|---|
| `request-happy` | happy path: request → accept → pay → CONFIRMED → check-in → checkout → payout-ready |
| `instant-happy` | happy path (instant) + **notifications fire** (PAYMENT_RECEIVED `NotificationLog`) |
| `unhappy` › host declines | unhappy: host declines |
| `unhappy` › request expires | unhappy: request expires |
| `unhappy` › payment lapses | unhappy: payment window lapses |
| `qr-regenerate` | unhappy: QR regenerates (window preserved) |
| `cancel-tier` | unhappy: guest cancels per policy tier (→ REVERSED + Opn refund) |

## Deliberately out of scope

- **Dispute freezes payout** — the one PRD §6 unhappy-path checkbox NOT covered here: the dispute flow
  (#27) has no UI yet; the freeze transition is unit-tested in #19. Lands with #27.
- **Ledger-reconciliation screen** — admin surface (#25); the suite asserts ledger **state** directly.
- **Signup/KYC/approval/listing-creation** — seeded, not driven through the UI (other lanes).
- **Real Opn sandbox charge + refund** — a manual pre-launch runbook (PRD §6 legal gate), not this suite.
