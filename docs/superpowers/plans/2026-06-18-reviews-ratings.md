# #28 — Reviews + guest ratings

## Context

#28 is the **last M3 slice** (Aok's lane) and the trust payoff of the whole escrow story: once a stay completes, the guest reviews the listing/host and the host rates the guest. Reviews are "load-bearing for trust" (PRODUCT_FLOWS §5.5) — the public signal that distinguishes U-Rest from the FB-direct booking it replaces.

The schema is **already done** (#19): `Review` (bookingId @unique, overall + 4 sub-scores, text?, photoKeys[], soft-removal fields, `Report[]` back-relation), `GuestRating` (bookingId @unique, score 1–5, reason?, `@@index([guestRateeId])`), and `Report` (multi-target FK incl. reviewId, CHECK num_nonnulls=1). All three currently have **zero code**. The listing detail page has a review shell + `sectionReviews`/`reviewsEmpty` i18n, and `lib/listing/queries.ts` carries `rating`/`reviewCount`/`avgRating` stubs (null/0) waiting to be filled. So #28 builds the reviews domain, the capture UIs, the display + aggregate wiring, and a review-moderation slice.

**Decisions locked (this session):** include review **photos** (R2 public bucket) and **admin moderation + flagging**; **defer** the proactive review-request LINE nudges (+1d/+7d sweep) to a follow-up; **denormalize** `avgRating`/`reviewCount` onto `Listing` (maintained in the review write tx) so search cards/detail/dashboard read trivially. Not double-blind — reviews publish as written (PRODUCT_FLOWS §3.4). Host public replies = v2.

Branch: `feat/28-reviews-ratings`. Closes #28.

## Scope

**In:**
- Guest → listing review: overall + 4 sub-scores (ความสะอาด/ตรงตามรูป/การติดต่อโฮสต์/ความคุ้มค่า) + optional text + optional **photos**. Window = COMPLETED + 14 days, one per booking, author = the booking's guest. No edits after publish.
- Host → guest rating: 1–5 + optional reason, after COMPLETED, one per booking, rater = the listing's host.
- Listing-detail review display (summary bars + cards + ผู้เข้าพักจริง ✓ verified badge + photo thumbnails) + the listing-title aggregate (★ rating · count).
- Aggregate denormalized on `Listing` → wired into search cards, listing detail, host dashboard `avgRating`.
- Guest-rating summary on the host **request inbox** row (§4.2 accept-confidence) + the host completed-bookings rating entry.
- Review **moderation**: any user can flag a review → a `Report` row (reviewId-scoped); a review-only admin queue keeps (DISMISSED) or removes (soft-delete + AuditLog). Removed reviews are hidden everywhere and excluded from the aggregate.

**Out / deferred (note in PR):**
- Review-request LINE nudges (COMPLETED+1d, +7d reminder) → follow-up issue; needs a daily sweep + a Booking dedup marker.
- The general reports/disputes system (booking/listing/user reports, dispute admin) = **#27 (poom's lane)**. #28 writes only **reviewId-scoped** `Report` rows + a review-only admin queue; #27 generalizes the queue later. (Coordination note: `Report` is a shared additive table; #28 is its first writer, scoped to review flags.)
- Host public replies to reviews (PRODUCT_FLOWS §7 = v2).
- Guest-rating range CHECK (enforced in app; no DB CHECK exists).

## Schema (additive — DATA_MODEL.md first, then migration)

Only change: denormalized aggregate on `Listing`.
```prisma
model Listing {
  // …
  avgRating   Float?  // null until the first published review
  reviewCount Int     @default(0)
}
```
Maintained inside the `lib/reviews` write transaction (recomputed on publish + on removal). `Review`/`GuestRating`/`Report` + `photoKeys[]` already exist — no other schema change.

## Architecture

### `src/lib/reviews/` — the sole writer of Review + GuestRating (+ the Listing aggregate)
Mirrors the `lib/<domain>` convention (`lib/messaging`, `lib/booking`) with a grep gate.
- `reviews.ts`:
  - `canReview(bookingId, userId, now)` → gate: booking COMPLETED, `userId === booking.userId`, within 14 days of checkout, no existing Review. Typed failure reason.
  - `submitReview(input, now)` — guard via canReview; **one tx**: `review.create` (overall + 4 sub-scores 1–5 validated, text?, photoKeys?) → recompute `Listing.avgRating`/`reviewCount` from non-removed reviews for that listing → `notify(hostId, "REVIEW_RECEIVED_HOST", …)` after the tx.
  - `removeReview(admin, reviewId, reason)` — admin soft-delete (`removedByAdminId`/`removedAt`/`removedReason`) + recompute aggregate, in one tx (+ AuditLog via the lib/admin seam).
  - `loadListingReviews(listingId)` → published (removedAt null) reviews (author displayName/image, scores, text, photo `publicUrl`s, createdAt, verified flag) + `{ avgRating, reviewCount, subScoreAverages }` for the summary bars.
- `ratings.ts`:
  - `canRateGuest(bookingId, hostId, now)` → booking COMPLETED, `hostId === booking.listing.hostId`, no existing GuestRating.
  - `rateGuest(input)` — guard; `guestRating.create` (score 1–5 validated, reason?).
  - `loadGuestRatingSummary(guestUserId)` → `{ avgScore, count }` over `GuestRating` (uses `@@index([guestRateeId])`).
- `upload.ts`: `presignReviewPhotoUpload({ bookingId, contentType, contentLength }, userId)` — reuse `presignPut`(public bucket) + the `lib/listing/upload.ts` validation (jpeg/png/webp ≤10 MB); key `reviews/{bookingId}/{uuid}.{ext}` (bookingId known pre-submit, 1:1 with the review → no chicken-egg). Read side = `publicUrl(key)`.
- `flag.ts`: `flagReview(reporterId | null, reviewId, category, text)` — creates a `Report` (reviewId target, RECEIVED). The only `Report` writer in #28.
- `scripts/check-review-writes.mjs` + `gate:reviews` + CI step (mirror `check-status-writes.mjs`): forbid `prisma.review.*`/`prisma.guestRating.create`/the review-flag `Report` write outside `src/lib/reviews`.

### UI component
- `src/components/ui/StarRating.tsx` — readonly (display avg, fractional) + interactive (form input) modes, `gold-400` token. Add a `/styleguide` entry.

### Guest review capture
- Route `src/app/[locale]/(protected)/trips/[bookingId]/review/{page,review-form,actions}.tsx`: `page` guards `requireUser` + `canReview`; `review-form` (client, `useTransition`) = StarRating overall + 4 sub-scores + Textarea + photo uploader (reuse `addPhotoAction` flow: presign → client PUT → collect r2Keys) + submit → `submitReviewAction` → redirect to listing. Errors via the `ActionResult<T>` pattern.
- `trips/trip-card.tsx`: for `COMPLETED`, add a "⭐ เขียนรีวิว" CTA → `/trips/{id}/review`, or "★ รีวิวแล้ว" if `hasReview`. Trips page query adds the `review`/`guestRating` 1:1 existence flags (verify Booking back-relation names).

### Host rate-guest + guest-rating display
- `(protected)/(host)/bookings/page.tsx`: add a COMPLETED section; each row gets a rate-guest control (StarRating input + optional reason) → `rateGuestAction`, or "ให้คะแนนแล้ว" once rated.
- `(protected)/(host)/requests/page.tsx`: fetch `loadGuestRatingSummary(guest.userId)` per request row → render "★ 4.6 · N stays" (accept-confidence). Empty state for new guests.

### Listing display + aggregate wiring
- `listings/[id]/page.tsx`: replace the review shell with summary bars (overall + 4 sub-score averages) + review cards (author, date, scores, text, photo thumbnails, ผู้เข้าพักจริง ✓) + the title-block aggregate; wire the existing **report link** (258–262) to a flag action.
- `lib/listing/queries.ts`: `searchListings` → read the new `avgRating`/`reviewCount` columns (replace the `null`/`0` stubs, lines 88–89); `getListingDetail` → load reviews + summary; `getHostOverview` → real `avgRating` (line 234).

### Moderation (admin, review-scoped)
- Flag: the listing-page report link + a flag control on review cards → `flagReviewAction` → `flagReview` (Report reviewId, RECEIVED).
- Admin queue `src/app/[locale]/admin/(console)/reviews/{page,actions}.tsx`: list flagged reviews (`Report` where `reviewId` not null, status RECEIVED/IN_REVIEW), show the review + reason; **keep** (Report→DISMISSED) or **remove** (Report→RESOLVED + `removeReview` soft-delete + AuditLog). Each action `requireAdmin`. Add a "รีวิว" entry to the console nav (added in #25's layout).

### Notifications
- One template: `REVIEW_RECEIVED_HOST` (priority) — fired in `submitReview` after the tx. (Proactive review-request nudges deferred.)

### i18n
- Append `Reviews.*` (form labels, sub-score names, CTA, verified badge, empty), `GuestRating.*`, `Admin.Reviews.*`, and `Admin.nav.reviews` to **both** `messages/th.json` + `messages/en.json` (th source).

## Build sequence (TDD; red→green→commit per task)

1. **Schema** — DATA_MODEL.md `Listing` row → `schema.prisma` (`avgRating`/`reviewCount`) → migration (`pnpm db:migrate`; offline `prisma migrate diff` if Docker down).
2. **`lib/reviews` core** — `canReview` + `submitReview` (+ aggregate recompute) with unit tests (window/author/dup gates; aggregate math; sub-score validation). Then `loadListingReviews` + summary.
3. **`lib/reviews` ratings** — `canRateGuest` + `rateGuest` + `loadGuestRatingSummary` + tests.
4. **`gate:reviews`** script + CI wiring (green: only `lib/reviews` writes the tables).
5. **StarRating component** + styleguide entry.
6. **Guest review route + form + photo upload** + TripCard CTA + trips-query review flag.
7. **Host rate-guest** (bookings COMPLETED section) + **guest-rating on requests row**.
8. **Listing display + aggregate wiring** (detail review section + title rating; searchListings/getHostOverview columns).
9. **Moderation** — `flagReview` + flag UI; `removeReview` + admin `/admin/reviews` queue + nav; `REVIEW_RECEIVED_HOST` template.
10. **Full gate + Explore review + PR** (`Closes #28`, labels `area:booking` + `area:admin`, milestone M3).

> If the branch grows too large, task group 9 (moderation) can split into a second PR under #28 — surface this at PR time.

## Critical files

- Reuse: `src/lib/storage/r2.ts` (`presignPut`/`publicUrl`), `src/lib/listing/upload.ts` (`presignPhotoUpload` validation), `(host)/listings/new/actions.ts` `addPhotoAction` (upload flow), `src/components/ui/ListingGallery.tsx` (photo render), `src/lib/notifications` (`notify`+`templates.ts` `str()`/`satang()`), `src/lib/booking/transitions.ts` (`complete`/`daysUntil`), `src/lib/admin/auth.ts` (`requireAdmin`+AuditLog seam, as in `lib/admin/payout.ts`), the admin console nav (`admin/(console)/layout.tsx`), `scripts/check-status-writes.mjs` (gate pattern), `trips/[bookingId]/cancel-button.tsx` (`useTransition` form), `listings/[id]/instant/actions.ts` (`ActionResult<T>`).
- New: `src/lib/reviews/{reviews,ratings,upload,flag}.ts` (+ tests), `scripts/check-review-writes.mjs`, `src/components/ui/StarRating.tsx`, `trips/[bookingId]/review/{page,review-form,actions}.tsx`, `admin/(console)/reviews/{page,actions}.tsx`.
- Edit: `prisma/schema.prisma` + `docs/DATA_MODEL.md`, `lib/listing/queries.ts`, `trips/trip-card.tsx` + trips page, `(host)/{bookings,requests}/page.tsx` (+ actions), `listings/[id]/page.tsx`, `lib/notifications/templates.ts`, `messages/{th,en}.json`, `package.json` + `.github/workflows/ci.yml` (gate:reviews), `admin/(console)/layout.tsx` (nav).

## Verification

- **Unit (Vitest):** `canReview`/`canRateGuest` gates (COMPLETED-only, author/host identity, 14-day window, duplicate rejection); `submitReview` recomputes `Listing.avgRating`/`reviewCount` over non-removed reviews + validates 1–5 scores; `removeReview` recomputes + soft-deletes + audits; `loadListingReviews` excludes removed; `loadGuestRatingSummary` math; `flagReview` creates a reviewId Report; `REVIEW_RECEIVED_HOST` template.
- **Gate:** `pnpm gate:reviews` green (review/rating writes only in `lib/reviews`); `gate:status`/`gate:bodyraw` unaffected.
- **Build/manual:** `pnpm build` lists the review route + `/admin/reviews`. End-to-end on a COMPLETED booking: guest submits a review (with a photo) → renders on the listing detail with the verified badge and the listing aggregate (★ + count) updates on the card + dashboard; host rates the guest → score shows on the host's request inbox for that guest; flag a review → appears in the admin queue → remove → disappears from the listing and the aggregate drops.
- Full PR gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status && pnpm gate:bodyraw && pnpm gate:reviews && pnpm build`.
