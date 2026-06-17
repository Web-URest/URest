# Request-to-book Payment Half (#21b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest pay an accepted request (PromptPay QR + card/3DS), drive the booking to CONFIRMED via the already-built Opn webhook, and fire the §6 payment notifications (received G+H, expired→host, 2h-left→guest).

**Architecture:** Most of the backend exists (charge creation, webhook→confirm, escrow, payment-expiry sweep). This slice adds: a guest pay screen (`/trips/[id]/pay`) with three thin server actions + client tabs/poller, four notification templates and their triggers, a `freshlyConfirmed` idempotency flag so a redelivered webhook doesn't double-notify, and a new 2h-reminder sweep with a once-only dedupe field. Branch `feat/21-payment-flow` already has the spec committed.

**Tech Stack:** Next.js 15 App Router (server components + `"use server"` actions), Prisma, Opn/Omise (plain fetch client + `omise.js` for client card tokenization), node-cron sweeps, next-intl, Vitest (node env — no RTL in this repo).

## Global Constraints

- **Money is integer satang** (`Int`); use `src/lib/money.ts`; display formatting only at the UI edge. No floats.
- **Booking state transitions happen ONLY in `src/lib/booking/`.** Pages/actions/sweeps never write `Booking.status`. (`pnpm gate:status` enforces.)
- **Timestamps UTC in DB**; `Asia/Bangkok` at display only. Deadlines are DB rows swept by cron, never `setTimeout`.
- **Config from `src/lib/env.ts`** (zod), never `process.env`. New var = update `env.ts` + `.env.example` same PR. (This slice adds none.)
- **TS strict**: no `any`, no `@ts-ignore`; `noUncheckedIndexedAccess` on — handle `undefined`.
- **Webhooks idempotent** (rule 6): replays are no-ops; notifications must not double-fire on replay.
- **Thai-first i18n**: UI strings in `messages/th.json` (source) + `messages/en.json`, append-only per feature; nav via `@/i18n/navigation` (`Link`/`useRouter`/`redirect`), never `next/*`. Notification bodies live in-code in `templates.ts` (NOT messages json).
- **Design tokens only** from `globals.css` `@theme` — no invented hex.
- **schema.prisma is additive-only + Aok-integrated**; change `docs/DATA_MODEL.md` first.
- The PR gate (run before commit where noted): `pnpm typecheck && pnpm lint && pnpm test` + `pnpm gate:status`.

## File Structure

