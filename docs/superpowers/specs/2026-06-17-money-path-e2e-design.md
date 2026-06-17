# Design — Money-path Playwright E2E suite (#29)

**Status:** approved 2026-06-17 · **Branch:** `feat/29-money-path-e2e` · **Closes:** #29

## Goal

Automate the PRD §6 *Product* gate as a deterministic E2E suite over the booking money path
(#20–#23): request & instant happy paths through payout-ready, and the unhappy paths (host decline,
request expiry, payment lapse, QR regenerate, guest cancel per tier). It runs the **real app** (UI →
server actions → charge → webhook → ledger) against a **real test Postgres**, with only the Opn HTTP
boundary faked so it's deterministic and CI-runnable without a public URL or sandbox flakiness.

Playwright is not currently set up (no dep, config, or CI job) — this builds the harness from scratch.

## Decisions (2026-06-17)

- **Fake the Opn HTTP boundary** (not the real sandbox) — deterministic, no public ingress, no secrets.
- **Defer dispute-freeze** to #27 (no dispute UI exists yet; the freeze transition is unit-tested in #19).
- **Nightly CI only** — PR CI stays fast (unit/lint/typecheck); a scheduled job runs the suite.

## Architecture

### A. Opn fake — `OPN_API_BASE` indirection + a mock server
The ONE app change: `opn.ts`'s hardcoded `const OPN_API_BASE = "https://api.omise.co"` becomes
`env.OPN_API_BASE` — a new **optional** `env.ts` var defaulting to `https://api.omise.co` (prod
unchanged; `.env.example` documents it). In E2E it points at a local **mock Opn server** the suite
runs (`e2e/opn-mock.ts`, plain node http, in-memory charge map):
- `POST /charges` → returns a charge (`status:"pending"`, a fake `source.scannable_code.image.download_uri`, an `id`, `authorize_uri:null`).
- `GET /charges/:id` → returns the charge with its **current** status (this is the webhook's re-fetch — the real verification path).
- `POST /charges/:id/refunds` → returns a refund object; records the call so a test can assert it.
- `POST /__control/charges/:id/pay` → flips a charge to `successful` (test-only control).

A payment thus runs end-to-end: app `createChargeForBooking` → mock returns pending → test marks it
paid on the mock → test POSTs the webhook event to `/api/webhooks/opn` → the app **re-fetches from the
mock** (sees `successful`) → `confirmFromWebhook` → ledger `NONE→HELD`. No payload trust bypassed.

### B. Test harness (`e2e/`)
`playwright.config.ts` `webServer` starts **two** processes: the mock (port e.g. 4100) and the Next app
(`pnpm dev`, port 3000 — build-free; fine for a nightly suite) with test env — `DATABASE_URL`→a dedicated `urest_e2e` DB,
`OPN_API_BASE`→the mock, dummy OPN/AUTH/etc. keys. A fixture (`e2e/fixtures.ts`) with a **direct Prisma
client** to the test DB provides what the UI can't:
- **Auth (database sessions):** insert a `User` (phone-verified guest, or host-eligible) + a `Session`
  row (`sessionToken`, `userId`, future `expires`) and set the browser cookie `authjs.session-token`
  = that token. Authenticated without driving the login UI.
- **Seed fixtures:** a region + a `PUBLISHED` `Listing` (chosen mode/tier) per test, unique check-in
  dates (the `booking_no_double_booking` GiST exclusion forces per-test isolation).
- **Time/sweeps:** the harness imports `runSweeps` (or the individual sweeps) and calls them with a
  controlled future `now` against the same test DB — drives expiry/lapse/checkout without waiting. No
  app test-route is added (script fallback if the `@/` alias import is awkward under Playwright's loader).
- **Teardown:** truncate booking/ledger/payment/notification/refund tables (or drop the seeded rows) so
  runs are repeatable.

### C. Scenarios → PRD §6 mapping
Each spec drives the real UI, then asserts DB/ledger state via the harness Prisma client:

| Spec | Flow | Asserts | PRD §6 |
|---|---|---|---|
| request-happy | request → accept → pay → webhook → checkout tick | `CONFIRMED` (code, escrow `HELD`, contact unmasked) → `COMPLETED` + `RELEASABLE` | happy path → payout-ready |
| instant-happy | instant-book → pay → webhook | `CONFIRMED` + `HELD` | happy path |
| host-decline | request → host declines | `DECLINED` + guest `NotificationLog` | unhappy: host declines |
| request-expiry | request → tick past `respondBy` | `EXPIRED` | unhappy: request expires |
| payment-lapse | accept/instant → tick past `payBy` | `EXPIRED` (instant: silent) | unhappy: payment window lapses |
| qr-regenerate | on pay screen, regenerate | new charge id, `payBy` unchanged | unhappy: QR regenerates |
| cancel-tier | confirm (known tier+dates) → cancel | tier refund amount, ledger `REVERSED`, mock got the refund call | unhappy: guest cancels per tier |

Notifications-fire checkbox → asserted via `NotificationLog` rows across specs. The ledger-reconciliation
*screen* is #25 (admin) — we assert ledger **state** directly instead. **Dispute-freeze → deferred to
#27** (the one PRD §6 unhappy-path checkbox not covered here; called out in the suite README).

### D. CI — nightly
`.github/workflows/e2e.yml`, `on: schedule` (nightly cron) + `workflow_dispatch`: a Postgres service
container, `pnpm install`, `pnpm exec playwright install --with-deps chromium`, migrate the `urest_e2e`
DB, then `pnpm e2e`. Faked Opn → no secrets. PR CI (`ci.yml`) is untouched.

### E. App surface touched
**Only** `src/lib/env.ts` (+ `.env.example`) and `src/lib/payments/opn.ts` (read `env.OPN_API_BASE`).
Everything else is new files under `e2e/` + `playwright.config.ts` + the CI workflow + `package.json`
(`playwright` devDep, `e2e`/`e2e:install` scripts). **No test routes or hooks ship in the app bundle.**

## Build order (sequenced in the plan)

1. `OPN_API_BASE` env indirection (unit-safe, prod-default).
2. Playwright install + config + the mock Opn server + the harness (auth/seed/sweep fixtures).
3. **One happy-path smoke** (request → pay → CONFIRMED) — proves the whole pipeline green end-to-end.
4. The remaining six scenarios.
5. The nightly CI workflow.

## Out of scope

- Dispute-freeze E2E (#27); the ledger-reconciliation admin screen (#25); signup/KYC/approval/listing-
  creation flows (driven by seeding, not UI — they're #6/#7/#17 lanes).
- PR-time E2E (nightly only). Real Opn sandbox charge+refund stays a manual pre-launch runbook (PRD §6
  legal gate), not this suite.

## Verification

- `pnpm e2e` green locally (Docker Postgres up, `urest_e2e` migrated) — all 7 specs pass.
- The nightly workflow goes green on a manual `workflow_dispatch`.
- Each PRD §6 *Product* happy/unhappy checkbox maps to a named spec (table above); the deferred
  dispute-freeze is explicitly noted.
- Existing unit/property suites + `pnpm gate:status` stay green (the `OPN_API_BASE` change is the only
  app-code touch; `opn.test.ts` still asserts the default base).
