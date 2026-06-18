# Design — Reviews + guest ratings (#28)

**Status:** approved 2026-06-18 · **Branch:** `feat/28-reviews-ratings` · **Closes:** #28

## Goal

The post-stay trust loop (PRODUCT_FLOWS §3.4): after a stay COMPLETES, the guest reviews the
listing/host (overall + 4 sub-scores + text + photos) and the host rates the guest (1–5). Reviews are
"load-bearing for trust" (§5.5) — the public signal that replaces FB-direct booking. The last M3 slice.

## Decisions (2026-06-18)

- **Include** review **photos** (R2 public bucket) and **admin moderation + flagging**.
- **Defer** the proactive review-request LINE nudges (COMPLETED+1d / +7d) to a follow-up.
- **Denormalize** `avgRating` + `reviewCount` onto `Listing`, maintained in the review write tx.
- **Not double-blind** — reviews publish as written. Host public replies = v2.

## Reuse (already built — verified)

- Schema complete (#19): `Review` (bookingId @unique, overall + 4 sub-scores, text?, photoKeys[],
  removedBy/At/Reason, `Report[]`), `GuestRating` (bookingId @unique, score 1–5, reason?,
  `@@index([guestRateeId])`), `Report` (multi-target FK incl. reviewId, CHECK num_nonnulls=1) — all
  three currently have zero code.
- R2: `src/lib/storage/r2.ts` (`presignPut`/`publicUrl`), `src/lib/listing/upload.ts`
  (`presignPhotoUpload` validation), `addPhotoAction` upload flow, `ListingGallery` render.
- `src/lib/booking/transitions.ts` (`complete` → COMPLETED, `daysUntil`); `lib/notifications`
  (`notify` + `templates.ts`); `lib/admin` (`requireAdmin` + AuditLog seam); the admin console nav
  (`admin/(console)/layout.tsx`); the grep-gate pattern (`scripts/check-status-writes.mjs`).
- Listing-detail review shell + `sectionReviews`/`reviewsEmpty` i18n; `lib/listing/queries.ts`
  `rating`/`reviewCount`/`avgRating` stubs awaiting real values.

## Architecture

### A. `lib/reviews/` — sole writer of Review + GuestRating (+ the Listing aggregate)
`reviews.ts` (`canReview` gate: COMPLETED + author = guest + ≤14 days + not already reviewed;
`submitReview` one-tx create + aggregate recompute, notify host after; `removeReview` admin soft-delete
+ recompute + AuditLog; `loadListingReviews` published-only + summary). `ratings.ts` (`canRateGuest`,
`rateGuest`, `loadGuestRatingSummary`). `upload.ts` (`presignReviewPhotoUpload`, key
`reviews/{bookingId}/{uuid}.{ext}`, public bucket). `flag.ts` (`flagReview` → reviewId-scoped Report).
New `scripts/check-review-writes.mjs` + `gate:reviews` + CI.

### B. Schema (additive — DATA_MODEL.md first)
`Listing.avgRating Float?` + `Listing.reviewCount Int @default(0)`. Nothing else.

### C. UI
- `src/components/ui/StarRating.tsx` (readonly + interactive, `gold-400`) + styleguide entry.
- Guest review: `/trips/[bookingId]/review` (form + photo upload) + TripCard COMPLETED CTA.
- Host: rate-guest control on the `(host)/bookings` COMPLETED section; guest-rating summary on the
  `(host)/requests` inbox row (§4.2 accept-confidence).
- Listing detail: fill the review section (summary bars + cards + ผู้เข้าพักจริง ✓ + photos) + title
  aggregate; wire `searchListings`/`getListingDetail`/`getHostOverview` to the new columns.

### D. Moderation (admin, review-scoped)
Flag a review → Report(reviewId, RECEIVED). Admin queue `/admin/reviews` → keep (DISMISSED) / remove
(RESOLVED + `removeReview` soft-delete + AuditLog). Console nav entry. Removed reviews hidden +
excluded from the aggregate.

### E. Notifications
`REVIEW_RECEIVED_HOST` (priority), fired in `submitReview`.

## Out of scope (note in PR)

- Review-request LINE nudges (+1d/+7d) → follow-up.
- General reports/disputes system → **#27**; #28 is the first `Report` writer, scoped to review flags.
- Host public replies (v2); guest-rating range DB CHECK (app-enforced).

## Verification

- **Unit:** `canReview`/`canRateGuest` gates; `submitReview` aggregate recompute + 1–5 validation;
  `removeReview` recompute + soft-delete + audit; `loadListingReviews` excludes removed;
  `loadGuestRatingSummary`; `flagReview`; `REVIEW_RECEIVED_HOST`.
- **Gate:** `gate:reviews` green. **Build/manual:** end-to-end review → listing display + aggregate;
  host rates guest → requests row; flag → admin queue → remove → disappears.