**Create:**
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/page.tsx` — server pay-screen shell.
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/actions.ts` — `getPromptPayCharge`, `payWithCard`, `getBookingPaymentStatus`.
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/actions.test.ts` — action units.
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/helpers.ts` — pure client-decision helpers.
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/helpers.test.ts` — helper units.
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/promptpay-tab.tsx` — client QR tab.
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/card-tab.tsx` — client card tab (omise.js + 3DS).
- `src/app/[locale]/(protected)/trips/[bookingId]/pay/payment-poller.tsx` — client status poller.

**Modify:**
- `prisma/schema.prisma` + new migration; `docs/DATA_MODEL.md` — `Booking.payReminderSentAt`.
- `src/lib/notifications/templates.ts` + `templates.test.ts` — 4 keys.
- `src/lib/payments/opn.ts` + `opn.test.ts` — `authorize_uri`, card `return_uri`.
- `src/lib/payments/charge.ts` + `charge.test.ts` — `returnUri` passthrough; notify on fresh confirm.
- `src/lib/booking/transitions.ts` + `transitions.test.ts` — `confirmFromWebhook` returns `{ booking, freshlyConfirmed }`.
- `src/lib/booking/sweeps.ts` + `sweeps.test.ts` — host expiry notify; `sweepPaymentReminders`.
- `src/lib/jobs/scheduler.ts` — wire the reminder sweep.
- `src/app/[locale]/(protected)/trips/[bookingId]/page.tsx` — "ชำระเงินเลย" CTA.
- `messages/th.json` + `messages/en.json` — `Booking` pay-screen keys.

---

### Task 1: Schema — `payReminderSentAt` dedupe field

**Files:**
- Modify: `docs/DATA_MODEL.md` (Booking section), `prisma/schema.prisma` (Booking model)
- Create: `prisma/migrations/<ts>_booking_pay_reminder/migration.sql` (via `pnpm db:migrate`)

**Interfaces:**
- Produces: `Booking.payReminderSentAt: DateTime?` — set once when the 2h-left reminder is sent (Task 8).

- [ ] **Step 1: Document the field in DATA_MODEL.md.** Find the `Booking` table section and add a row to its field list:

```
| payReminderSentAt | timestamptz? | Set once when the "payment 2h left" reminder is sent; NULL = not yet reminded. Dedupe for sweepPaymentReminders (#21b). |
```

- [ ] **Step 2: Add the field to schema.prisma.** In `model Booking`, next to the other deadline fields (`respondBy`, `payBy`):

```prisma
  respondBy DateTime?   // host accept deadline (REQUESTED + 12h)
  payBy     DateTime?   // payment deadline (12h request / 1h instant)
  payReminderSentAt DateTime? // once-only "payment 2h left" reminder marker (#21b)
```

- [ ] **Step 3: Ensure local Postgres is up, then create the migration.**

Run: `pnpm db:up` (no-op if already running), then `pnpm db:migrate --name booking_pay_reminder`
Expected: a new `migration.sql` containing `ALTER TABLE "Booking" ADD COLUMN "payReminderSentAt" TIMESTAMP(3)`, and `prisma generate` runs clean.

- [ ] **Step 4: Verify the client typechecks with the new field.**

Run: `pnpm typecheck`
Expected: PASS (the generated `Prisma.BookingSelect` now includes `payReminderSentAt`).

- [ ] **Step 5: Commit.**

```bash
git add docs/DATA_MODEL.md prisma/schema.prisma prisma/migrations
git commit -m "feat(booking): add Booking.payReminderSentAt for pay-reminder dedupe (#21)"
```

---

### Task 2: Notification templates (4 payment keys)

**Files:**
- Modify: `src/lib/notifications/templates.ts`
- Test: `src/lib/notifications/templates.test.ts`

**Interfaces:**
- Produces template keys (consumed by Tasks 6, 7, 8):
  - `PAYMENT_RECEIVED_GUEST` params `{ listingTitle, code, bookingId }` — priority
  - `PAYMENT_RECEIVED_HOST` params `{ listingTitle, code, bookingId }` — priority
  - `PAYMENT_EXPIRED_HOST` params `{ listingTitle, bookingId }` — priority
  - `PAYMENT_REMINDER_GUEST` params `{ listingTitle, bookingId }` — priority

- [ ] **Step 1: Write the failing tests.** Append to `templates.test.ts`:

```ts
describe("payment lifecycle templates", () => {
  it("PAYMENT_RECEIVED_GUEST is priority and carries the booking code", () => {
    const t = getTemplate("PAYMENT_RECEIVED_GUEST");
    expect(t?.priority).toBe(true);
    expect(t?.email({ listingTitle: "วิลล่า A", code: "UR-2606-0001" }).subject).toContain("UR-2606-0001");
    expect(t?.line({ listingTitle: "วิลล่า A", code: "UR-2606-0001" })).toContain("UR-2606-0001");
  });
  it("PAYMENT_RECEIVED_HOST is priority and names the listing", () => {
    const t = getTemplate("PAYMENT_RECEIVED_HOST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A", code: "UR-2606-0001" })).toContain("วิลล่า A");
  });
  it("PAYMENT_EXPIRED_HOST tells the host dates were released", () => {
    const t = getTemplate("PAYMENT_EXPIRED_HOST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });
  it("PAYMENT_REMINDER_GUEST nudges the guest to pay", () => {
    const t = getTemplate("PAYMENT_REMINDER_GUEST");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run src/lib/notifications/templates.test.ts`
Expected: FAIL — `getTemplate("PAYMENT_RECEIVED_GUEST")` is `undefined`.

- [ ] **Step 3: Add the four templates.** Insert into the `templates` object in `templates.ts` after `REQUEST_EXPIRED`:

```ts
  PAYMENT_RECEIVED_GUEST: {
    priority: true,
    email: (p) => ({
      subject: `ชำระเงินสำเร็จ — ยืนยันการจองแล้ว ${str(p.code)}`,
      body: `ชำระเงินสำเร็จ! การจอง ${str(p.listingTitle)} ยืนยันแล้ว รหัสจองของคุณคือ ${str(p.code)} ดูรายละเอียดและการติดต่อโฮสต์ได้ในแอป`,
    }),
    line: (p) => `✅ ชำระเงินสำเร็จ! ยืนยันการจอง ${str(p.listingTitle)} แล้ว — รหัสจอง ${str(p.code)}`,
  },
  PAYMENT_RECEIVED_HOST: {
    priority: true,
    email: (p) => ({
      subject: `การจองยืนยันแล้ว ${str(p.code)} — เตรียมต้อนรับแขก`,
      body: `แขกชำระเงินสำหรับ ${str(p.listingTitle)} แล้ว การจองยืนยันเรียบร้อย รหัสจอง ${str(p.code)} เตรียมต้อนรับแขกได้เลย`,
    }),
    line: (p) => `🎉 ยืนยันการจอง ${str(p.code)}: ${str(p.listingTitle)} — แขกชำระเงินแล้ว`,
  },
  PAYMENT_EXPIRED_HOST: {
    priority: true,
    email: (p) => ({
      subject: `คำขอจอง ${str(p.listingTitle)} หมดเวลาชำระเงิน`,
      body: `แขกไม่ได้ชำระเงินภายในเวลาที่กำหนดสำหรับ ${str(p.listingTitle)} วันที่ถูกปล่อยคืนแล้วและพร้อมรับการจองใหม่`,
    }),
    line: (p) => `⏰ ${str(p.listingTitle)} หมดเวลาชำระเงิน — ปล่อยวันที่ว่างแล้ว พร้อมรับจองใหม่`,
  },
  PAYMENT_REMINDER_GUEST: {
    priority: true,
    email: (p) => ({
      subject: `เหลือเวลา 2 ชั่วโมง — ชำระเงินเพื่อยืนยันการจอง ${str(p.listingTitle)}`,
      body: `เหลือเวลาอีกประมาณ 2 ชั่วโมงในการชำระเงินสำหรับ ${str(p.listingTitle)} ชำระเงินเลยเพื่อไม่ให้เสียวันที่จองนี้ไป`,
    }),
    line: (p) => `⏰ เหลือเวลา 2 ชม. ชำระเงินเพื่อยืนยันการจอง ${str(p.listingTitle)} — อย่าให้วันที่หลุดไปนะคะ`,
  },
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run src/lib/notifications/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/notifications/templates.ts src/lib/notifications/templates.test.ts
git commit -m "feat(notifications): payment lifecycle templates (#21)"
```

---

### Task 3: Opn client — card 3DS (`authorize_uri` + `return_uri`)

**Files:**
- Modify: `src/lib/payments/opn.ts`
- Test: `src/lib/payments/opn.test.ts`

**Interfaces:**
- Produces: `OpnCharge.authorize_uri?: string | null`; `createCardCharge` accepts `returnUri: string` and sends `return_uri`.

- [ ] **Step 1: Write the failing test.** Open `opn.test.ts`, find how it stubs `fetch` for `createCardCharge`, and add a test asserting the form body includes `return_uri` (mirror the existing card-charge test's assertion style). Example:

```ts
it("createCardCharge sends the card token and return_uri", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ object: "charge", id: "chrg_c", status: "pending", authorize_uri: "https://opn/3ds" }), { status: 200 }),
  );
  await createCardCharge({ amountSatang: 100_00, bookingId: "bk1", token: "tokn_1", returnUri: "https://app/th/trips/bk1/pay" });
  const body = (fetchMock.mock.calls[0]?.[1]?.body ?? "") as string;
  expect(body).toContain("card=tokn_1");
  expect(decodeURIComponent(body)).toContain("return_uri=https://app/th/trips/bk1/pay");
  fetchMock.mockRestore();
});
```

(If `opn.test.ts` already has a different fetch-stub harness, match it — the assertion is: body contains `return_uri`.)

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run src/lib/payments/opn.test.ts`
Expected: FAIL — `createCardCharge` doesn't accept/send `returnUri`.

- [ ] **Step 3: Implement.** In `opn.ts`, extend the interface and the card-charge function:

```ts
export interface OpnCharge {
  object: "charge";
  id: string;
  status: "pending" | "successful" | "failed" | "expired" | "reversed";
  paid: boolean;
  amount: number; // satang
  currency: string;
  metadata: Record<string, unknown>;
  expires_at?: string | null;
  authorize_uri?: string | null; // 3DS redirect target for card charges
  source?: {
    type: string;
    scannable_code?: { image?: { download_uri?: string } };
  } | null;
}
```

```ts
/** Create a charge from a card token (tokenized client-side). `returnUri` is where Opn returns the browser after 3DS. */
export function createCardCharge(input: {
  amountSatang: number;
  bookingId: string;
  token: string;
  returnUri: string;
}): Promise<OpnCharge> {
  return opnRequest("POST", "/charges", {
    amount: input.amountSatang,
    currency: "thb",
    card: input.token,
    return_uri: input.returnUri,
    metadata: { bookingId: input.bookingId },
  });
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run src/lib/payments/opn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/payments/opn.ts src/lib/payments/opn.test.ts
git commit -m "feat(payments): card charge return_uri + authorize_uri (#21)"
```

---

### Task 4: `createChargeForBooking` threads `returnUri`

**Files:**
- Modify: `src/lib/payments/charge.ts`
- Test: `src/lib/payments/charge.test.ts`

**Interfaces:**
- Consumes: `createCardCharge({ …, returnUri })` (Task 3).
- Produces: `createChargeForBooking(bookingId, method, { cardToken?, returnUri? })` passes `returnUri` to the card charge.

- [ ] **Step 1: Update the failing test.** In `charge.test.ts`, change the existing card test ("creates a card charge from the supplied token") to pass + assert `returnUri`:

```ts
  it("creates a card charge from the supplied token and return_uri", async () => {
    findBooking.mockResolvedValue(booking());
    cardCharge.mockResolvedValue(charge({ id: "chrg_card", source: null, expires_at: null }));

    await createChargeForBooking("bk1", PaymentMethod.CARD, { cardToken: "tokn_9", returnUri: "https://app/th/trips/bk1/pay" });

    expect(cardCharge).toHaveBeenCalledWith({ amountSatang: 12_900_00, bookingId: "bk1", token: "tokn_9", returnUri: "https://app/th/trips/bk1/pay" });
  });
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run src/lib/payments/charge.test.ts -t "card charge from the supplied token"`
Expected: FAIL — `createCardCharge` called without `returnUri`.

- [ ] **Step 3: Implement.** In `charge.ts`, extend `opts` and the card branch:

```ts
export async function createChargeForBooking(
  bookingId: string,
  method: PaymentMethod,
  opts: { cardToken?: string; returnUri?: string } = {},
): Promise<{ payment: Payment; charge: OpnCharge }> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new PaymentError("BOOKING_NOT_FOUND");
  if (booking.status !== BookingStatus.AWAITING_PAYMENT) {
    throw new PaymentError("NOT_AWAITING_PAYMENT");
  }

  let charge: OpnCharge;
  if (method === PaymentMethod.CARD) {
    if (!opts.cardToken) throw new PaymentError("CARD_TOKEN_REQUIRED");
    if (!opts.returnUri) throw new PaymentError("CARD_TOKEN_REQUIRED");
    charge = await createCardCharge({
      amountSatang: booking.totalSatang,
      bookingId,
      token: opts.cardToken,
      returnUri: opts.returnUri,
    });
  } else {
    charge = await createPromptPayCharge({ amountSatang: booking.totalSatang, bookingId });
  }
  // …unchanged Payment.create…
```

(Reuse `CARD_TOKEN_REQUIRED` for the missing-returnUri case — the card UI always sends both, so this guards a programmer error, not a user path; no new error reason needed.)

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run src/lib/payments/charge.test.ts`
Expected: PASS (all charge tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/payments/charge.ts src/lib/payments/charge.test.ts
git commit -m "feat(payments): thread card return_uri through createChargeForBooking (#21)"
```

---

### Task 5: `confirmFromWebhook` returns `{ booking, freshlyConfirmed }`

**Files:**
- Modify: `src/lib/booking/transitions.ts`
- Test: `src/lib/booking/transitions.test.ts`

**Interfaces:**
- Produces: `confirmFromWebhook(input, now): Promise<{ booking: Booking; freshlyConfirmed: boolean }>`. `freshlyConfirmed` is true only when this call did the transition; a replayed event → `false`.

- [ ] **Step 1: Add the failing assertions.** In `transitions.test.ts`, extend the two existing `confirmFromWebhook` tests to assert the return shape. In "confirms, mints a code…":

```ts
    const result = await confirmFromWebhook({ bookingId: "bk1", opnEventId: "evt_1", payload: {} }, NOW);
    expect(result.freshlyConfirmed).toBe(true);
```

In "is a no-op on a replayed event id":

```ts
    const result = await confirmFromWebhook({ bookingId: "bk1", opnEventId: "evt_1", payload: {} }, NOW);
    expect(result.freshlyConfirmed).toBe(false);
```

(Keep the existing side-effect assertions — they still hold.)

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run src/lib/booking/transitions.test.ts -t confirmFromWebhook`
Expected: FAIL — `result.freshlyConfirmed` is `undefined` (function returns a `Booking`).

- [ ] **Step 3: Implement.** Change the return type + the two returns in `confirmFromWebhook`:

```ts
export function confirmFromWebhook(
  input: ConfirmInput,
  now: Date,
): Promise<{ booking: Booking; freshlyConfirmed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new BookingError("NOT_FOUND");

    const fresh = await claimWebhookEvent(tx, input.opnEventId, input.payload, now);
    if (!fresh) return { booking, freshlyConfirmed: false }; // replay — already processed

    if (booking.status !== BookingStatus.AWAITING_PAYMENT) throw new BookingError("WRONG_STATE");

    const code = await issueBookingCode(tx, now);
    const confirmed = await tx.booking.update({
      where: { id: input.bookingId },
      data: { status: BookingStatus.CONFIRMED, code, contactUnmaskedAt: now },
    });
    await recordCharge(tx, input.bookingId, booking.totalSatang, input.opnEventId);
    return { booking: confirmed, freshlyConfirmed: true };
  });
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run src/lib/booking/transitions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/booking/transitions.ts src/lib/booking/transitions.test.ts
git commit -m "feat(booking): confirmFromWebhook returns freshlyConfirmed flag (#21)"
```

---

### Task 6: `applyChargeEvent` fires payment-received notifications (fresh only)

**Files:**
- Modify: `src/lib/payments/charge.ts`
- Test: `src/lib/payments/charge.test.ts`

**Interfaces:**
- Consumes: `confirmFromWebhook` → `{ booking, freshlyConfirmed }` (Task 5); templates `PAYMENT_RECEIVED_GUEST`/`_HOST` (Task 2); `notify(userId, key, params)`.
- Produces: on a freshly-confirmed charge, notifies guest + host; replay does not notify.

- [ ] **Step 1: Write the failing tests.** In `charge.test.ts`, add the notifications mock at the top with the other `vi.mock`s:

```ts
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
```

Add to imports: `import { notify } from "@/lib/notifications";` and `const notifyFn = notify as unknown as Mock;`. Update the existing confirm test and add a replay test:

```ts
  it("re-fetches the charge, confirms the booking, marks Payment SUCCESSFUL, and notifies guest + host", async () => {
    fetchCharge.mockResolvedValue(charge({ status: "successful" }));
    confirm.mockResolvedValue({ booking: booking({ status: BookingStatus.CONFIRMED }), freshlyConfirmed: true });
    findBooking.mockResolvedValue({ userId: "g1", code: "UR-2606-0001", listing: { hostId: "h1", title: "วิลล่า A" } });

    const result = await applyChargeEvent("evnt_1", "chrg_1", { id: "evnt_1" }, NOW);

    expect(confirm).toHaveBeenCalledWith({ bookingId: "bk1", opnEventId: "evnt_1", payload: { id: "evnt_1" } }, NOW);
    expect(notifyFn).toHaveBeenCalledWith("g1", "PAYMENT_RECEIVED_GUEST", { listingTitle: "วิลล่า A", code: "UR-2606-0001", bookingId: "bk1" });
    expect(notifyFn).toHaveBeenCalledWith("h1", "PAYMENT_RECEIVED_HOST", { listingTitle: "วิลล่า A", code: "UR-2606-0001", bookingId: "bk1" });
    expect(result).toEqual({ kind: "confirmed", bookingId: "bk1" });
  });

  it("does NOT notify on a replayed (already-processed) event", async () => {
    fetchCharge.mockResolvedValue(charge({ status: "successful" }));
    confirm.mockResolvedValue({ booking: booking({ status: BookingStatus.CONFIRMED }), freshlyConfirmed: false });

    const result = await applyChargeEvent("evnt_1", "chrg_1", {}, NOW);

    expect(notifyFn).not.toHaveBeenCalled();
    expect(paymentUpdateMany).toHaveBeenCalled(); // terminal write stays idempotent
    expect(result).toEqual({ kind: "confirmed", bookingId: "bk1" });
  });
