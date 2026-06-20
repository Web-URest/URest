# Runbook — Payout run (pay hosts after checkout)

**Owner:** admin on duty (founder at pilot) · **Code:** `src/lib/admin/payout.ts`, `/admin/payouts`

Pay hosts the money held in escrow once a stay completes (ledger `RELEASABLE → PAID`). Status: DRAFT — review with a second teammate before launch.

## When
A booking reaches checkout with no open dispute → escrow becomes `RELEASABLE` and it appears on the due-list grouped by host payout account.

## Steps
1. Open **/admin/payouts**. Read the **reconciliation banner** at the top: it compares the live Opn balance against the escrow obligation (`held + releasable + frozen`).
   - **Green** → safe to pay.
   - **Blocked or error** → the **Mark paid** buttons are **disabled** (fail-closed). Do NOT pay. Investigate the mismatch (Opn dashboard vs the ledger) before continuing.
2. For each host group, review the due bookings (code, checkout date, host amount = total − 10% commission).
3. Click **Reveal** to see the bank account number. **Every reveal writes a `PAYOUT_ACCOUNT_DECRYPTED` audit row** — only reveal when you're about to transfer.
4. Make the transfer in your bank app to the revealed account.
5. Enter the **slip reference** and click **Mark paid**. This writes the ledger payout (`RELEASABLE → PAID`) + a `Payout` row (90% to host) + a `PAYOUT_PAID` audit row, in one transaction, then notifies the host.
6. A booking under a **payout hold** is annotated and cannot be paid until the hold is released (place/release holds are audited).

## Gotchas
- **Never** mark paid while the reconciliation banner is blocked — solvency is checked first; paying past a mismatch risks paying money that isn't there.
- Double-payment is structurally impossible (ledger rejects a second `payout`; `Payout.bookingId` is unique) — but still verify the slip ref before submitting.
- Payout automation (Opn Transfers API) is a v2 item; v1 is a manual bank transfer + slip ref.
