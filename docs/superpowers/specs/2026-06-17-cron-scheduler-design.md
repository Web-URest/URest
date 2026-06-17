# Design — in-process cron scheduler + booking lifecycle sweeps · issue #61

**Status:** approved (2026-06-17) · **Branch:** `feat/61-cron-scheduler` · **Phase:** 3
**Authority:** binding contracts remain `ADR-004` (in-process scheduler), `PRODUCT_FLOWS.md` §2.1
(timers) / §8, and CLAUDE.md rules 2 & 3. Decomposed from #21 (request-to-book).

## Problem
The booking state machine (#19) ships time-driven transitions — `expire` (REQUESTED/AWAITING_PAYMENT
past their deadline), `checkIn` (CONFIRMED→CHECKED_IN), `complete` (CHECKED_IN→COMPLETED, releases
escrow) — and `purgeDeadOtps()`, but **nothing runs them on a schedule**. Per ADR-004, deadlines are
DB rows swept by a single in-process node-cron tick (`WHERE deadline < now()`), never `setTimeout`,
so a restart loses nothing. This is shared infra: #21/#22 (expiry), #25 (escrow release → payouts),
#28 (review reminders later) all depend on it.

## Decision / approach
ADR-004 locks it: one in-process `node-cron` tick every minute, idempotent DB-row sweeps. (A separate
worker/Railway-cron is rejected by the monolith ADR; `setInterval` is rejected for node-cron's clean
cron expression + the documented choice.)

## Architecture

**Separation by rule 2** — the *which rows are due* + transition call is booking-domain; the tick is
thin infra.

- **`src/lib/booking/sweeps.ts`** (booking-domain) — each takes `now: Date`, queries due rows, calls
  the existing transition per row inside a **per-row try/catch** (one bad row never aborts the sweep),
  returns a processed count:
  - `sweepOverdueRequests(now)` → `findMany {status: REQUESTED, respondBy: { lt: now }}` → `expire(id, now)`
  - `sweepOverduePayments(now)` → `findMany {status: AWAITING_PAYMENT, payBy: { lt: now }}` → `expire(id, now)`
  - `sweepDueCheckIns(now)` → `findMany {status: CONFIRMED, checkIn: { lte: now − 8h }}` → `checkIn(id)`
  - `sweepDueCheckouts(now)` → `findMany {status: CHECKED_IN, checkOut: { lte: now − 4h }}` → `complete(id)`
- **`src/lib/otp/purgeDeadOtps()`** — already exists; the scheduler just calls it.
- **`src/lib/jobs/scheduler.ts`** (thin infra) — `startScheduler()`: `node-cron` `* * * * *` → on each
  tick run all sweeps with `now = new Date()`, each wrapped in try/catch + one log line
  (`[cron] <sweep>: n processed`). A module-level `started` flag prevents dev double-registration.

**Boot wiring** — in `src/instrumentation.ts`, after the existing `@/lib/env` import succeeds,
`await import("@/lib/jobs/scheduler")` and call `startScheduler()`. Node runtime only
(`NEXT_RUNTIME === "nodejs"`, already guarded); **skipped when `NODE_ENV === "test"`** so vitest never
schedules. Survives restart by re-deriving from the DB (ADR-004).

## Timezone (check-in / checkout)
Asia/Bangkok is a fixed **UTC+7, no DST**. Convention (which #21's request flow must honor): a
booking's `checkIn`/`checkOut` is the **calendar date at UTC midnight**. The auto-transitions fire at
global Bangkok wall-clock times (PRODUCT_FLOWS §2.1), not per-listing times:
- check-in 15:00 ICT = 08:00 UTC → due when `checkIn ≤ now − 8h`
- checkout 11:00 ICT = 04:00 UTC → due when `checkOut ≤ now − 4h`

Implemented as two named constants (`CHECKIN_OFFSET_MS`, `CHECKOUT_OFFSET_MS`); no tz library.

## Idempotency & safety
Sweeps re-query every tick; the transitions already re-check current state, so replays and overlapping
ticks are safe (a row mid-flight fails its state guard and is skipped). Expiry queries are backed by
the existing `@@index([status, respondBy])` / `@@index([status, payBy])`; check-in/checkout filter on
`status` + the date column. A per-row throw is caught and logged; the sweep continues.

## Testing (the "verified with shortened timers" criterion)
Vitest units per sweep (mock `@/lib/db` prisma `findMany` + mock the transition fn, same pattern as
`booking/transitions.test.ts`):
- due rows → transition called per row with the right args; **non-due rows skipped** (assert the WHERE
  / threshold passed to `findMany`);
- **per-row failure isolated** — one transition throw still processes the rest + returns the right count;
- **idempotency** — a second run where `findMany` returns nothing (already transitioned) is a no-op.
- check-in/checkout: assert the `now − 8h` / `now − 4h` threshold (pass a fixed `now`).
The `node-cron` wiring in `scheduler.ts` stays thin (smoke-level; not deeply unit-tested).

## Dependencies / config
Add `node-cron` + `@types/node-cron` (additive, `package.json`/lockfile). No new env var — gated by
`NEXT_RUNTIME` + `NODE_ENV`.

## Out of scope (other slices / issues)
Notifications dispatch + the notification-retry sweep (slice 2); `releasePayouts` RELEASABLE→PAID
(admin-triggered, #25); the request-to-book vertical (#21). Retention crons are M5 (#35).
