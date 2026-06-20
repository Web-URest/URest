# Runbook — Listing approval review

**Owner:** admin on duty · **SLA:** 24h from submit · **Code:** `src/lib/admin/listing-review.ts`, `/admin/approval-queue`

Review a host's KYC + listing before it goes live. Status: DRAFT — review with a second teammate before launch.

## When
A host submits a listing for review → it appears in the queue (`PENDING_REVIEW`). Oldest first; items past 24h are flagged overdue.

## Steps
1. Open **/admin/approval-queue**. Click **Review** on the oldest (or overdue) item.
2. **KYC documents** — open each (Thai ID, right-to-rent, selfie). Links are **signed URLs that expire in 5 minutes**; never screenshot, download, or paste them anywhere. Confirm the religion line on the ID is redacted (PDPA §26) — if not, use **Needs-info → THAI_ID_UNCLEAR**.
3. **Listing photos + map** — confirm photos look real (not stolen stock) and the map pin is coherent with the documents/address.
4. Work the **checklist**: names match across ID / right-to-rent / bank account; documents legible; photos real; map coherent.
5. **Decide:**
   - **Approve** → listing publishes + an `LISTING_APPROVED` audit row is written (one transaction). Host is notified.
   - **Needs info** → tick the exact items + add a per-item note → host gets a to-do checklist (`LISTING_NEEDS_INFO`).
   - **Reject** → enter a reason. KYC docs are marked `purgeAfter = now + 90 days` (auto-deleted by the retention cron, #35). `LISTING_REJECTED` audit + host notified.
6. **Legal badge** (ถูกต้องตามกฎหมาย) is granted/removed **separately** and never blocks approval — verify the hotel licence / non-hotel registration on its own.

## Gotchas
- The decision + KYC status + listing status + audit row all happen in **one transaction** — a half-applied decision can't occur.
- Rejection ≠ immediate deletion; the 90-day purge is what removes the R2 bytes + rows.
- A returning host with a clean history can be reviewed faster, but still re-check the docs.
