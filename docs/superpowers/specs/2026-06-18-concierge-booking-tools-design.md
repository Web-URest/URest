# Design — Concierge booking tools + confirmation gate + QR-in-chat (#32)

**Status:** approved 2026-06-18 · **Branch:** `feat/32-concierge-booking-tools` · **Closes:** #32

## Goal

AI_CONCIERGE_SPEC §3: น้องเรสต์ can take a guest from chat to a real booking inside the thread —
`create_booking_draft` renders an in-chat confirmation card; the guest's TAP mints a single-use
10-minute token (server-side, **invisible to the model**); `submit_booking_request` creates the
REQUESTED booking; and the SERVER (never the model) attaches the PromptPay QR at AWAITING_PAYMENT.
"AI จองให้ คุณแค่สแกนจ่าย." Closes DESIGN_SPEC §9 B7. Blocks #33 (eval harness).

## Reuse (already built — verified)

- **Tool framework** (#31, PR #60): `src/lib/concierge/tools.ts` `CONCIERGE_TOOLS` (Anthropic strict-tool
  schemas — the two booking-tool schemas already exist as stubs returning "not ready") + `handleToolCall`
  dispatcher; the model loop + SSE in `src/app/api/concierge/chat/route.ts` (claude-haiku-4-5, ≤5 tool
  iterations); closed-world grounding + cost gates (won't block booking).
- **Booking machinery (plain-args, tool-callable):** `lib/booking/transitions.ts#request(draft, now)`
  → REQUESTED + host notify, and `#instantHold(...)` → AWAITING_PAYMENT; `lib/pricing/quote.ts#buildQuote`
  (the snapshot); `lib/payments/opn.ts#createPromptPayCharge` → QR `download_uri`; the pay screen
  `/trips/[bookingId]/pay` (#67) for request-mode payment; `requirePhoneVerified` guard.
- **Availability check:** mirror `checkAvailabilityHandler` (calendar block + double-booking overlap).
- ConciergeMessage is text-only today (toolCalls Json unused); the chat UI (`ConciergeChat.tsx` +
  `ChatBubble`) renders text bubbles via SSE — no rich-card path yet.

## Decisions (2026-06-18)

- **QR delivery:** instant-book listings (submit → AWAITING_PAYMENT immediately) get the QR card
  **in-chat**; request-book listings (submit → REQUESTED, payment unlocks on host-accept later) get a
  post-submit card that **deep-links to `/trips/[id]/pay`**. No cross-session re-posting; no Booking↔
  session link; no change to the shared `lib/booking` accept path.
- **Token is server-side only.** AC#4 ("model never sees tokens") ⇒ the token is NOT a model-filled
  argument. The model calls `submit_booking_request(draft_id)`; the server validates a token it minted
  on the tap. The model passes only `draft_id`; if it calls submit before any tap, no valid token →
  tool error. (Eval #33 drives expired/reused/missing-token failures via server token state.)
- **Model-orchestrated submit** (not server-driven on tap), so the real path and the eval path both go
  through the model calling `submit_booking_request` (spec/§6 alignment).
- **One additive table** for the draft; commission snapshot reuses `buildQuote` (10%).

## Architecture

### A. Data model (additive — DATA_MODEL.md first, then migration)
```prisma
model ConciergeBookingDraft {
  id                    String           @id @default(cuid()) // = draft_id given to the model
  sessionId             String
  userId                String
  listingId             String
  checkIn               DateTime         @db.Date
  checkOut              DateTime         @db.Date
  guests                Int
  // immutable quote snapshot (ADR-011 №3) — identical to the booking it creates
  priceLines            Json
  totalSatang           Int
  commissionSatang      Int
  cancellationTier      CancellationTier
  guestNoteToHost       String?
  createdAt             DateTime         @default(now())
  expiresAt             DateTime         // draft validity (e.g. +30m) — stale drafts can't submit
  // confirmation gate (set on the guest's tap; model never sees these)
  confirmedAt           DateTime?
  confirmTokenHash      String?          // sha-256 of the single-use token
  confirmTokenExpiresAt DateTime?        // confirmedAt + 10m
  consumedBookingId     String?          // set on successful submit → single-use

  session ConciergeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```
No other schema change. (ConciergeSession gets a `bookingDrafts` back-relation.)

### B. Tool handlers (`lib/concierge/tools.ts`, replacing the stubs)
- **Schema change to the stub:** `submit_booking_request` model-facing schema → `{ draft_id }` only
  (drop `confirmation_token`). `create_booking_draft` keeps `{ listing_id, check_in, check_out, guests,
  note_to_host? }`.
- `createBookingDraftHandler(input, userId)` — require logged-in user (else tool error → sign-in
  prompt); recompute the quote authoritatively via `buildQuote` (NEVER trust a model-supplied price);
  check availability (block/overlap) → unavailable ⇒ tool error; insert `ConciergeBookingDraft`;
  return to the model a compact summary (villa, dates, nights, total) **and** a UI card side-effect
  (`kind: "booking_draft"`, draftId + price lines for the confirm button).
- `submitBookingRequestHandler(input, userId)` — require logged-in + `requirePhoneVerified`; load the
  draft (must belong to userId, not expired, not consumed); **validate the confirmation token**
  (`confirmedAt` set, `confirmTokenExpiresAt > now`, hash present) → missing/expired ⇒ tool error
  ("waiting for the guest to tap confirm" / "confirmation expired, re-confirm"); branch on
  `listing.bookingMode`: REQUEST → `request(draft, now)`; INSTANT → `instantHold(...)`; set
  `consumedBookingId` (single-use). For INSTANT, create/reuse the PromptPay charge and return a
  **payment-QR card** side-effect; for REQUEST, return a **deep-link card** to `/trips/[id]/pay`. The
  model gets only `{ success, booking_code, mode }` — never the QR/token.

### C. Dispatch contract extension
`handleToolCall` returns `{ is_error, content, card? }` (was `{ is_error, content }`). The route passes
only `content` into the model's message history; when `card` is present it emits a new SSE event
`{ type: "card", card }` and persists a `ConciergeMessage` row for it (role `"card"`, payload in
`toolCalls` Json). QR URL + token never enter the model transcript (AC#4, verified by test + the eval).

### D. Confirm endpoint + chat UI
- `POST /api/concierge/confirm` `{ draftId }` — `requirePhoneVerified`; load draft (owned, not expired,
  not consumed); mint a random token, store `confirmTokenHash` + `confirmedAt=now` +
  `confirmTokenExpiresAt=now+10m`; return `{ ok }`. (The token itself is never returned to anything the
  model can read — it's purely the server's proof-of-tap.) After success the client re-invokes the chat
  with a benign system signal "[guest confirmed draft {id}]" (no token) so the model calls
  `submit_booking_request(draft_id)`.
- `BookingDraftCard` (confirm button → calls the confirm endpoint, then re-invokes chat) +
  `PaymentQrCard` (renders the QR image + a pay-screen link) client components; a `card` branch in
  `ConciergeChat.tsx`'s SSE parser; on reload, persisted `card` messages re-render.

### E. Error handling
- Double-booking race between draft and submit → the GiST exclusion fires inside `request`/`instantHold`
  → caught → tool error ("dates were just taken") → model re-drafts (the §6 "date race" case).
- Token missing/expired/reused → tool error. Phone unverified → tool error relayed in Thai. Anonymous →
  tool error prompting sign-in. None of these mutate state.

### F. Testing
- Vitest (`tools.test.ts` + new): `createBookingDraftHandler` computes the authoritative quote +
  rejects unavailable dates + requires login; `submitBookingRequestHandler` gates on token validity
  (missing/expired/consumed), phone, ownership, and branches REQUEST vs INSTANT; the confirm endpoint
  mints a single-use 10-min token. Assert the model-facing tool results never contain the token or QR
  URL (AC#4).
- The **#33 eval harness does not exist yet** — #32 makes the booking tools eval-ready (the §6 booking
  cases: happy path, token expiry/reuse, date race, sign-in/phone gates); the golden-set CI gate lands
  in #33.

## Out of scope (note in PR)

- Request-mode async in-chat QR (deep-link to `/trips/[id]/pay` instead — confirmed scope call).
- The golden eval harness + `pnpm eval:concierge` CI gate → **#33**.
- Any payment tool — forbidden by spec; payment is UI, the QR is a server-attached card.

## Verification

- **Unit:** the gates above; token single-use + 10-min expiry; quote authority; no token/QR in
  model-facing results. **Build:** the concierge route + confirm endpoint compile; `gate:status` green
  (booking creation only via `lib/booking`). **Manual:** in chat, draft a stay → confirmation card →
  tap → REQUESTED booking + host notified; an instant-mode listing → AWAITING_PAYMENT + QR card in
  chat; submit before tapping → friendly refusal; re-tap after 10 min → expired.