```

Also update the existing "ignores a duplicate/late event…" test — it already rejects with `BookingError`, unchanged, but the confirm mock for the *successful* path now returns the new shape (handled above).

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run src/lib/payments/charge.test.ts -t notifies`
Expected: FAIL — `notify` not called; `confirm` return shape mismatch.

- [ ] **Step 3: Implement.** In `charge.ts`, add the import and rework the successful branch + a helper:

```ts
import { notify } from "@/lib/notifications";
```

```ts
  if (charge.status === "successful") {
    let freshlyConfirmed = false;
    try {
      ({ freshlyConfirmed } = await confirmFromWebhook({ bookingId, opnEventId, payload }, now));
    } catch (err) {
      if (err instanceof BookingError) return { kind: "ignored", bookingId };
      throw err;
    }
    await markPayment(chargeId, PaymentStatus.SUCCESSFUL);
    if (freshlyConfirmed) await notifyPaymentReceived(bookingId);
    return { kind: "confirmed", bookingId };
  }
```

```ts
/** Notify guest (receipt) + host (prep notice) once a payment confirms (§6). Best-effort — notify never throws. */
async function notifyPaymentReceived(bookingId: string): Promise<void> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, code: true, listing: { select: { hostId: true, title: true } } },
  });
  if (!b) return;
  const params = { listingTitle: b.listing.title, code: b.code ?? "", bookingId };
  await notify(b.userId, "PAYMENT_RECEIVED_GUEST", params);
  await notify(b.listing.hostId, "PAYMENT_RECEIVED_HOST", params);
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run src/lib/payments/charge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/payments/charge.ts src/lib/payments/charge.test.ts
git commit -m "feat(payments): notify guest+host on payment confirm, idempotent on replay (#21)"
```

