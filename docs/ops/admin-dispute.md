# Runbook — Dispute handling

**Owner:** admin on duty · **Code:** `src/lib/admin/dispute-review.ts`, `src/lib/booking/transitions.ts`, `/admin/disputes`

Resolve a guest dispute (and any appeal), move the frozen escrow, and send the guest refund. Status: DRAFT — review with a second teammate before launch.

## When
A guest opens a dispute (check-in → checkout window) → the booking is `DISPUTED`, escrow is frozen, and it appears in the queue. Resolved cases with an armed appeal also appear (escrow re-frozen, awaiting the final ruling).

## Steps
1. Open **/admin/disputes** → **Review** a case.
2. The case view shows the dispute, the guest's report(s) + evidence photos, the escrow state/total, and the **unmasked chat thread**. Revealing the thread writes a `DISPUTE_THREAD_REVEALED` audit row — it is shown **solely to resolve this dispute** (PDPA).
3. **Resolve:** choose **Release to host** (no refund), **Partial** (enter a refund %), or **Full refund**. This settles the ledger (`DISPUTE_RESOLVED` audit) and notifies both parties. Partial/full leaves the refund **owed but not yet sent**.
4. **Appeals** (optional, one per side): on appeal the still-releasable escrow is **re-frozen** so the payout run can't disburse it. Resolve the appeal the same way (final) — `DISPUTE_APPEAL_RESOLVED`.
5. **Finalize the refund:** once the dispute is final (no appeal pending — escrow not `FROZEN`), click **"Finalize & send guest refund."** This is a **separate, deliberate step** that pushes the single Opn refund for the cumulative amount owed (`DISPUTE_REFUND_FINALIZED`).

## Gotchas
- **Finalize is intentionally separate** from resolve: the Opn refund must fire **once, after the appeal window**, with the cumulative amount — finalizing early would strand an appeal's extra refund.
- You can't finalize while an appeal is armed (escrow `FROZEN`) — the button is gated.
- Terminal money (already fully refunded/paid) can't be clawed back by a late appeal — that's a documented v1 limit.
- The chat reveal is audited every time; only open it when adjudicating.
