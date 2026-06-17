# Design — request creation + host accept/decline (#21 request-half) · issue #65

**Status:** approved (2026-06-17) · **Branch:** `feat/65-request-flow` · **Phase:** 3
**Authority:** `PRODUCT_FLOWS.md` §3.2 (request mode, steps 1–2), §2.1 (state machine), ADR-011
(snapshot), CLAUDE.md rules. Request-half of #21 (split at the money boundary; payment-half = #21b).

## Problem
The booking domain (state machine, pricing, payments, cron, notifications) is all built and merged,
but nothing lets a guest actually *send* a request or a host respond. This slice wires the pre-payment
flow: a logged-in + phone-verified guest sends a request (with an intro note) against a PUBLISHED
REQUEST-mode listing → host accepts/declines within 12h → AWAITING_PAYMENT (handed to #21b) or
DECLINED. No money moves. Expiry is swept by the existing cron; every transition notifies.

## Decisions
- **Dedicated routes** (not modals) for the multi-step flow — server-component-friendly, deep-linkable
  from notifications.
- **Reuse, don't rebuild:** `request`/`accept`/`decline`/`cancelByGuest` (lib/booking), `buildQuote`
  (snapshot), `requirePhoneVerified` (auth ladder), `notify` (lib/notifications), `BookingCard` +
  `PriceBreakdown` (UI), the cron `sweepOverdueRequests`. The `ActionResult` server-action pattern.
- Guest booking-status view is **minimal** here — #23 owns the full trips redesign.

## Schema (additive migration — DATA_MODEL.md first; @AokDesu integrates)
`Booking.guestNoteToHost String?` — the §3.2 step-1 free-text intro to host (raises acceptance rate).

## Server actions (`ActionResult<T> = {ok:true}&T | {ok:false,error}`; errors → i18n keys)
- `createBookingRequest({ listingId, checkIn, checkOut, guests, note })`:
  `requirePhoneVerified()` → load listing (pricing config, seasons, holidays, houseRulesText, hostId,
  status, bookingMode) → assert PUBLISHED + REQUEST → `buildQuote(...)` → assemble `BookingDraft`
  { listingId, userId, checkIn, checkOut, priceLines, totalSatang, commissionSatang, cancellationTier,
  houseRulesText, guestNoteToHost: note } → `request(draft, now)` → `notify(hostId, "BOOKING_REQUESTED", …)`
  → `{ bookingId }`. The double-booking GiST exclusion → caught → `errorDatesTaken`.
- `acceptRequest(bookingId)` — host action: `accept(bookingId, hostId, now)` → `notify(guestId, "REQUEST_ACCEPTED", …)`.
- `declineRequest(bookingId)` — host action: `decline(bookingId, hostId)` → `notify(guestId, "REQUEST_DECLINED", …)`.
- `withdrawRequest(bookingId)` — guest: `cancelByGuest(bookingId, userId, now)` (pre-payment withdrawal).

## Routes / screens
- **`/[locale]/listings/[id]/request`** (guest) — server component loads the listing + recomputes the
  quote from `?checkIn&checkOut&guests` query params (passed by `BookingCard`); a client form shows the
  trip summary + `PriceBreakdown`, a `guestNoteToHost` textarea, a house-rules acceptance checkbox, and
  the "ส่งคำขอจอง" submit → `createBookingRequest` → `redirect("/trips/{bookingId}")`.
- **`/[locale]/(protected)/trips/[bookingId]`** (guest, minimal) — booking status (`StatusPill`),
  12h host-response countdown (`respondBy`), masked host contact, withdraw button. (#21b adds the
  payment step to this page when AWAITING_PAYMENT.)
- **`/[locale]/(protected)/(host)/requests`** (host inbox) — REQUESTED bookings for the host's
  listings: guest note, dates, quote total, masked guest contact, `respondBy` countdown, accept/decline.
  Enable the `requests` tab in `host-nav.tsx` (currently in SOON_TABS).
- Wire `BookingCard`'s request CTA → `Link`/`useRouter` to `/listings/[id]/request?checkIn=…&checkOut=…&guests=…`.

## Contact masking
`src/lib/booking/contact.ts` — `maskedContact(booking, { email, phone })`: returns real contact only
when `booking.contactUnmaskedAt != null`, else a masked placeholder. Used by the host inbox + guest
status. Always masked in #21a (unmask happens at CONFIRMED, #21b).

## Notifications
New templates `REQUEST_ACCEPTED` (priority — leads to payment) + `REQUEST_DECLINED`; `BOOKING_REQUESTED`
exists. Wired via `notify()` in the actions. Request-expiry: `sweepOverdueRequests` (lib/booking/sweeps.ts)
notifies the guest (`REQUEST_EXPIRED`) after `expire()` — the single cron↔notify touch (payment-window
expiry is #21b). Payloads carry listing title + booking code/dates.

## Error handling
Actions return `{ok:false,error}` with i18n keys: `errorUnauthenticated`/`errorPhoneUnverified` (ladder,
→ redirect to sign-in / verify-phone), `errorDatesTaken` (exclusion constraint), `errorNotOwner`/
`errorWrongState` (host actions on a non-owned/non-REQUESTED booking, from `BookingError`).

## Testing (Vitest; mock prisma + lib/booking + lib/notifications + buildQuote)
- `createBookingRequest`: ladder enforced; rejects non-PUBLISHED / non-REQUEST; assembles the draft from
  the quote (priceLines/totalSatang/commission/tier/note); calls `request` + `notify(host, BOOKING_REQUESTED)`;
  maps the exclusion error to `errorDatesTaken`.
- `acceptRequest`/`declineRequest`: ownership enforced; calls the transition + the right guest notification.
- `withdrawRequest`: calls `cancelByGuest`.
- `maskedContact`: masks when `contactUnmaskedAt` null, reveals when set.
- new templates render (email + line) from a payload.
- `sweepOverdueRequests` notifies the guest on expiry.
Component tests only where logic lives (RTL) per CLAUDE.md; money-path E2E is #29.

## Out of scope (#21b / others)
Payment screen + PromptPay QR + card + escrow strip + CONFIRMED + contact unmask + payment-received
notification + payment-window-expiry notification (#21b); full trips tabs (#23); messaging (#24).