---

### Task 7: `sweepOverduePayments` notifies the host (request mode)

**Files:**
- Modify: `src/lib/booking/sweeps.ts`
- Test: `src/lib/booking/sweeps.test.ts`

**Interfaces:**
- Consumes: `PAYMENT_EXPIRED_HOST` (Task 2); `expire`, `notify`.
- Produces: on a request-mode payment expiry, notifies the host; instant-mode expiry notifies no one.

- [ ] **Step 1: Update the failing test.** Replace the `sweepOverduePayments` describe block in `sweeps.test.ts`:

```ts
describe("sweepOverduePayments", () => {
  it("expires AWAITING_PAYMENT past pay-by and notifies the host for REQUEST-mode bookings", async () => {
    findMany.mockResolvedValue([
      { id: "p1", bookingMode: "REQUEST", listing: { hostId: "h1", title: "วิลล่า A" } },
      { id: "p2", bookingMode: "INSTANT", listing: { hostId: "h2", title: "วิลล่า B" } },
    ]);

    const n = await sweepOverduePayments(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: NOW } },
      select: { id: true, bookingMode: true, listing: { select: { hostId: true, title: true } } },
    });
    expect(expireMock).toHaveBeenCalledWith("p1", NOW);
    expect(expireMock).toHaveBeenCalledWith("p2", NOW);
    expect(notifyFn).toHaveBeenCalledTimes(1); // only the REQUEST-mode host
    expect(notifyFn).toHaveBeenCalledWith("h1", "PAYMENT_EXPIRED_HOST", { listingTitle: "วิลล่า A", bookingId: "p1" });
    expect(n).toBe(2);
  });

  it("isolates a per-row failure (no notify for the failed row)", async () => {
    findMany.mockResolvedValue([
      { id: "bad", bookingMode: "REQUEST", listing: { hostId: "h1", title: "วิลล่า A" } },
      { id: "ok", bookingMode: "REQUEST", listing: { hostId: "h2", title: "วิลล่า B" } },
    ]);
    expireMock.mockReset();
    expireMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const n = await sweepOverduePayments(NOW);

    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(notifyFn).toHaveBeenCalledWith("h2", "PAYMENT_EXPIRED_HOST", expect.anything());
    expect(n).toBe(1);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run src/lib/booking/sweeps.test.ts -t sweepOverduePayments`
Expected: FAIL — select shape mismatch; no notify.

- [ ] **Step 3: Implement.** Replace `sweepOverduePayments` in `sweeps.ts`:

```ts
/** AWAITING_PAYMENT past payBy → EXPIRED; for REQUEST-mode, notify the host (instant hosts never saw it). */
export async function sweepOverduePayments(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: now } },
    select: { id: true, bookingMode: true, listing: { select: { hostId: true, title: true } } },
  });
  let done = 0;
  for (const row of rows) {
    try {
      await expire(row.id, now);
      if (row.bookingMode === BookingMode.REQUEST) {
        await notify(row.listing.hostId, "PAYMENT_EXPIRED_HOST", { listingTitle: row.listing.title, bookingId: row.id });
      }
      done++;
    } catch (err) {
      console.error(`[cron] expire payment ${row.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}
```

Add `BookingMode` to the existing `@prisma/client` import at the top: `import { BookingStatus, BookingMode } from "@prisma/client";`

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run src/lib/booking/sweeps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/booking/sweeps.ts src/lib/booking/sweeps.test.ts
git commit -m "feat(booking): notify host on request-mode payment expiry (#21)"
```

---

### Task 8: `sweepPaymentReminders` (2h-left) + scheduler wiring

**Files:**
- Modify: `src/lib/booking/sweeps.ts`, `src/lib/jobs/scheduler.ts`
- Test: `src/lib/booking/sweeps.test.ts`

**Interfaces:**
- Consumes: `Booking.payReminderSentAt` (Task 1); `PAYMENT_REMINDER_GUEST` (Task 2); `notify`.
- Produces: `sweepPaymentReminders(now): Promise<number>` — guest reminded exactly once when `payBy` is within 2h.

- [ ] **Step 1: Write the failing tests.** Extend the `vi.mock("@/lib/db", …)` in `sweeps.test.ts` to add `updateMany`:

```ts
vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: vi.fn(), updateMany: vi.fn() } } }));
```

Add `const updateMany = prisma.booking.updateMany as unknown as Mock;`, default it in `beforeEach` (`updateMany.mockResolvedValue({ count: 1 });`), and import `sweepPaymentReminders` from `./sweeps`. Then:

```ts
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

describe("sweepPaymentReminders", () => {
  it("reminds the guest once when payBy is within 2h, claiming the dedupe field", async () => {
    findMany.mockResolvedValue([{ id: "p1", userId: "g1", listing: { title: "วิลล่า A" } }]);

    const n = await sweepPaymentReminders(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.AWAITING_PAYMENT,
        payReminderSentAt: null,
        payBy: { gt: NOW, lte: new Date(NOW.getTime() + TWO_HOURS_MS) },
      },
      select: { id: true, userId: true, listing: { select: { title: true } } },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "p1", payReminderSentAt: null },
      data: { payReminderSentAt: NOW },
    });
    expect(notifyFn).toHaveBeenCalledWith("g1", "PAYMENT_REMINDER_GUEST", { listingTitle: "วิลล่า A", bookingId: "p1" });
    expect(n).toBe(1);
  });

  it("skips a row already claimed by a concurrent sweep (no notify)", async () => {
    findMany.mockResolvedValue([{ id: "p1", userId: "g1", listing: { title: "วิลล่า A" } }]);
    updateMany.mockResolvedValue({ count: 0 }); // lost the race

    const n = await sweepPaymentReminders(NOW);

    expect(notifyFn).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it("is a no-op when nothing is within the window", async () => {
    findMany.mockResolvedValue([]);
    expect(await sweepPaymentReminders(NOW)).toBe(0);
    expect(notifyFn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run src/lib/booking/sweeps.test.ts -t sweepPaymentReminders`
Expected: FAIL — `sweepPaymentReminders` not exported.

- [ ] **Step 3: Implement.** Add to `sweeps.ts`:

