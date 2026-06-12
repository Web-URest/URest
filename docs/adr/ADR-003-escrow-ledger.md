# ADR-003: Escrow ledger as an append-only Postgres state machine

**Status:** Accepted · 2026-06-12

## Context

Because no Thai gateway manages marketplace escrow for us (ADR-001), the "escrow" is operational: money sits in the Opn balance while *our* records decide who is owed what. Those records are the single most safety-critical data in the system — a wrong payout or lost refund destroys the trust brand the whole company is built on. PRODUCT_FLOWS §2.3 defines the functional contract: payout states `HELD → RELEASABLE → PAID` with `FROZEN` and `REVERSED` branches, and the invariant `sum(HELD + RELEASABLE + FROZEN) = received − refunded − paid out`.

## Decision

1. **`LedgerEntry` is append-only.** State changes are new rows (booking_id, amount_satang, from_state, to_state, cause, actor, created_at), never UPDATEs. Current state is derived (or cached on Booking with a check constraint). Money amounts are **integer satang**, never floats.
2. **Every transition records its cause**: an Opn webhook id, a timer firing, an admin action id (which itself is in the audit log), or a dispute resolution. No orphan transitions.
3. **Webhook idempotency**: Opn events are written to a `WebhookEvent` table with a unique event id before processing; replays are no-ops. Charge → ledger HELD happens in one DB transaction with the booking state change.
4. **Transitions live in one module** (`lib/ledger.ts`): a pure function `(currentState, event) → newState | reject` mirroring the PRODUCT_FLOWS diagrams. UI and admin actions cannot move money except through it.
5. **Reconciliation is a feature, not a script**: admin screen compares ledger totals against the Opn dashboard balance; mismatch blocks the payout run (PRODUCT_FLOWS §5.2).

## Consequences

- ✅ Auditability for free — the append-only log *is* the audit trail for every satang, which is also what a future lawyer/accountant/Opn-compliance review will ask for.
- ✅ The invariant is testable: a property test asserts it after every simulated event sequence.
- ⚠️ Slightly more code than a `status` column — accepted; this is the one place over-engineering is justified.
- ⚠️ Refund partial-retention math (90/10 split of retained amount, §3.6) must round in the guest's favor by policy — document in code.
