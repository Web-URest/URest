# Concierge Booking Tools + Confirmation Gate + QR-in-chat (#32) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) — subagents can't run shell in this environment, so TDD runs inline. Steps use checkbox (`- [ ]`) syntax.

**Goal:** น้องเรสต์ takes a guest from chat to a real REQUESTED booking inside the thread — `create_booking_draft` renders a confirmation card; the guest's tap mints a server-side single-use 10-min token (invisible to the model); `submit_booking_request` creates the booking; the server attaches the PromptPay QR in-chat for instant-book (deep-links to the trip for request-book).

**Architecture:** A new `lib/concierge/booking.ts` owns the draft/token/submit lifecycle (testable core); the two `tools.ts` handlers wrap it for the model. The model passes only `draft_id` — the token lives on the draft row and is validated server-side (AC#4). Booking creation delegates to `lib/booking` `request`/`instantHold` (rule 2 honored). `handleToolCall` gains an optional `card` side-effect the route emits as a new SSE `card` event + persists, so QR/token never enter the model transcript.

**Tech Stack:** Next.js 15 App Router (SSE route + a confirm endpoint), Prisma, Anthropic SDK (claude-haiku-4-5, strict tools), Vitest, next-intl.

## Global Constraints

- **Money is integer satang** (rule 1); quote via `buildQuote` (commission = 10%); `Math.round(satang/100)` only at the model/UI edge.
- **Booking/escrow state transitions ONLY via `lib/booking`/`lib/ledger`** (rule 2; `gate:status`) — the concierge calls `request`/`instantHold`, never writes `status`/`escrowState`.
- **The model never sees or generates tokens or QR content** (AC#4): token is server-side on the draft row; QR URL travels only in the `card` side-effect, never in a tool `content` or message history.
- **No payment tool exists** — payment is UI; the QR is a server-attached card.
- **Closed-world / cost gates** from #30/#31 are untouched and still apply.
- **i18n Thai-first**: new user-facing strings in `messages/th.json` + `messages/en.json`.
- PR gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status && pnpm gate:bodyraw && pnpm gate:reviews && pnpm build`.

## File structure

- New: `src/lib/concierge/booking.ts` (+ `booking.test.ts`) — draft/token/submit lifecycle (the tested core).
- Modify: `src/lib/concierge/tools.ts` (+ `tools.test.ts`) — implement the two handlers, drop `confirmation_token` from the submit schema, extend `handleToolCall` return with `card?`.
- Modify: `src/lib/concierge/index.ts` — `saveMessage` accepts a `"card"` role; add a model-history filter (or a `getModelMessages` that excludes card rows).
- Modify: `src/app/api/concierge/chat/route.ts` — thread `resolvedSessionId` into `handleToolCall`, emit/persist `card`, handle the `confirmedDraftId` re-invoke; exclude card rows from the model history.
- New: `src/app/api/concierge/confirm/route.ts` — mint the token on tap.
- New: `src/app/[locale]/(protected)/concierge/BookingDraftCard.tsx`, `PaymentQrCard.tsx`; Modify `ConciergeChat.tsx` (SSE `card` branch + confirm re-invoke).
- Modify: `src/lib/concierge/system-prompt.ts` — booking-tool usage guidance.
- Modify: `prisma/schema.prisma` + `docs/DATA_MODEL.md`; `messages/{th,en}.json`; `src/app/[locale]/styleguide/page.tsx`.

---

### Task 1: `ConciergeBookingDraft` schema

**Files:** Modify `docs/DATA_MODEL.md`, `prisma/schema.prisma`; migration.

- [ ] **Step 1: DATA_MODEL.md** — under the concierge domain, add a row: `ConciergeBookingDraft` | in-chat booking draft + server-side confirmation token (§3) | snapshot (priceLines/totalSatang/commissionSatang/cancellationTier), `confirmTokenHash`/`confirmTokenExpiresAt`/`confirmedAt` (minted on the guest tap, never seen by the model), `consumedBookingId` (single-use), `expiresAt` (draft TTL).

- [ ] **Step 2: schema.prisma** — add the model + a back-relation on `ConciergeSession`:

```prisma
model ConciergeBookingDraft {
  id                    String           @id @default(cuid())
  sessionId             String
  userId                String
  listingId             String
  checkIn               DateTime         @db.Date
  checkOut              DateTime         @db.Date
  guests                Int
  priceLines            Json
  totalSatang           Int
  commissionSatang      Int
  cancellationTier      CancellationTier
  guestNoteToHost       String?
  createdAt             DateTime         @default(now())
  expiresAt             DateTime
  confirmedAt           DateTime?
  confirmTokenHash      String?
  confirmTokenExpiresAt DateTime?
  consumedBookingId     String?

  session ConciergeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```
Add `bookingDrafts ConciergeBookingDraft[]` to `model ConciergeSession`.

- [ ] **Step 3: migrate** — `pnpm db:migrate --name concierge_booking_draft` (Docker up; if down, relaunch Docker Desktop then retry). Expected: migration applied, client regenerated.

- [ ] **Step 4: verify + commit** — `pnpm typecheck`, then:
```bash
git add prisma/schema.prisma prisma/migrations docs/DATA_MODEL.md
git commit -m "feat(concierge): ConciergeBookingDraft schema (draft + server-side confirm token) (#32)"
```

---

### Task 2: `lib/concierge/booking.ts` — draft lifecycle core

**Files:** Create `src/lib/concierge/booking.ts` (+ `booking.test.ts`)

**Interfaces:**
- Consumes: `buildQuote` (`@/lib/pricing/quote`), `request`/`instantHold`/`BookingDraft` (`@/lib/booking/transitions`), `createPromptPayCharge` (`@/lib/payments/opn`), `notify` (`@/lib/notifications`), `requirePhoneVerified` (`@/lib/auth/guards`), `prisma`.
- Produces:
  - `createDraft(input: { sessionId; userId; listingId; checkIn: string; checkOut: string; guests: number; noteToHost?: string }, now: Date): Promise<DraftResult>` where `DraftResult = { ok: true; draft: DraftSummary } | { ok: false; reason: string }` and `DraftSummary = { draftId; listingId; title; checkIn; checkOut; nights; guests; totalSatang; priceLines }`.
  - `confirmDraft(draftId: string, userId: string, now: Date): Promise<{ ok: boolean; reason?: string }>` — mints the token.
  - `submitDraft(draftId: string, userId: string, now: Date): Promise<SubmitResult>` where `SubmitResult = { ok: true; bookingId; code: string | null; mode: "REQUEST" | "INSTANT"; qrUrl?: string } | { ok: false; reason: string }`.
  - `CONFIRM_TTL_MS = 10*60*1000`, `DRAFT_TTL_MS = 30*60*1000`.

- [ ] **Step 1: tests** (`booking.test.ts`) — mock `@/lib/db`, `@/lib/pricing/quote` (`buildQuote`), `@/lib/booking/transitions` (`request`/`instantHold`), `@/lib/payments/opn` (`createPromptPayCharge`), `@/lib/notifications` (`notify`), `@/lib/auth/guards` (`requirePhoneVerified`). Cover:
  - `createDraft` rejects an unavailable date (calendar/booking conflict) and over-capacity → `{ ok:false }`, no draft row.
  - `createDraft` happy: computes the quote via `buildQuote`, inserts a draft row with the snapshot + `expiresAt = now + DRAFT_TTL_MS`, returns `DraftSummary` with `totalSatang` from the quote.
  - `confirmDraft`: sets `confirmedAt`/`confirmTokenHash`/`confirmTokenExpiresAt = now + CONFIRM_TTL_MS`; rejects a foreign user / expired / consumed draft.
  - `submitDraft` refuses with no valid token (no `confirmedAt`) → `{ ok:false, reason:"NEEDS_CONFIRM" }`; refuses expired token (`confirmTokenExpiresAt < now`) → `EXPIRED`; refuses a consumed draft → `ALREADY_SUBMITTED`.
  - `submitDraft` REQUEST-mode happy: calls `request(draft, now)`, sets `consumedBookingId`, notifies host `BOOKING_REQUESTED`, returns `{ ok:true, mode:"REQUEST" }` with NO `qrUrl`.
  - `submitDraft` INSTANT-mode happy: calls `instantHold(draft, now)`, creates a PromptPay charge, returns `{ ok:true, mode:"INSTANT", qrUrl }`; no host notify.
  - `submitDraft` maps a double-booking constraint error from `request`/`instantHold` → `{ ok:false, reason:"DATES_TAKEN" }`.

(Token hashing: store `sha256(token)`; `confirmDraft` generates `crypto.randomBytes(24).toString("base64url")`, stores the hash. `submitDraft` only checks `confirmedAt` + `confirmTokenExpiresAt` window + `consumedBookingId == null` — the secret never leaves the server, so presence-of-hash + window is the gate.)

- [ ] **Step 2: run** `pnpm vitest run src/lib/concierge/booking.test.ts` → FAIL.

- [ ] **Step 3: implement** `booking.ts`. `createDraft`: load listing (PUBLISHED, +seasons, pricing config, `cancellationTier`, `bookingMode`, `maxGuests`, `title`); capacity + calendar/booking-overlap check (mirror `checkAvailabilityHandler`, `tools.ts:219-257`); `buildQuote`; `prisma.conciergeBookingDraft.create` with `priceLines: quote.nights as Prisma.InputJsonValue, totalSatang: quote.totalSatang, commissionSatang: quote.commissionSatang, cancellationTier: listing.cancellationTier, expiresAt: new Date(now.getTime()+DRAFT_TTL_MS)`. `submitDraft`: load draft; guard `userId` match + `expiresAt>now` + `consumedBookingId==null` + token window; map to `BookingDraft` (`checkIn`/`checkOut` are already Date on the row; `priceLines` from the row); branch on listing `bookingMode` → `request`/`instantHold` (try/catch → `DATES_TAKEN`); `prisma.conciergeBookingDraft.update({ consumedBookingId })`; REQUEST → `notify(hostId,"BOOKING_REQUESTED",…)`; INSTANT → `createPromptPayCharge({amountSatang: totalSatang, bookingId})` → `qrUrl = charge.source?.scannable_code?.image?.download_uri`.

- [ ] **Step 4: run** → PASS. `pnpm gate:status` (no direct status writes). Commit `feat(concierge): booking-draft lifecycle (create/confirm/submit) + server-side token (#32)`.

---

### Task 3: tool handlers + `card` side-effect on the dispatcher

**Files:** Modify `src/lib/concierge/tools.ts` (+ `tools.test.ts`)

**Interfaces:**
- Produces: `handleToolCall(name, input, userId, sessionId): Promise<{ is_error: boolean; content: string; card?: ConciergeCard }>`; `ConciergeCard = { kind: "booking_draft"; draftId; title; checkIn; checkOut; nights; guests; totalThb; priceLines } | { kind: "payment_qr"; bookingId; code; qrUrl; payUrl } | { kind: "request_sent"; bookingId; code; tripUrl }`.

- [ ] **Step 1: schema fix + tests.** In `tools.ts`, change `submit_booking_request` `input_schema` to `properties: { draft_id: { type: "string" } }, required: ["draft_id"]` (drop `confirmation_token`). In `tools.test.ts` add: `create_booking_draft` with no `userId` → `is_error` (sign-in prompt) and no draft; with a valid user (mock `createDraft` → ok) → `is_error:false` + a `card.kind === "booking_draft"` whose `content` (model-facing) does NOT contain a token; `submit_booking_request` (mock `submitDraft`) INSTANT → returns a `card.kind === "payment_qr"` and the model-facing `content` does NOT contain `qrUrl`; REQUEST → `card.kind === "request_sent"`; `submitDraft` `{ok:false}` → `is_error:true` with the Thai reason.

- [ ] **Step 2: run** → FAIL.

- [ ] **Step 3: implement.** Extend `ToolResult` to `{ is_error; content; card? }`. `createBookingDraftHandler(input, userId, sessionId)`: if `!userId` → `{ is_error:true, content:"กรุณาเข้าสู่ระบบเพื่อจองค่ะ" }`; else `createDraft({...})` → on ok return `{ is_error:false, content: JSON.stringify({ draft_id, title, dates, nights, total_thb, price_lines }), card:{kind:"booking_draft",…} }`; on fail `{ is_error:true, content: reasonToThai(reason) }`. `submitBookingRequestHandler(input, userId, sessionId)`: `if(!userId) …`; `await requirePhoneVerified()` in try/catch (AuthError → `{ is_error:true, content:"กรุณายืนยันเบอร์โทรก่อนจองค่ะ" }`); `submitDraft(draft_id, userId, now)` → INSTANT ok → `card:{kind:"payment_qr", qrUrl, payUrl:`/trips/${bookingId}/pay`}` + `content:{success:true, booking_code, status:"awaiting_payment"}` (NO qrUrl); REQUEST ok → `card:{kind:"request_sent", tripUrl:`/trips/${bookingId}`}` + `content:{success:true, booking_code, status:"requested"}`; fail → `{ is_error:true, content: reasonToThai }`. Update `handleToolCall` signature to `(name, input, userId, sessionId)` and route the two cases to the handlers.

- [ ] **Step 4: run** → PASS. Commit `feat(concierge): booking tool handlers + card side-effect on dispatcher (#32)`.

---

### Task 4: confirm endpoint (mint token on tap)

**Files:** Create `src/app/api/concierge/confirm/route.ts`

- [ ] **Step 1:** implement `POST` `{ draftId }` — `requirePhoneVerified()` (catch → 403 JSON `{ ok:false, reason:"PHONE_UNVERIFIED" }`); `confirmDraft(draftId, user.id, new Date())`; return `{ ok:true }` or `{ ok:false, reason }`. No token in the response body (the server holds it).

- [ ] **Step 2: verify** `pnpm typecheck`; `pnpm build` lists `/api/concierge/confirm`. Commit `feat(concierge): confirm endpoint mints the server-side booking token (#32)`.

---

### Task 5: route wiring — card emit/persist, model-history filter, confirm re-invoke

**Files:** Modify `src/app/api/concierge/chat/route.ts`, `src/lib/concierge/index.ts`

- [ ] **Step 1: index.ts** — `saveMessage` already takes `role`; add a `getModelMessages(sessionId)` (or filter in the route) that returns only `role in ("user","assistant")` rows for the Anthropic history. (Card rows persist with role `"card"`, content = `JSON.stringify(card)`, and must NOT enter the model context — they'd break the `role` cast + leak the QR.)

- [ ] **Step 2: route** — (a) build `anthropicMessages` from the user/assistant-only set. (b) call `handleToolCall(toolUse.name, toolInput, userId, resolvedSessionId)`; when `result.card`, `send({ type:"card", card: result.card })` and `await saveMessage(resolvedSessionId, "card", JSON.stringify(result.card))` — but pass only `result.content` into the `tool_result` block (model never sees the card). (c) accept `confirmedDraftId` in the body; when present, synthesize the user turn server-side: persist + feed a message naming the draft id (`ผู้ใช้ยืนยันการจอง draft ${confirmedDraftId} แล้ว`) so the model calls `submit_booking_request(draft_id)` (the token is NOT included — it's already on the row). `message` may be empty in this mode.

- [ ] **Step 3: verify** `pnpm typecheck && pnpm gate:status`; `pnpm build`. Commit `feat(concierge): route emits/persists booking cards + confirm re-invoke; cards excluded from model history (#32)`.

---

### Task 6: chat UI cards + system prompt

**Files:** Create `BookingDraftCard.tsx`, `PaymentQrCard.tsx`; Modify `ConciergeChat.tsx`, `system-prompt.ts`, `messages/{th,en}.json`, `styleguide/page.tsx`

- [ ] **Step 1: system prompt** — append booking-flow guidance: call `create_booking_draft` once the guest has a villa + dates; the in-chat card + the guest's tap handle confirmation; after a confirmation the system will tell you the guest confirmed a specific draft — then call `submit_booking_request` with that `draft_id`; never ask for or invent tokens; never describe the QR (the app shows it). (Frozen-prompt note: the #33 eval gate isn't built yet — this prompt change ships ungated; #33's gate covers future changes.)

- [ ] **Step 2: cards** — `BookingDraftCard` (server-data, client island): renders title/dates/guests/price lines/total + a "ยืนยันส่งคำขอ" button → `POST /api/concierge/confirm {draftId}` then re-invoke chat with `{ confirmedDraftId: draftId }`; disabled while pending; on confirm-endpoint failure shows the phone-verify hint. `PaymentQrCard`: renders the QR `<img src={qrUrl}>` + a "เปิดหน้าชำระเงิน" link to `payUrl`; `request_sent` card variant → a "ดูสถานะการจอง" link to `tripUrl`. Token-/satang-free; design tokens only.

- [ ] **Step 3: ConciergeChat** — add a `card` SSE branch that appends a typed card entry to the message list and renders the right component; keep cards in client state for the session.

- [ ] **Step 4: i18n** — `Concierge.*` keys for the card labels/buttons in both locales (th source).

- [ ] **Step 5: styleguide** — add the two cards (with sample data) to `/styleguide`.

- [ ] **Step 6: verify** `pnpm typecheck && pnpm lint && pnpm build` (concierge route + cards compile). Commit `feat(concierge): in-chat booking-draft + payment-QR cards + system-prompt booking flow (#32)`.

---

### Task 7: full gate + review + PR

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status && pnpm gate:bodyraw && pnpm gate:reviews && pnpm build` — all green.
- [ ] **Step 2:** whole-branch read-only review (Explore subagent), focused on: the token never reaching the model (tool `content` + history exclude it), `gate:status` (booking via `lib/booking` only), the draft→`BookingDraft` mapping, the instant/request branch, double-booking handling.
- [ ] **Step 3:** PR `Closes #32`, labels `area:concierge` (+ `area:booking`), milestone **M4 AI concierge**.

## Self-Review

**Spec coverage:** §A schema → Task 1; §B handlers + submit schema change → Task 3; §C dispatch `card` side-effect → Tasks 3/5; §D confirm endpoint + UI → Tasks 4/6; the token-server-side / model-never-sees invariant → Tasks 2/3/5 (content + history exclude token/QR); instant-QR / request-deep-link → Tasks 2/3/6; error handling (token/phone/date-race/anon) → Tasks 2/3. AC: #1 full booking in-thread → Tasks 2–6; #2 submit without fresh token fails → Task 2 tests; #3 QR at AWAITING_PAYMENT → Tasks 2/6 (instant); #4 model never sees tokens/QR → Tasks 3/5 (asserted in tests + history filter). Eval harness (#33) explicitly out of scope.

**Placeholder scan:** none; lib core is fully specified; UI steps are concrete (the cards are build-verified, no RTL).

**Type consistency:** `DraftSummary`/`SubmitResult`/`ConciergeCard` and `createDraft`/`confirmDraft`/`submitDraft` + the extended `handleToolCall(name,input,userId,sessionId) → {is_error,content,card?}` are consistent across Tasks 2/3/5; `BookingDraft` fields match `transitions.ts:64`; `buildQuote` → `commissionSatang`/`totalSatang`/`nights` match `quote.ts:175`; the submit schema is `{draft_id}` only everywhere.
