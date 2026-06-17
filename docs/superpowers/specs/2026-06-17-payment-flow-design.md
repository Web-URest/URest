# Design — Request-to-book payment half (#21, the #21b slice)

**Status:** approved 2026-06-17 · **Branch:** `feat/21-payment-flow` · **Closes:** #21 (completes the end-to-end flow; the request half shipped in #65/PR #66)

## Goal

Complete PRODUCT_FLOWS §3.2 from `AWAITING_PAYMENT` onward: the guest pays (PromptPay QR
**or** card), an Opn webhook drives the booking to `CONFIRMED` (escrow `HELD`, code minted,
contact unmasked — already built in #20), and the §6 notification matrix fires. Plus the
`AWAITING_PAYMENT → EXPIRED` host notice and the "payment 2h left" guest reminder.

## What already exists (do not rebuild — verified 2026-06-17)

- `accept()` moves `REQUESTED → AWAITING_PAYMENT` and sets `payBy = now + 12h`.
- `createChargeForBooking(bookingId, method, { cardToken? })` (`lib/payments/charge.ts`) — guards
  `AWAITING_PAYMENT`, creates the Opn charge (PromptPay or card), writes a `PENDING` `Payment` row.
- Opn client (`lib/payments/opn.ts`): `createPromptPayCharge`, `createCardCharge`, `retrieveCharge`.
- `applyChargeEvent()` + webhook route (`/api/webhooks/opn`): re-fetches the charge (verification),
  delegates a successful charge to `confirmFromWebhook` → `CONFIRMED` + code + `contactUnmaskedAt` +
  ledger `NONE→HELD` (`CHARGE_WEBHOOK`), all in one transaction, idempotent on the Opn event id.
- `sweepOverduePayments(now)` already expires `AWAITING_PAYMENT` bookings past `payBy` (both modes).
- `maskedContact()` + the trip page already display real contact once `contactUnmaskedAt` is set (#65).
- Schema: `Payment` (`opnChargeId`, `method`, `amountSatang`, `status`, `qrExpiresAt`), `WebhookEvent`,
  `LedgerEntry`, `Booking.code`/`contactUnmaskedAt`/`payBy`/`escrowState`.

## What this slice builds

### A. Guest payment screen — `src/app/[locale]/(protected)/trips/[bookingId]/pay/`

`page.tsx` (server): `requireUser`, then load the booking; if not owned or
`status !== AWAITING_PAYMENT` → `redirect({ href: "/trips/[id]" })` (a confirmed/expired booking has
nothing to pay). Render the §3.2 shell:

- **Coral countdown banner** to `payBy` (client ticker; static server fallback of the deadline).
- **Escrow strip** + the *"ไม่ตรงตามประกาศ แจ้งก่อนเช็คเอาท์ คืนเงินเต็มจำนวน"* promise (token classes only).
- **Tabs** — PromptPay (default) + card. Tab state is client-local.

The screen passes `OPN_PUBLIC_KEY` to the card tab as a prop (publishable key — safe in the client;
no `NEXT_PUBLIC_` env change needed).

**Server actions** (`pay/actions.ts`), all ladder-gated (`requireUser` + `booking.userId === me` +
`AWAITING_PAYMENT`, mapping `PaymentError`/`BookingError` → i18n error keys):

- `getPromptPayCharge(bookingId, { regenerate? })` → `{ ok, qrUrl, qrExpiresAt }`. Reuse: if a
  `PENDING` PromptPay `Payment` with `qrExpiresAt > now` exists, `retrieveCharge` it and return its
  QR; else (or `regenerate`) `createChargeForBooking(id, PROMPTPAY)`. Regenerate never touches `payBy`
  (15-min QR vs 12h window — PRODUCT_FLOWS §3.2).
- `payWithCard(bookingId, token)` → `createChargeForBooking(id, CARD, { cardToken, returnUri })`. If
  the charge has an `authorize_uri` (3DS) → `{ ok, authorizeUri }` (client redirects the browser
  there); else `{ ok }` (immediate — the webhook + poll handle confirmation). `returnUri` is the
  absolute pay-page URL; Opn redirects back there after 3DS, the poll then sees `CONFIRMED`.
- `getBookingPaymentStatus(bookingId)` → `{ status }` for polling.

**Client components:** `promptpay-tab.tsx` (calls `getPromptPayCharge` on mount, renders the QR
`<img>`, "regenerate" button when expired), `card-tab.tsx` (loads `omise.js` via `next/script`,
`Omise.setPublicKey` + `createToken`, submits token to `payWithCard`, redirects on `authorizeUri`),
and `payment-poller.tsx` (polls `getBookingPaymentStatus` every ~4s while open; on `CONFIRMED` →
`router.push("/trips/[id]")`; stops at `payBy`). Branching decisions (status→action, charge→render)
are extracted into pure helpers so they are node-unit-testable without RTL (not set up in this repo).

The AWAITING_PAYMENT **trip view** gains a primary **"ชำระเงินเลย"** `Link` → `/trips/[id]/pay`
(§3.2 status table); withdraw stays as the secondary action.

### B. Opn client / charge changes (card 3DS)

- `OpnCharge` gains `authorize_uri?: string | null`.
- `createCardCharge` accepts `returnUri` → sends `return_uri`; `createChargeForBooking`'s `opts`
  gains `returnUri?` and threads it through. PromptPay path unchanged.

### C. Notification idempotency fix (hard rule 6)

`confirmFromWebhook` returns `{ booking, freshlyConfirmed }` (additive). `freshlyConfirmed` is true
only when the event was newly claimed AND the booking actually transitioned; a replayed event
returns `freshlyConfirmed: false`. `applyChargeEvent` fires the payment-received notifications **only
when `freshlyConfirmed`**, so a redelivered webhook does not double-notify. (Ledger/code were already
replay-safe; this closes the notification gap.) Callers/tests updated for the new return shape.

### D. Notifications — 4 templates + triggers (§6 matrix)

New keys in `lib/notifications/templates.ts` (th source + en, append-only):

| Key | Audience | Channels | Body gist | Params |
|---|---|---|---|---|
| `PAYMENT_RECEIVED_GUEST` | Guest | LINE+email, priority | receipt + booking code | `listingTitle`, `code`, `bookingId` |
| `PAYMENT_RECEIVED_HOST` | Host | LINE+email, priority | prep notice + booking code | `listingTitle`, `code`, `bookingId` |
| `PAYMENT_EXPIRED_HOST` | Host | LINE, priority | dates released, relist | `listingTitle`, `bookingId` |
| `PAYMENT_REMINDER_GUEST` | Guest | LINE, priority | 2h left to pay | `listingTitle`, `bookingId` |

Triggers:

- **Payment received (G+H):** in `applyChargeEvent`, after a `freshlyConfirmed` confirm, `notify`
  guest (`PAYMENT_RECEIVED_GUEST`) and host (`PAYMENT_RECEIVED_HOST`). Loads `userId`, listing
  `hostId`/`title`, and `code` from the confirmed booking.
- **Payment expired (H, request mode only):** in `sweepOverduePayments`, after `expire()` succeeds,
  if `bookingMode === REQUEST` → `notify` host `PAYMENT_EXPIRED_HOST`. (Instant hosts never saw the
  request — §3.2 / line 68.) Extend the sweep's `select` to carry `bookingMode` + listing
  `hostId`/`title`; per-row try/catch isolation like `sweepOverdueRequests`.
- **Payment 2h-left (G):** new `sweepPaymentReminders(now)` — selects `AWAITING_PAYMENT` where
  `payBy > now AND payBy <= now + 2h AND payReminderSentAt IS NULL`; per row, **CAS-claim**
  `updateMany({ where: { id, payReminderSentAt: null }, data: { payReminderSentAt: now } })` (skip if
  count 0 — concurrent-sweep safe, like the retry sweep), then `notify` guest `PAYMENT_REMINDER_GUEST`.
  Wired into the scheduler's `runSweeps`.

### E. Schema (additive — shared-file protocol)

`Booking.payReminderSentAt DateTime?` — once-only dedupe for the 2h reminder. Update
`docs/DATA_MODEL.md` first, then `schema.prisma` + a migration; Aok integrates.

## Data flow (happy path)

1. Host accepts (#65) → `AWAITING_PAYMENT`, `payBy = +12h`, `REQUEST_ACCEPTED` to guest.
2. Guest opens `/trips/[id]` → "ชำระเงินเลย" → `/trips/[id]/pay`.
3. Pay screen: countdown + PromptPay QR (reuse-or-create) / card tab. Poller running.
4. Guest pays → Opn webhook → `applyChargeEvent` → `confirmFromWebhook` (CONFIRMED, code, unmask,
   escrow HELD) → notify G+H (fresh only).
5. Poller sees `CONFIRMED` → redirect to `/trips/[id]` (now ยืนยันแล้ว, unmasked contact, code).
6. No pay: `sweepPaymentReminders` nudges guest at T-2h; at `payBy`, `sweepOverduePayments` → EXPIRED
   + notify host (request mode).

## Error handling

- Pay page guards → redirect to `/trips/[id]` on wrong owner/state.
- Actions map `PaymentError` (`NOT_AWAITING_PAYMENT`, `BOOKING_NOT_FOUND`, `CARD_TOKEN_REQUIRED`) and
  `BookingError` to friendly i18n keys; Opn `OpnError` → a generic "try again / switch method" key.
- QR expired → regenerate (fresh charge), `payBy` unchanged.
- Card 3DS → redirect to `authorize_uri`; return to the pay page; webhook + poll finish it.
- Poller stops at `payBy` or on redirect.

## Testing

- **Vitest units:** `getPromptPayCharge` (reuse valid PENDING / create when none-or-expired /
  regenerate forces new / ownership + state guards), `payWithCard` (3DS `authorizeUri` returned /
  guards), `getBookingPaymentStatus` (status + guard), `applyChargeEvent` (notifies G+H on fresh
  confirm, **does not** notify on replay), `confirmFromWebhook` `freshlyConfirmed` flag,
  `sweepOverduePayments` (host notified on request-mode expiry, **not** on instant, per-row
  isolation), `sweepPaymentReminders` (fires once / skips already-reminded / skips outside window),
  the 4 templates, and the extracted pure client-decision helpers.
- **RTL:** not set up in this repo; client components kept thin (logic in actions/helpers). No RTL
  infra added here.
- **E2E:** the full request→accept→pay(sandbox)→CONFIRMED money-path Playwright suite is **issue #29**,
  not this slice. The sandbox round-trip is already validated via `pnpm opn:spike` (#20).

## Out of scope (explicit)

- The money-path Playwright suite (#29).
- Messaging / contact-masked chat (#24), trips tabs / cancellation refunds (#23) — referenced flows,
  separate issues.