```ts
const PAY_REMINDER_LEAD_MS = 2 * HOUR_MS;

/**
 * AWAITING_PAYMENT with payBy within the next 2h and not yet reminded → nudge the
 * guest once (§6 "payment 2h left"). The CAS update on payReminderSentAt makes the
 * send fire exactly once even if two ticks overlap (count 0 = already claimed).
 */
export async function sweepPaymentReminders(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: {
      status: BookingStatus.AWAITING_PAYMENT,
      payReminderSentAt: null,
      payBy: { gt: now, lte: new Date(now.getTime() + PAY_REMINDER_LEAD_MS) },
    },
    select: { id: true, userId: true, listing: { select: { title: true } } },
  });
  let done = 0;
  for (const row of rows) {
    try {
      const claim = await prisma.booking.updateMany({
        where: { id: row.id, payReminderSentAt: null },
        data: { payReminderSentAt: now },
      });
      if (claim.count === 0) continue; // another tick already sent it
      await notify(row.userId, "PAYMENT_REMINDER_GUEST", { listingTitle: row.listing.title, bookingId: row.id });
      done++;
    } catch (err) {
      console.error(`[cron] pay reminder ${row.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run src/lib/booking/sweeps.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into the scheduler.** In `scheduler.ts`, add `sweepPaymentReminders` to the import block and a job entry after `overdue-payments`:

```ts
import {
  sweepDueCheckIns,
  sweepDueCheckouts,
  sweepOverduePayments,
  sweepOverdueRequests,
  sweepPaymentReminders,
} from "@/lib/booking/sweeps";
```

```ts
    ["overdue-payments", () => sweepOverduePayments(now)],
    ["payment-reminders", () => sweepPaymentReminders(now)],
```

- [ ] **Step 6: Verify typecheck + full sweeps test.**

Run: `pnpm typecheck && pnpm vitest run src/lib/booking/sweeps.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/booking/sweeps.ts src/lib/booking/sweeps.test.ts src/lib/jobs/scheduler.ts
git commit -m "feat(booking): payment 2h-left reminder sweep + scheduler wiring (#21)"
```

---

### Task 9: Pay-screen pure helpers

**Files:**
- Create: `src/app/[locale]/(protected)/trips/[bookingId]/pay/helpers.ts`, `…/pay/helpers.test.ts`

**Interfaces:**
- Produces: `confirmRedirectHref(status: string, bookingId: string): string | null` — `/trips/{id}` when CONFIRMED, else null (consumed by the poller, Task 11); `qrUrlFromCharge(charge): string | undefined` — extracts the QR download URL (consumed by the action, Task 10).

- [ ] **Step 1: Write the failing tests.** `helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { confirmRedirectHref, qrUrlFromCharge } from "./helpers";

describe("confirmRedirectHref", () => {
  it("returns the trip href once CONFIRMED", () => {
    expect(confirmRedirectHref("CONFIRMED", "bk1")).toBe("/trips/bk1");
  });
  it("returns null while still awaiting payment", () => {
    expect(confirmRedirectHref("AWAITING_PAYMENT", "bk1")).toBeNull();
  });
  it("also redirects on a terminal non-payable status (expired/cancelled) so the poller leaves the pay screen", () => {
    expect(confirmRedirectHref("EXPIRED", "bk1")).toBe("/trips/bk1");
  });
});

describe("qrUrlFromCharge", () => {
  it("pulls the PromptPay QR download uri", () => {
    expect(qrUrlFromCharge({ source: { scannable_code: { image: { download_uri: "https://x/qr.png" } } } })).toBe("https://x/qr.png");
  });
  it("is undefined when the charge has no QR", () => {
    expect(qrUrlFromCharge({ source: null })).toBeUndefined();
    expect(qrUrlFromCharge({})).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run "src/app/[locale]/(protected)/trips/[bookingId]/pay/helpers.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** `helpers.ts`:

```ts
import type { OpnCharge } from "@/lib/payments/opn";

/**
 * Where the poller should send the guest given the latest booking status.
 * CONFIRMED → the trip page (success). Any terminal non-payable status
 * (EXPIRED / cancelled) → also leave the pay screen back to the trip page.
 * AWAITING_PAYMENT → null (keep polling).
 */
export function confirmRedirectHref(status: string, bookingId: string): string | null {
  return status === "AWAITING_PAYMENT" ? null : `/trips/${bookingId}`;
}

/** The PromptPay QR image URL on an Opn charge, if present. */
export function qrUrlFromCharge(charge: Pick<OpnCharge, "source">): string | undefined {
  return charge.source?.scannable_code?.image?.download_uri;
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run "src/app/[locale]/(protected)/trips/[bookingId]/pay/helpers.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/[locale]/(protected)/trips/[bookingId]/pay/helpers.ts" "src/app/[locale]/(protected)/trips/[bookingId]/pay/helpers.test.ts"
git commit -m "feat(booking): pay-screen pure helpers (#21)"
```

---

### Task 10: Pay-screen server actions

**Files:**
- Create: `src/app/[locale]/(protected)/trips/[bookingId]/pay/actions.ts`, `…/pay/actions.test.ts`

**Interfaces:**
- Consumes: `requireUser`/`AuthError`; `createChargeForBooking`/`PaymentError`; `retrieveCharge`/`OpnError`; `qrUrlFromCharge` (Task 9); `prisma`.
- Produces:
  - `getPromptPayCharge(bookingId, { regenerate? }): Promise<PayResult<{ qrUrl: string; qrExpiresAt: string | null }>>`
  - `payWithCard(bookingId, token, returnUri): Promise<PayResult<{ authorizeUri?: string }>>`
  - `getBookingPaymentStatus(bookingId): Promise<PayResult<{ status: BookingStatus }>>`
  - `type PayResult<T> = ({ ok: true } & T) | { ok: false; error: string }`

- [ ] **Step 1: Write the failing tests.** `actions.test.ts` (mirror the request-flow `actions.test.ts` mock style — self-contained `AuthError`):

```ts
import { BookingStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/guards", () => {
  class AuthError extends Error {
    constructor(public readonly reason: string) { super(reason); this.name = "AuthError"; }
  }
  return { AuthError, requireUser: vi.fn() };
});
vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() }, payment: { findFirst: vi.fn() } } }));
vi.mock("@/lib/payments/charge", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/payments/charge")>();
  return { ...actual, createChargeForBooking: vi.fn() };
});
vi.mock("@/lib/payments/opn", () => ({ retrieveCharge: vi.fn(), OpnError: class OpnError extends Error {} }));

import { AuthError, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { createChargeForBooking } from "@/lib/payments/charge";
import { retrieveCharge } from "@/lib/payments/opn";

import { getBookingPaymentStatus, getPromptPayCharge, payWithCard } from "./actions";

const guard = requireUser as unknown as Mock;
const findBooking = prisma.booking.findUnique as unknown as Mock;
const findPayment = prisma.payment.findFirst as unknown as Mock;
const makeCharge = createChargeForBooking as unknown as Mock;
const fetchCharge = retrieveCharge as unknown as Mock;

const QR = { source: { scannable_code: { image: { download_uri: "https://x/qr.png" } } } };

beforeEach(() => {
  guard.mockResolvedValue({ id: "g1" });
  findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.AWAITING_PAYMENT });
});
afterEach(() => vi.clearAllMocks());

