# ADR-011: Data-model decisions — snapshots, DB-level invariants, polymorphism

**Status:** Accepted · 2026-06-12 (grill session #7)
**Catalog:** `docs/DATA_MODEL.md` (the full table registry — change there first, implement second)

## Context

The whole domain is specified (PRODUCT_FLOWS.md), so the complete data model was designed in one pass to catch cross-domain shape problems while migration is free. Implementation stays phased: tables land with the `lib/` modules that guard them — tables without their state-machine modules invite the direct-write violations CLAUDE.md rule 2 prohibits. The "design ahead, implement per phase" split was an explicit resolution of the user's "design all tables now" request against the locked don't-build-ahead rule.

## Decision

1. **Design all now, migrate per phase.** Phase 2 slice (listings domain + Region/ThaiHoliday/Attraction/NotificationLog/SavedVilla/FAQ) is in `schema.prisma`; booking/escrow/social tables land in Phase 3, concierge in Phase 4. DATA_MODEL.md is the registry — schema changes are designed there before they're implemented.

2. **The invariants that move money live in the database, not just the app.** Raw-SQL constraints (registry in DATA_MODEL.md): GiST exclusion makes **double-bookings impossible** per listing across AWAITING_PAYMENT/CONFIRMED/CHECKED_IN (the instant-book race is real: PromptPay has no auth/capture); the same technique bans overlapping Seasons; `CHECK num_nonnulls(...) = 1` enforces Report and PayoutHold polymorphism. `lib/` modules check first for friendly errors; the constraint is the last line of defense against the bug we haven't written yet.

3. **Bookings are immutable snapshots.** Per-night `priceLines Json`, totals, cancellation tier, house-rules text, and booking mode freeze at request time. Host edits never move an agreed price; disputes adjudicate exactly what the guest accepted; ledger math reconciles against a frozen number. Listing pricing tables serve *new* quotes only.

4. **Report targets = 4 nullable FKs + CHECK exactly-one** (not a `targetType/targetId` string pair): the reports queue is an interactive admin work surface that needs real joins and referential integrity. `AuditLog` keeps its string pair — it's a write-only trail.

5. **Messages store `bodyRaw` + `bodyMasked` + `wasMasked`**, masking applied at write (rules frozen per message). Users are always served `bodyMasked` for pre-CONFIRMED messages; `bodyRaw` is readable through exactly one path — the admin dispute view — because the scam instruction *is* the dispute evidence (§5.3). Single-path rule mirrors `accountNumberEnc` (ADR-010).

6. **Amenities are an enum array (GIN-indexed); Region is a table.** Amenities = fixed UI-chip vocabulary, cheap to extend by migration. Regions carry data (names, center coords, GTM `isActive` gating) and region launch is a planned product event — an INSERT, not a deploy.

7. **Folded conventions:** booking code `UR-YYMM-NNNN` from a `BookingCodeCounter` row locked `FOR UPDATE` at CONFIRMED; timer deadlines are columns swept by cron (never setTimeout — rule 3); `Booking.escrowState` is a cache written only inside lib/ledger transactions (the append-only `LedgerEntry` stream remains the truth, ADR-003); times-of-day are "HH:mm" strings (zone-free); coordinates are Float; pgvector `embedding` columns wait for Phase 4's embedding-model choice (dimension unknown until then).

## Consequences

- ✅ Cross-domain shapes (booking↔ledger↔payout↔dispute↔report) reviewed once, together — the category of migration that hurts most is now unlikely.
- ✅ The two scariest failure modes — a double-booked paid weekend and a silently re-priced booking — are prevented by construction (DB constraint, snapshot), not by code review vigilance.
- ⚠️ Raw-SQL constraints mean hand-editing generated migrations; the DATA_MODEL.md registry exists so they're never silently dropped by a later migration.
- ⚠️ Phase 3 may still adjust the designed-but-unmigrated tables (e.g., after the Opn spike) — that's the point of deferring their migration; update DATA_MODEL.md first.
- ⚠️ ThaiHoliday lunar dates (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา + เข้าพรรษา) must be verified against the official calendar before Phase 3 launch — seeded fixed-date holidays only until then.
