# Design — Opn integration spike (test mode) · issue #20

**Status:** approved (2026-06-17) · **Branch:** `feat/20-opn-spike` · **Phase:** 3 (Booking & escrow)
**Authority:** this is a design record for the #20 spike. The binding contracts remain
`PRODUCT_FLOWS.md` §2.3/§3.2, `ADR-001` (payment gateway), `ADR-003` (escrow ledger),
`ADR-004` (in-process cron), and CLAUDE.md hard rules.

## Problem

#20 is the root of the M3 money path; #21/#22/#23/#25/#29 all depend on it. We need to prove, in
**test mode**, that U-Rest can charge a guest via Opn (PromptPay + card) and that a successful charge
deterministically drives the booking to `CONFIRMED` with escrow `HELD` — idempotently, per rule 6.

The booking/ledger foundation (#19, merged) already provides the atomic core:
`confirmFromWebhook(input, now)` (`src/lib/booking/transitions.ts`) claims the webhook event,
moves the booking `AWAITING_PAYMENT → CONFIRMED` (mints code, unmasks contact) and the escrow
`NONE → HELD`, all in one transaction, and is a no-op on replay. So #20 is a thin, mostly-greenfield
shell around it: an Opn client, a charge-creation path, and a webhook endpoint.

## Decisions

1. **Thin `fetch` client, no SDK.** A small `src/lib/payments/opn.ts` over Opn's REST API
   (`https://api.omise.co`, HTTP Basic auth). The surface we need is tiny (create source, create
   charge, retrieve charge); the `omise` npm package adds a dependency and weak types (friction with
   the no-`any` rule). Matches CLAUDE.md "boring over clever / no abstraction."
2. **Webhook verification = re-fetch, not signatures.** On every webhook we re-`GET` the charge by
   id with the secret key and trust *that* response, never the POST body. Omise/Opn webhooks aren't
   reliably signed; the documented approach is re-fetch (or IP allowlist). A spoofed POST re-fetches
   to nothing / non-successful and is ignored. No webhook-signing secret needed.
3. **Spike scope = lib + throwaway dev script.** No guest checkout UI (that's #21/#22). A
   `pnpm tsx` script seeds a booking and fires a real sandbox charge so Aok can watch the full
   round-trip.
4. **Don't modify #19.** `confirmFromWebhook` already is the rule-6 atomic unit; #20 calls it. The
   `Payment` row (sole-written by #20's charge module) is updated to its terminal status *just after*
   `confirmFromWebhook` commits — a crash between the two self-heals on Opn's retry. If strict
   `Payment`-in-the-same-tx atomicity is ever wanted, #21 (which owns `lib/booking`) can fold it in.

## Architecture

```
createChargeForBooking(bookingId, method)        scripts/opn-spike.ts (dev)
        │  asserts AWAITING_PAYMENT (read-only)          │
        │  Opn.createCharge(metadata.bookingId)          │
        ▼                                                ▼
   Payment(PENDING)  ◀───────────────────────────  (prints QR + ids)

Opn ──POST event──▶ /api/webhooks/opn ──▶ applyChargeEvent(eventId, chargeId, payload)
                                              │ Opn.retrieveCharge(chargeId)   ← verification
                                              │ status === "successful" ?
                                              │    ├─ confirmFromWebhook(...)  ← #19 atomic: claim event + CONFIRMED + HELD
                                              │    └─ Payment → SUCCESSFUL (idempotent)
                                              │ failed/expired → Payment → FAILED/EXPIRED (booking untouched)
                                              ▼
                                      200 / 400 / 500 (see below)
```

### Components
- **`src/lib/payments/opn.ts`** — `createPromptPaySource`, `createCharge`, `createCardCharge(token)`,
  `retrieveCharge(id)`; internal `opnRequest`. Amounts pass through as satang (Omise's THB minor
  unit == satang). Typed responses, no `any`.
- **`src/lib/payments/charge.ts`** — `createChargeForBooking(bookingId, method)` (sole writer of
  `Payment`), `applyChargeEvent(opnEventId, chargeId, payload)` (verify → branch).
- **`src/app/api/webhooks/opn/route.ts`** — POST: raw body, zod shape-check, dispatch, status map.
- **`scripts/opn-spike.ts`** — throwaway end-to-end trigger.

### Webhook responses
`200` handled / no-op / replay / irrelevant event key; `200` (swallow) for
`WRONG_STATE` / `NOT_FOUND` / not-our-charge so Opn doesn't retry forever; `400` malformed body;
`500` only on genuine infra error (so Opn *does* retry).

### Idempotency
Success replays no-op via `confirmFromWebhook`'s `claimWebhookEvent` (unique `opnEventId`); the
trailing `Payment` update is idempotent (terminal status); failure events are idempotent by
construction. Proven by a dedicated replay test.

## Config
Enable in `src/lib/env.ts` + `.env.example` (lockstep, rule 4): `OPN_PUBLIC_KEY` (`pkey_…`, card
tokenization), `OPN_SECRET_KEY` (`skey_…`, server calls). Test keys only until the launch gate.

## Testing
Vitest units + local-DB integration with mocked Opn `fetch`:
`opn.ts` request/response shapes; `createChargeForBooking` writes `Payment(PENDING)` / rejects
non-`AWAITING_PAYMENT`; `applyChargeEvent` success → `CONFIRMED`+`HELD`+`Payment SUCCESSFUL` with
`HELD == totalSatang`; **replay → no-op**; card-success path; failure → `Payment FAILED`; route
malformed→400 / valid→200 / replay→200. Ledger invariant stays property-tested in #19; full
money-path Playwright E2E is #29.

## Human-gated (hitl, Aok)
- Provision Opn **test** keys in local `.env`; run `pnpm tsx scripts/opn-spike.ts`; pay the QR in the
  Opn test dashboard; confirm webhook → `CONFIRMED`/`HELD`. Needs a public webhook URL (tunnel or
  Railway staging).
- Email Opn support: can third-party transfers be enabled on an **individual** account? Record the
  answer + date in `ADR-001` ("Spike before Phase 3").

## Out of scope
Checkout/QR UI (#21/#22), refunds/cancellation (#23), payout/Recipients-Transfers (#25), automated
payouts (ADR-001 v2), money-path E2E suite (#29).