describe("getPromptPayCharge", () => {
  it("reuses a valid PENDING PromptPay charge (no new charge created)", async () => {
    findPayment.mockResolvedValue({ opnChargeId: "chrg_old", qrExpiresAt: new Date("2026-06-17T12:15:00Z") });
    fetchCharge.mockResolvedValue(QR);

    const res = await getPromptPayCharge("bk1");

    expect(makeCharge).not.toHaveBeenCalled();
    expect(fetchCharge).toHaveBeenCalledWith("chrg_old");
    expect(res).toEqual({ ok: true, qrUrl: "https://x/qr.png", qrExpiresAt: "2026-06-17T12:15:00.000Z" });
  });

  it("creates a fresh charge when none is reusable", async () => {
    findPayment.mockResolvedValue(null);
    makeCharge.mockResolvedValue({ payment: { qrExpiresAt: new Date("2026-06-17T12:30:00Z") }, charge: QR });

    const res = await getPromptPayCharge("bk1");

    expect(makeCharge).toHaveBeenCalledWith("bk1", PaymentMethod.PROMPTPAY);
    expect(res).toEqual({ ok: true, qrUrl: "https://x/qr.png", qrExpiresAt: "2026-06-17T12:30:00.000Z" });
  });

  it("regenerate skips reuse and creates a new charge", async () => {
    makeCharge.mockResolvedValue({ payment: { qrExpiresAt: null }, charge: QR });
    await getPromptPayCharge("bk1", { regenerate: true });
    expect(findPayment).not.toHaveBeenCalled();
    expect(makeCharge).toHaveBeenCalled();
  });

  it("rejects when the booking isn't owned by the caller", async () => {
    findBooking.mockResolvedValue({ userId: "someone-else", status: BookingStatus.AWAITING_PAYMENT });
    expect(await getPromptPayCharge("bk1")).toEqual({ ok: false, error: "errorNotFound" });
  });

  it("rejects when the booking is no longer awaiting payment", async () => {
    findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.CONFIRMED });
    expect(await getPromptPayCharge("bk1")).toEqual({ ok: false, error: "errorWrongState" });
  });

  it("maps an unauthenticated guard to errorUnauthenticated", async () => {
    guard.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    expect(await getPromptPayCharge("bk1")).toEqual({ ok: false, error: "errorUnauthenticated" });
  });
});

describe("payWithCard", () => {
  it("returns the 3DS authorizeUri when the charge requires authorization", async () => {
    makeCharge.mockResolvedValue({ payment: {}, charge: { authorize_uri: "https://opn/3ds" } });
    const res = await payWithCard("bk1", "tokn_1", "https://app/th/trips/bk1/pay");
    expect(makeCharge).toHaveBeenCalledWith("bk1", PaymentMethod.CARD, { cardToken: "tokn_1", returnUri: "https://app/th/trips/bk1/pay" });
    expect(res).toEqual({ ok: true, authorizeUri: "https://opn/3ds" });
  });

  it("returns ok with no authorizeUri for an immediate (non-3DS) charge", async () => {
    makeCharge.mockResolvedValue({ payment: {}, charge: { authorize_uri: null } });
    expect(await payWithCard("bk1", "tokn_1", "https://app/th/trips/bk1/pay")).toEqual({ ok: true });
  });

  it("rejects when not awaiting payment", async () => {
    findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.EXPIRED });
    expect(await payWithCard("bk1", "tokn_1", "https://app/th/trips/bk1/pay")).toEqual({ ok: false, error: "errorWrongState" });
  });
});

describe("getBookingPaymentStatus", () => {
  it("returns the status for the owner", async () => {
    findBooking.mockResolvedValue({ userId: "g1", status: BookingStatus.CONFIRMED });
    expect(await getBookingPaymentStatus("bk1")).toEqual({ ok: true, status: BookingStatus.CONFIRMED });
  });
  it("rejects a non-owner", async () => {
    findBooking.mockResolvedValue({ userId: "other", status: BookingStatus.AWAITING_PAYMENT });
    expect(await getBookingPaymentStatus("bk1")).toEqual({ ok: false, error: "errorNotFound" });
  });
});
```

Note: `getBookingPaymentStatus` does not require `AWAITING_PAYMENT` (it reports any status so the poller can see `CONFIRMED`), so it uses the lighter owner-only guard.

- [ ] **Step 2: Run to verify failure.**

Run: `pnpm vitest run "src/app/[locale]/(protected)/trips/[bookingId]/pay/actions.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** `actions.ts`:

```ts
"use server";

import { BookingStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

import { AuthError, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { createChargeForBooking, PaymentError } from "@/lib/payments/charge";
import { OpnError, retrieveCharge } from "@/lib/payments/opn";

import { qrUrlFromCharge } from "./helpers";

export type PayResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Owner check only — the caller may be any status (poller needs CONFIRMED/EXPIRED). */
async function ownerStatus(bookingId: string): Promise<PayResult<{ status: BookingStatus }>> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: "errorUnauthenticated" };
    throw err;
  }
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { userId: true, status: true } });
  if (!b || b.userId !== userId) return { ok: false, error: "errorNotFound" };
  return { ok: true, status: b.status };
}

/** Owner + must be AWAITING_PAYMENT (the charge actions). */
async function guardAwaiting(bookingId: string): Promise<PayResult> {
  const owned = await ownerStatus(bookingId);
  if (!owned.ok) return owned;
  if (owned.status !== BookingStatus.AWAITING_PAYMENT) return { ok: false, error: "errorWrongState" };
  return { ok: true };
}

function mapPayError(err: unknown): { ok: false; error: string } {
  if (err instanceof PaymentError) {
    return { ok: false, error: err.reason === "NOT_AWAITING_PAYMENT" ? "errorWrongState" : "errorPaymentFailed" };
  }
  if (err instanceof OpnError) return { ok: false, error: "errorPaymentFailed" };
  throw err; // unexpected (DB, etc.) — let it surface as a 500
}

export async function getPromptPayCharge(
  bookingId: string,
  opts: { regenerate?: boolean } = {},
): Promise<PayResult<{ qrUrl: string; qrExpiresAt: string | null }>> {
  const guard = await guardAwaiting(bookingId);
  if (!guard.ok) return guard;

  try {
    if (!opts.regenerate) {
      const existing = await prisma.payment.findFirst({
        where: {
          bookingId,
          method: PaymentMethod.PROMPTPAY,
          status: PaymentStatus.PENDING,
          qrExpiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const charge = await retrieveCharge(existing.opnChargeId);
        const qrUrl = qrUrlFromCharge(charge);
        if (qrUrl) return { ok: true, qrUrl, qrExpiresAt: existing.qrExpiresAt?.toISOString() ?? null };
      }
    }
    const { payment, charge } = await createChargeForBooking(bookingId, PaymentMethod.PROMPTPAY);
    const qrUrl = qrUrlFromCharge(charge);
    if (!qrUrl) return { ok: false, error: "errorPaymentFailed" };
    return { ok: true, qrUrl, qrExpiresAt: payment.qrExpiresAt?.toISOString() ?? null };
  } catch (err) {
    return mapPayError(err);
  }
}

export async function payWithCard(
  bookingId: string,
  token: string,
  returnUri: string,
): Promise<PayResult<{ authorizeUri?: string }>> {
  const guard = await guardAwaiting(bookingId);
  if (!guard.ok) return guard;
  try {
    const { charge } = await createChargeForBooking(bookingId, PaymentMethod.CARD, { cardToken: token, returnUri });
    return charge.authorize_uri ? { ok: true, authorizeUri: charge.authorize_uri } : { ok: true };
  } catch (err) {
    return mapPayError(err);
  }
}

export async function getBookingPaymentStatus(bookingId: string): Promise<PayResult<{ status: BookingStatus }>> {
  return ownerStatus(bookingId);
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run "src/app/[locale]/(protected)/trips/[bookingId]/pay/actions.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add "src/app/[locale]/(protected)/trips/[bookingId]/pay/actions.ts" "src/app/[locale]/(protected)/trips/[bookingId]/pay/actions.test.ts"
git commit -m "feat(booking): pay-screen server actions (promptpay/card/status) (#21)"
```

