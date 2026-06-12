# ADR-004: Modular monolith with in-process scheduler

**Status:** Accepted · 2026-06-12

## Context

Two developers (plus Claude Code), one product, pilot scale (~tens of bookings/month). The booking domain is timer-heavy (PRODUCT_FLOWS §6 lists 9 distinct timers) and state-machine-shaped. The temptation in tutorials is queues (BullMQ/Redis), serverless functions, and service splits — all of which add infrastructure for problems we don't have.

## Decision

1. **One Next.js application** (App Router) is the entire system: guest UI, host UI, admin UI (`/admin`, separate auth surface), API routes, Opn webhooks.
2. **Domain logic lives in `lib/` modules** (booking, ledger, listing, messaging, notifications, concierge) — plain TypeScript functions with Prisma, imported by both server components and route handlers. Modular monolith: module boundaries, no network boundaries.
3. **Timers**: a single in-process scheduler (node-cron) ticks every minute and runs idempotent sweeps — e.g. `expireOverdueRequests()`, `releasePayouts()` — implemented as `WHERE deadline < now() AND state = X` queries. **Deadlines are rows, not setTimeout calls**: a restart loses nothing because the sweep re-derives work from the DB.
4. **No Redis, no queue, no microservices** in v1. LINE/email sends are fire-and-forget with a `NotificationLog` row + retry sweep for failures.
5. Booking and listing state machines follow the same pattern as the ledger (ADR-003): transitions in one module, states from PRODUCT_FLOWS verbatim.

## Consequences

- ✅ One deploy, one log stream, one mental model; Railway runs it as a single service (ADR-002).
- ✅ Idempotent sweeps make timers testable with a fake clock and safe across restarts.
- ⚠️ Minute-resolution timers (not second) — fine: every product deadline is ≥15 minutes.
- ⚠️ If the concierge's LLM latency ever blocks the event loop noticeably, extract a worker *then* — that's the first legitimate split, and module boundaries make it cheap.
