# Design — Payout admin operations (#25)

**Status:** approved 2026-06-18 · **Branch:** `feat/25-payout-admin` · **Closes:** #25

## Goal

The admin side of the money lifecycle (PRODUCT_FLOWS §5.2): a **due list** of bookings ready to pay
out (escrow RELEASABLE, no active hold), grouped by host payout account; the **single audited path**
that decrypts `PayoutAccount.accountNumberEnc`; **mark-paid** (slip ref + LINE notify, ledger
RELEASABLE→PAID); **holds** at booking + whole-host scope (reason, reversible, audited); and a
**reconciliation gate** (ledger totals vs the Opn balance) that blocks payouts on a mismatch. v1 is
manual — a human in the money loop is the feature.

Completes the escrow story: pay → HELD → RELEASABLE → **PAID**.

## Decisions (2026-06-18)

- **Reconciliation balance = live Opn `getBalance()`** (not admin-entered).
- **Mismatch rule = solvency + ledger integrity:** block if the ledger invariant fails OR Opn balance
  `< obligation (held+releasable+frozen)`. A surplus (retained commission float) is fine.
- **Host payout = `totalSatang − commissionSatang` (90%);** the 10% stays as U-Rest revenue in the Opn
  balance. The ledger `PAY` still discharges the full escrow amount.

## Reuse (already built — verified)

- `lib/ledger`: `payout(tx, bookingId, adminId)` op-builder (RELEASABLE→PAID, `PAID_ADMIN_TRANSFER`),
  the `Buckets`/`foldMove`/`invariantHolds` primitives. `lib/ledger` is the sole writer of escrowState.
- `lib/crypto.ts` `decryptField`.
- Admin auth `getAdmin`/`requireAdmin` (separate AdminUser + TOTP); the `admin/(console)` layout +
  the **op-builder `$transaction` + AuditLog seam** from #70 (`lib/admin/listing-review.ts`).
- Models (no schema change): `Payout` (`bookingId @unique`, `slipRef`, `paidByAdminId`, `paidAt`,
  `hostAmountSatang`, `payoutAccountId`), `PayoutHold` (booking XOR host CHECK, `reason`, `releasedAt`,
  `releasedByAdminId`), `PayoutAccount` (`accountNumberEnc`, `bankCode`, `accountName`), `AuditLog`.

## Architecture

### A. Opn balance + ledger totals + reconcile
- `lib/payments/opn.ts`: `getBalance(): Promise<OpnBalance>` — `GET /balance` → `{ total, available }`
  (satang), via the generic `opnRequest<OpnBalance>`.
- `lib/ledger` (apply.ts): `ledgerTotals(): Promise<Buckets>` — fold every `LedgerEntry` through
  `foldMove` (pilot volume; O(entries) is fine).
- `lib/admin/payout.ts` `reconcile(): Promise<Reconciliation>` → `{ invariantOk, opnTotalSatang,
  obligationSatang: held+releasable+frozen, ok }`, `ok = invariantOk && opnTotalSatang >= obligation`.

### B. Single audited decryption
`revealAccountNumber(admin, payoutAccountId): Promise<{ accountNumber, bankCode, accountName }>` —
the ONLY caller of `decryptField(accountNumberEnc)`. Writes an `AuditLog`
(`action: "PAYOUT_ACCOUNT_DECRYPTED"`, `targetType: "PayoutAccount"`, `targetId`, adminId — **no
plaintext in before/after**) then returns the number to the admin UI for the transfer. The due list
renders only `bankCode` + `accountName`; nothing else decrypts (rules 9/10).

### C. Mark-paid (`lib/admin/payout.ts`)
`markPaid(admin, bookingId, slipRef)`:
1. Load booking; guard escrow RELEASABLE, no active hold, `slipRef` non-empty.
2. **`reconcile()` — refuse if `!ok`** (server-side gate; acceptance #3).
3. One `$transaction([ payout(tx, bookingId, admin.id), prisma.payout.create({ bookingId, payoutAccountId,
   hostAmountSatang: totalSatang − commissionSatang, slipRef, paidByAdminId: admin.id, paidAt: now }),
   prisma.auditLog.create({ action: "PAYOUT_PAID", before/after }) ])`.
4. `notify(hostId, "PAYOUT_PAID_HOST", { amountSatang: hostAmountSatang, slipRef, code })`.
Double-pay is impossible: `payout()` throws once escrow is PAID + `Payout.bookingId` is unique.

### D. Holds (PayoutHold rows — NOT escrow freezes)
Manual holds are administrative and leave escrowState RELEASABLE (distinct from the dispute/report
auto-freeze in §2.3 / #27, which does touch escrow). `placeHold(admin, target, reason)` where `target`
is `{ bookingId }` or `{ hostUserId }` (reason required) → create `PayoutHold` + AuditLog → notify host
`PAYOUT_HOLD_CREATED`. `releaseHold(admin, holdId)` → set `releasedAt`/`releasedByAdminId` + AuditLog →
`PAYOUT_HOLD_RELEASED`. The due-list query excludes any booking with an **active** hold (an unreleased
`PayoutHold` matching its `bookingId` OR its host's `hostUserId`). Held bookings render **greyed with
the reason** (never silently dropped).

### E. Due list + admin UI
`loadPayoutDueList()` → bookings `escrowState = RELEASABLE`, grouped by host payout account, each with
`hostAmountSatang` + group total; plus the active-hold annotations (greyed). New
`src/app/[locale]/admin/(console)/payouts/page.tsx` (reconciliation banner → grouped cards → reveal /
mark-paid / hold / release actions) + `payouts/actions.ts` (each `requireAdmin` → the coordinator).
Add a **"Payouts"** entry to the admin console nav. Mirrors the approval-queue page/action pattern.

### F. Notifications
`PAYOUT_PAID_HOST` (priority — amount + slip ref + booking code), `PAYOUT_HOLD_CREATED` (reason),
`PAYOUT_HOLD_RELEASED`. Append-only in `templates.ts`.

## Out of scope (note in PR)

- Dispute/report **auto-freeze** of escrow (§2.3) → #27; #25 only does *manual* payout holds.
- Opn payout-API automation — v1 is manual bank transfer + slip ref (§5.2 "manual is the feature").
- Commission withdrawal/accounting to U-Rest's own account — separate ops concern.

## Verification

- **Unit (Vitest):** `reconcile` (surplus → ok; shortfall → blocked; invariant-fail → blocked);
  `markPaid` (composes payout+Payout+audit; refuses when reconciliation fails / held / not RELEASABLE;
  hostAmountSatang = total − commission); `placeHold`/`releaseHold` (both scopes; due-list exclusion;
  audited); `revealAccountNumber` (decrypts once + writes audit, no plaintext logged); `ledgerTotals`;
  `getBalance` (GET /balance shape); the 3 templates. `gate:status` stays green (escrow only via
  `lib/ledger` `payout`); `gate:bodyraw` unaffected.
- **Staging (acceptance #1):** a RELEASABLE booking → reveal account (audited) → mark-paid with slip
  ref → escrow PAID + Payout row + host notified; AuditLog has the decryption + the PAYOUT_PAID rows.
- **Holds (acceptance #2):** place a booking-scope + a host-scope hold → both drop from the due list
  (greyed), reversibly; release restores them; all audited.
- **Reconciliation (acceptance #3):** force a shortfall (or invariant break) → mark-paid is refused.
- **Decryption audit (acceptance #4):** every `revealAccountNumber` writes an AuditLog row.