---

### Task 11: Pay-screen shell + PromptPay tab + poller + trip CTA + i18n

**Files:**
- Create: `…/pay/page.tsx`, `…/pay/promptpay-tab.tsx`, `…/pay/payment-poller.tsx`
- Modify: `src/app/[locale]/(protected)/trips/[bookingId]/page.tsx`, `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: `getPromptPayCharge`, `getBookingPaymentStatus` (Task 10); `confirmRedirectHref` (Task 9); `formatSatang`; `Link`/`useRouter`/`redirect` from `@/i18n/navigation`.

- [ ] **Step 1: Add i18n keys.** In `messages/th.json`, inside the existing `"Booking"` object, append:

```json
    "payTitle": "ชำระเงิน",
    "payCountdown": "ชำระเงินภายในเวลาที่กำหนดเพื่อยืนยันการจอง",
    "payEscrowNote": "เงินของคุณอยู่ในระบบรับฝากที่ปลอดภัย ปล่อยให้โฮสต์หลังเช็คเอาท์",
    "payRefundPromise": "ไม่ตรงตามประกาศ แจ้งก่อนเช็คเอาท์ คืนเงินเต็มจำนวน",
    "payTabPromptpay": "พร้อมเพย์ (QR)",
    "payTabCard": "บัตรเครดิต/เดบิต",
    "payScanQr": "สแกน QR นี้ด้วยแอปธนาคารเพื่อชำระเงิน",
    "payQrRegenerate": "สร้าง QR ใหม่",
    "payCardNumber": "หมายเลขบัตร",
    "payCardExpiry": "เดือน/ปี (MM/YY)",
    "payCardCvc": "CVC",
    "payCardName": "ชื่อบนบัตร",
    "payCardSubmit": "ชำระเงินด้วยบัตร",
    "payProcessing": "กำลังดำเนินการ…",
    "payCta": "ชำระเงินเลย",
    "errorPaymentFailed": "การชำระเงินล้มเหลว กรุณาลองใหม่หรือเปลี่ยนวิธีชำระเงิน",
    "errorWrongState": "การจองนี้ไม่อยู่ในขั้นตอนชำระเงินแล้ว",
    "errorNotFound": "ไม่พบการจอง",
    "errorUnauthenticated": "กรุณาเข้าสู่ระบบ"
```

In `messages/en.json`, the same keys with English values (e.g. `"payTitle": "Payment"`, `"payCta": "Pay now"`, `"payScanQr": "Scan this QR with your banking app to pay"`, `"errorPaymentFailed": "Payment failed — please try again or switch method"`, etc.). Keep keys identical to th.

- [ ] **Step 2: Add the trip-page CTA.** In `trips/[bookingId]/page.tsx`, import `Link` from `@/i18n/navigation` and, where `canWithdraw` is rendered, add the AWAITING_PAYMENT primary CTA above the withdraw button:

```tsx
        {booking.status === "AWAITING_PAYMENT" && (
          <Link
            href={`/trips/${booking.id}/pay`}
            className="rounded-card bg-coral-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-card transition hover:brightness-95"
          >
            {t("payCta")}
          </Link>
        )}
        {canWithdraw && <WithdrawButton bookingId={booking.id} />}
```

- [ ] **Step 3: Create the poller.** `payment-poller.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

import { useRouter } from "@/i18n/navigation";

import { getBookingPaymentStatus } from "./actions";
import { confirmRedirectHref } from "./helpers";

/** Polls booking status while the pay screen is open; redirects once it leaves AWAITING_PAYMENT. */
export function PaymentPoller({ bookingId, payByIso }: { bookingId: string; payByIso: string }) {
  const router = useRouter();
  const stopped = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (stopped.current) return;
      if (Date.now() > new Date(payByIso).getTime()) return; // window closed; the expiry sweep handles it
      const res = await getBookingPaymentStatus(bookingId);
      if (res.ok) {
        const href = confirmRedirectHref(res.status, bookingId);
        if (href) {
          stopped.current = true;
          router.replace(href);
          return;
        }
      }
    };
    const id = setInterval(() => void tick(), 4000);
    return () => clearInterval(id);
  }, [bookingId, payByIso, router]);

  return null;
}
```

- [ ] **Step 4: Create the PromptPay tab.** `promptpay-tab.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

import { getPromptPayCharge } from "./actions";

