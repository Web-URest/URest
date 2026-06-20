# Runbook — Report triage

**Owner:** admin on duty · **Code:** `src/lib/admin/report-review.ts`, `/admin/reports-queue`

Triage user-submitted reports (against a booking, listing, review, or user). Status: DRAFT — review with a second teammate before launch.

## When
A guest/host (or logged-out visitor, for listing reports) files a report → it appears in the queue, **money-at-risk first**, then oldest-first.

## Steps
1. Open **/admin/reports-queue**. Items with a payout at risk are flagged. Click **Review**.
2. Read the report category + detail (+ photos). Then choose:
   - **Accept into review** — opens the case (`REPORT_ACCEPTED`). If it's a booking report on a `HELD`/`RELEASABLE` booking, **the payout is auto-frozen** so money can't leave while you investigate.
   - **Resolve (upheld)** / **Dismiss (off-topic)** — close with a reason.
   - **Unlist** — hide the listing pending investigation (`LISTING_UNLISTED`).
   - **Escalate to dispute** — convert a booking report into a dispute (`REPORT_ESCALATED`); handle it via the dispute runbook.
   - **Strike host** — issue a `HostStrike` (`HOST_STRUCK`); 3 strikes → suspension.
3. A **reason is required** for every decision; all decisions are audited.

## Gotchas
- Review-flag reports (someone flagged a review) are handled in **/admin/reviews**, not here — this queue filters them out (`reviewId: null`).
- Accepting a booking report freezes the payout via the ledger — releasing requires resolving the report/dispute.
- A strike is serious (3 → suspension); use the reason field to record why.