export function PromptPayTab({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(regenerate = false) {
    setLoading(true);
    setError(null);
    const res = await getPromptPayCharge(bookingId, { regenerate });
    if (res.ok) setQrUrl(res.qrUrl);
    else setError(t(res.error));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  return (
    <div className="flex flex-col items-center gap-3">
      {loading && <p className="text-sm text-ink-900/60">{t("payProcessing")}</p>}
      {qrUrl && !loading && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt="PromptPay QR" className="h-56 w-56 rounded-card border border-line" />
          <p className="text-sm text-ink-900/70">{t("payScanQr")}</p>
        </>
      )}
      {error && <p className="text-sm text-coral-600">{error}</p>}
      <Button variant="ghost" disabled={loading} onClick={() => void load(true)}>
        {t("payQrRegenerate")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Create the pay page shell.** `pay/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { formatSatang } from "@/lib/money";
import { env } from "@/lib/env";
import { redirect } from "@/i18n/navigation";

import { CardTab } from "./card-tab";
import { PaymentPoller } from "./payment-poller";
import { PromptPayTab } from "./promptpay-tab";

/** Guest payment screen (PRODUCT_FLOWS §3.2 step 3). PromptPay default + card tab; poller advances to the trip page on confirm. */
export default async function PayPage({ params }: { params: Promise<{ locale: string; bookingId: string }> }) {
  const [{ locale, bookingId }, user, t] = await Promise.all([params, requireUser(), getTranslations("Booking")]);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, status: true, totalSatang: true, payBy: true, listing: { select: { title: true } } },
  });
  if (!booking || booking.userId !== user.id || booking.status !== "AWAITING_PAYMENT" || !booking.payBy) {
    redirect({ href: `/trips/${bookingId}`, locale });
    return null;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col gap-5 bg-sand-50 px-4 py-8 md:px-6">
      <PaymentPoller bookingId={bookingId} payByIso={booking.payBy.toISOString()} />
      <div className="rounded-card bg-coral-500 px-4 py-3 text-white shadow-card">
        <p className="font-display text-lg">{t("payTitle")} · {formatSatang(booking.totalSatang)}</p>
        <p className="text-sm text-white/90">{t("payCountdown")}</p>
      </div>
      <PaymentTabs bookingId={bookingId} publicKey={env.OPN_PUBLIC_KEY} />
      <div className="rounded-card border border-line bg-white p-4 text-sm text-ink-900/70 shadow-card">
        <p>{t("payEscrowNote")}</p>
        <p className="mt-2 text-ink-900/90">{t("payRefundPromise")}</p>
      </div>
    </main>
  );
}

// Tab switcher lives in the page file (small, server-rendered shell delegating to client tabs).
import { PaymentTabs } from "./payment-tabs";
```

Then create the small client tab switcher `pay/payment-tabs.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { CardTab } from "./card-tab";
import { PromptPayTab } from "./promptpay-tab";

export function PaymentTabs({ bookingId, publicKey }: { bookingId: string; publicKey: string }) {
  const t = useTranslations("Booking");
  const [tab, setTab] = useState<"promptpay" | "card">("promptpay");
  return (
    <div className="rounded-card border border-line bg-white p-5 shadow-card">
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("promptpay")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "promptpay" ? "bg-ink-900 text-sand-50" : "text-ink-900/60"}`}
        >
          {t("payTabPromptpay")}
        </button>
        <button
          onClick={() => setTab("card")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === "card" ? "bg-ink-900 text-sand-50" : "text-ink-900/60"}`}
        >
          {t("payTabCard")}
        </button>
      </div>
      {tab === "promptpay" ? <PromptPayTab bookingId={bookingId} /> : <CardTab bookingId={bookingId} publicKey={publicKey} />}
    </div>
  );
}
```

(Move the `import { PaymentTabs }` to the top of `page.tsx` with the other imports — the inline import above is shown for clarity; place it correctly. Remove the unused `CardTab` import from `page.tsx` since the tabs file owns it.)

- [ ] **Step 6: Stub the card tab so the shell compiles.** Create a minimal `pay/card-tab.tsx` (Task 12 fills it in):

```tsx
"use client";

export function CardTab({ bookingId, publicKey }: { bookingId: string; publicKey: string }) {
  return <p className="text-sm text-ink-900/60" data-booking={bookingId} data-pk={publicKey ? "set" : "unset"} />;
}
```

- [ ] **Step 7: Verify typecheck + build (no unit tests — client glue).**

Run: `pnpm typecheck && pnpm build`
Expected: PASS; build output lists the new `/trips/[bookingId]/pay` route.

- [ ] **Step 8: Commit.**

```bash
git add "src/app/[locale]/(protected)/trips/[bookingId]/pay/page.tsx" "src/app/[locale]/(protected)/trips/[bookingId]/pay/payment-tabs.tsx" "src/app/[locale]/(protected)/trips/[bookingId]/pay/promptpay-tab.tsx" "src/app/[locale]/(protected)/trips/[bookingId]/pay/payment-poller.tsx" "src/app/[locale]/(protected)/trips/[bookingId]/pay/card-tab.tsx" "src/app/[locale]/(protected)/trips/[bookingId]/page.tsx" messages/th.json messages/en.json
git commit -m "feat(booking): pay screen shell + PromptPay tab + poller + trip CTA (#21)"
```

---

### Task 12: Card tab — omise.js tokenization + 3DS redirect

**Files:**
- Modify: `src/app/[locale]/(protected)/trips/[bookingId]/pay/card-tab.tsx`

**Interfaces:**
- Consumes: `payWithCard(bookingId, token, returnUri)` (Task 10); `omise.js` (loaded via `next/script`); `publicKey` prop.

- [ ] **Step 1: Implement the card tab.** Replace `card-tab.tsx`:

```tsx
"use client";

import { useState } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

import { payWithCard } from "./actions";

// Minimal shape of the global injected by omise.js.
interface OmiseGlobal {
  setPublicKey(key: string): void;
  createToken(
    kind: "card",
    data: { name: string; number: string; expiration_month: number; expiration_year: number; security_code: string },
    cb: (status: number, response: { id?: string; message?: string }) => void,
  ): void;
}
declare global {
  interface Window { Omise?: OmiseGlobal }
}

export function CardTab({ bookingId, publicKey }: { bookingId: string; publicKey: string }) {
  const t = useTranslations("Booking");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function tokenize(): Promise<string> {
    return new Promise((resolve, reject) => {
      const omise = window.Omise;
      if (!omise) return reject(new Error("omise.js not loaded"));
      omise.setPublicKey(publicKey);
      const [mm, yy] = exp.split("/");
      omise.createToken(
        "card",
        { name, number: number.replace(/\s/g, ""), expiration_month: Number(mm), expiration_year: 2000 + Number(yy), security_code: cvc },
        (status, res) => (status === 200 && res.id ? resolve(res.id) : reject(new Error(res.message ?? "tokenize failed"))),
      );
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const token = await tokenize();
      const returnUri = `${window.location.origin}${window.location.pathname}`;
      const res = await payWithCard(bookingId, token, returnUri);
      if (!res.ok) setError(t(res.error));
      else if (res.authorizeUri) window.location.href = res.authorizeUri; // 3DS — poller resumes on return
      // non-3DS success: the poller advances on the webhook confirm
    } catch {
      setError(t("errorPaymentFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Script src="https://cdn.omise.co/omise.js" strategy="afterInteractive" />
      <input className="rounded-card border border-line px-3 py-2 text-sm" placeholder={t("payCardNumber")} value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" />
      <div className="flex gap-2">
        <input className="w-1/2 rounded-card border border-line px-3 py-2 text-sm" placeholder={t("payCardExpiry")} value={exp} onChange={(e) => setExp(e.target.value)} />
        <input className="w-1/2 rounded-card border border-line px-3 py-2 text-sm" placeholder={t("payCardCvc")} value={cvc} onChange={(e) => setCvc(e.target.value)} inputMode="numeric" />
      </div>
      <input className="rounded-card border border-line px-3 py-2 text-sm" placeholder={t("payCardName")} value={name} onChange={(e) => setName(e.target.value)} />
      {error && <p className="text-sm text-coral-600">{error}</p>}
      <Button variant="primary" disabled={busy} onClick={() => void submit()}>
        {busy ? t("payProcessing") : t("payCardSubmit")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint + build.**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS; `/trips/[bookingId]/pay` route still compiles.

- [ ] **Step 3: Commit.**

```bash
git add "src/app/[locale]/(protected)/trips/[bookingId]/pay/card-tab.tsx"
git commit -m "feat(booking): card tab — omise.js tokenization + 3DS redirect (#21)"
```

---

### Task 13: Full gate + branch verification

- [ ] **Step 1: Run the complete PR gate.**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status`
Expected: all PASS; lint shows only the pre-existing #60 warnings; `gate:status` reports no direct status writes.

- [ ] **Step 2: Confirm the production build compiles all routes.**

Run: `pnpm build`
Expected: build succeeds and lists `/[locale]/(protected)/trips/[bookingId]/pay`.

- [ ] **Step 3:** Proceed to the finishing-a-development-branch flow (final review → PR `Closes #21`).

## Self-Review

**Spec coverage:** §A pay screen → Tasks 10–12; §A actions → Task 10; §B opn/charge card 3DS → Tasks 3–4; §C `freshlyConfirmed` → Task 5 + applied in Task 6; §D templates → Task 2, triggers → Tasks 6 (received G+H), 7 (expired host), 8 (reminder); §E schema → Task 1; trip CTA → Task 11; testing → unit tasks throughout + Task 13 gate. E2E (#29) explicitly out of scope. All spec sections map to a task.

**Placeholder scan:** No TBD/TODO; every code step shows real code; the card-tab stub in Task 11 is intentional scaffolding completed in Task 12 (noted).

**Type consistency:** `PayResult<T>` shape consistent across actions; `getPromptPayCharge`/`payWithCard`/`getBookingPaymentStatus` signatures match between Task 10 interfaces, tests, and Task 11/12 callers; `confirmFromWebhook` `{ booking, freshlyConfirmed }` consistent between Tasks 5 and 6; `qrUrlFromCharge`/`confirmRedirectHref` names match between Task 9 and Tasks 10/11; template keys identical across Tasks 2/6/7/8.
