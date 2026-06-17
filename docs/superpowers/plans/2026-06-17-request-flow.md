# Request Creation + Host Accept/Decline (#21 request-half) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in + phone-verified guest sends a booking request (with an intro note) against a PUBLISHED REQUEST-mode listing; the host accepts/declines within 12h; every transition notifies; expiry is swept by the existing cron. No money moves (payment is #21b).

**Architecture:** Thin server actions (`ActionResult` pattern) wrap the existing `lib/booking` transitions + `buildQuote` snapshot + `lib/notifications`. Dedicated routes render the flow (request-confirm → guest status → host inbox). Contact stays masked via a new helper until CONFIRMED (#21b).

**Tech Stack:** Next.js App Router (server components + client forms), Prisma, Vitest, next-intl.

## Global Constraints

- **Money is integer satang** via `lib/money.ts`; quote built by `buildQuote` (no re-implementation). (rule 1)
- **Booking status transitions only via `lib/booking`** — actions call `request`/`accept`/`decline`/`cancelByGuest`, never write `status` (rule 2; `gate:status`).
- **Timestamps UTC**; deadlines (`respondBy`) are DB rows swept by cron (rule 3).
- **`src/lib/env.ts` unchanged** (no new env). Schema change is **additive** + `docs/DATA_MODEL.md` first + @AokDesu integrates (shared-file protocol).
- **Thai-first i18n** — all strings in `messages/th.json` (source) + `en.json`, under `Booking.*` / `Host.*`; use `Link`/`useRouter` from `@/i18n/navigation` (rule 7).
- **Design tokens only** — compose `src/components/ui/` primitives; no invented hex (rule 8).
- Auth ladder: `requirePhoneVerified()` to send a request; `requireHostEligible()` + ownership for host actions (`src/lib/auth/guards.ts`).
- Mock pattern: `vi.mock("@/lib/db")` + `vi.mock` the lib modules — mirror `src/lib/booking/transitions.test.ts`.

---

### Task 1: Schema — `guestNoteToHost`

**Files:**
- Modify: `docs/DATA_MODEL.md` (document the field first)
- Modify: `prisma/schema.prisma` (Booking model)
- Create: migration via `pnpm db:migrate`

- [ ] **Step 1: Document in `docs/DATA_MODEL.md`** — under the Booking model, add a line:

```
- `guestNoteToHost String?` — guest's free-text intro shown to the host on the request (PRODUCT_FLOWS §3.2 step 1). Snapshotted at request time; never edited after.
```

- [ ] **Step 2: Add the field to `prisma/schema.prisma`** — in `model Booking`, next to the snapshot block (`houseRulesText`):

```prisma
  houseRulesText  String?
  guestNoteToHost String?
```

- [ ] **Step 3: Create the migration**

Run: `pnpm db:up && pnpm db:migrate --name booking_guest_note`
Expected: a new `prisma/migrations/<ts>_booking_guest_note/migration.sql` adding the nullable column; `prisma generate` runs.

- [ ] **Step 4: Verify typecheck (client regenerated with the new field)**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/DATA_MODEL.md prisma/schema.prisma prisma/migrations
git commit -m "feat(booking): add Booking.guestNoteToHost (#65)"
```

---

### Task 2: Notification templates (REQUEST_ACCEPTED / DECLINED / EXPIRED)

**Files:**
- Modify: `src/lib/notifications/templates.ts`
- Modify: `src/lib/notifications/templates.test.ts`

**Interfaces:**
- Produces: template keys `REQUEST_ACCEPTED`, `REQUEST_DECLINED`, `REQUEST_EXPIRED` in the registry.

- [ ] **Step 1: Write the failing test** (append to `templates.test.ts`):

```typescript
describe("request lifecycle templates", () => {
  it("renders REQUEST_ACCEPTED (priority) — guest gets pay prompt", () => {
    const t = getTemplate("REQUEST_ACCEPTED");
    expect(t?.priority).toBe(true);
    expect(t?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
    expect(t?.email({ listingTitle: "วิลล่า A" }).subject).toContain("ยืนยัน");
  });
  it("renders REQUEST_DECLINED + REQUEST_EXPIRED", () => {
    expect(getTemplate("REQUEST_DECLINED")?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
    expect(getTemplate("REQUEST_EXPIRED")?.line({ listingTitle: "วิลล่า A" })).toContain("วิลล่า A");
  });
});
```

- [ ] **Step 2: Run → FAIL** — `pnpm test src/lib/notifications/templates.test.ts` (keys undefined).

- [ ] **Step 3: Add the templates** to the `templates` record in `templates.ts`:

```typescript
  REQUEST_ACCEPTED: {
    priority: true,
    email: (p) => ({
      subject: `โฮสต์ยืนยันแล้ว — ชำระเงินเพื่อยืนยันการจอง ${str(p.listingTitle)}`,
      body: `โฮสต์ยืนยันคำขอจอง ${str(p.listingTitle)} แล้ว กรุณาชำระเงินภายใน 12 ชั่วโมงเพื่อยืนยันการจอง`,
    }),
    line: (p) => `✅ โฮสต์ยืนยัน ${str(p.listingTitle)} แล้ว — ชำระเงินภายใน 12 ชม. เพื่อยืนยันการจอง`,
  },
  REQUEST_DECLINED: {
    priority: false,
    email: (p) => ({
      subject: `คำขอจอง ${str(p.listingTitle)} ไม่ได้รับการยืนยัน`,
      body: `ขออภัย โฮสต์ไม่สามารถรับคำขอจอง ${str(p.listingTitle)} ได้ ลองค้นหาที่พักอื่นที่ว่างในช่วงเวลาเดียวกันได้เลย`,
    }),
    line: (p) => `คำขอจอง ${str(p.listingTitle)} ไม่ได้รับการยืนยัน — ลองดูที่พักอื่นที่ว่างนะคะ`,
  },
  REQUEST_EXPIRED: {
    priority: false,
    email: (p) => ({
      subject: `คำขอจอง ${str(p.listingTitle)} หมดเวลา`,
      body: `คำขอจอง ${str(p.listingTitle)} หมดเวลารอโฮสต์ยืนยัน (12 ชั่วโมง) ลองส่งคำขอใหม่หรือเลือกที่พักอื่นได้เลย`,
    }),
    line: (p) => `⏰ คำขอจอง ${str(p.listingTitle)} หมดเวลารอโฮสต์ — ลองส่งใหม่หรือดูที่พักอื่นนะคะ`,
  },
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(notifications): request lifecycle templates (#65)`.

---

### Task 3: Contact masking helper

**Files:**
- Create: `src/lib/booking/contact.ts`
- Test: `src/lib/booking/contact.test.ts`

**Interfaces:**
- Produces: `maskedContact(unmaskedAt: Date | null, contact: { email: string | null; phone: string | null }): { email: string | null; phone: string | null }`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/booking/contact.test.ts
import { describe, expect, it } from "vitest";
import { maskedContact } from "./contact";

describe("maskedContact", () => {
  it("hides contact until contactUnmaskedAt is set", () => {
    expect(maskedContact(null, { email: "g@x.com", phone: "0812345678" })).toEqual({ email: null, phone: null });
  });
  it("reveals contact once unmasked (CONFIRMED)", () => {
    const c = { email: "g@x.com", phone: "0812345678" };
    expect(maskedContact(new Date(), c)).toEqual(c);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```typescript
// src/lib/booking/contact.ts
/**
 * Contact info is hidden between guest and host until the booking is CONFIRMED
 * (payment succeeded → `Booking.contactUnmaskedAt` set, #21b). Before that, the
 * UI shows masked placeholders. Single source of truth for that gate.
 */
interface Contact {
  email: string | null;
  phone: string | null;
}

export function maskedContact(unmaskedAt: Date | null, contact: Contact): Contact {
  if (unmaskedAt) return contact;
  return { email: null, phone: null };
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(booking): contact-masking helper (#65)`.

---

### Task 4: `createBookingRequest` action

**Files:**
- Create: `src/app/[locale]/listings/[id]/request/actions.ts`
- Test: `src/app/[locale]/listings/[id]/request/actions.test.ts`

**Interfaces:**
- Consumes: `requirePhoneVerified` (`@/lib/auth/guards`), `buildQuote` (`@/lib/pricing/quote`), `request` (`@/lib/booking/transitions`), `notify` (`@/lib/notifications`), `prisma` (listing fetch).
- Produces: `createBookingRequest(input): Promise<ActionResult<{ bookingId: string }>>` where `input = { listingId, checkIn, checkOut, guests, note }` (strings + number).

- [ ] **Step 1: Write the failing test** (mock prisma + the libs; mirror saved/actions + transitions tests)

```typescript
// src/app/[locale]/listings/[id]/request/actions.test.ts
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { listing: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/guards", () => ({ requirePhoneVerified: vi.fn() }));
vi.mock("@/lib/booking/transitions", async (orig) => ({ ...(await orig<typeof import("@/lib/booking/transitions")>()), request: vi.fn() }));
vi.mock("@/lib/pricing/quote", () => ({ buildQuote: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { requirePhoneVerified } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { buildQuote } from "@/lib/pricing/quote";
import { request } from "@/lib/booking/transitions";

import { createBookingRequest } from "./actions";

const guard = requirePhoneVerified as unknown as Mock;
const findListing = prisma.listing.findUnique as unknown as Mock;
const quote = buildQuote as unknown as Mock;
const requestFn = request as unknown as Mock;
const notifyFn = notify as unknown as Mock;

const INPUT = { listingId: "l1", checkIn: "2026-07-01", checkOut: "2026-07-03", guests: 4, note: "ครอบครัว" };

beforeEach(() => {
  guard.mockResolvedValue({ id: "guest1" });
  findListing.mockResolvedValue({
    id: "l1", status: "PUBLISHED", bookingMode: "REQUEST", hostId: "host1",
    houseRulesText: "no parties", cancellationTier: "MODERATE",
    baseWeekdaySatang: 1_000_00, baseWeekendSatang: 1_000_00, holidaySatang: 1_000_00,
    includedGuests: 6, extraGuestFeeSatang: 0, seasons: [],
  });
  quote.mockReturnValue({ nights: [], totalSatang: 2_000_00, commissionSatang: 200_00 });
  requestFn.mockResolvedValue({ id: "bk1" });
  notifyFn.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("createBookingRequest", () => {
  it("snapshots the quote, creates a REQUESTED booking, and notifies the host", async () => {
    const res = await createBookingRequest(INPUT);
    expect(guard).toHaveBeenCalled();
    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: "l1", userId: "guest1", totalSatang: 2_000_00, commissionSatang: 200_00,
        cancellationTier: "MODERATE", houseRulesText: "no parties", guestNoteToHost: "ครอบครัว",
      }),
      expect.any(Date),
    );
    expect(notifyFn).toHaveBeenCalledWith("host1", "BOOKING_REQUESTED", expect.any(Object));
    expect(res).toEqual({ ok: true, bookingId: "bk1" });
  });

  it("rejects a non-PUBLISHED or non-REQUEST listing", async () => {
    findListing.mockResolvedValue({ id: "l1", status: "DRAFT", bookingMode: "REQUEST" });
    expect(await createBookingRequest(INPUT)).toEqual({ ok: false, error: "errorUnavailable" });
    expect(requestFn).not.toHaveBeenCalled();
  });

  it("maps the double-booking exclusion to errorDatesTaken", async () => {
    requestFn.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("x", { code: "P2010", clientVersion: "6" }));
    expect(await createBookingRequest(INPUT)).toEqual({ ok: false, error: "errorDatesTaken" });
  });

  it("surfaces the auth ladder as a redirectable error", async () => {
    const { AuthError } = await vi.importActual<typeof import("@/lib/auth/guards")>("@/lib/auth/guards");
    guard.mockRejectedValue(new AuthError("PHONE_UNVERIFIED"));
    expect(await createBookingRequest(INPUT)).toEqual({ ok: false, error: "errorPhoneUnverified" });
  });
});
```

- [ ] **Step 2: Run → FAIL** (`./actions` missing).

- [ ] **Step 3: Implement** `src/app/[locale]/listings/[id]/request/actions.ts`:

```typescript
"use server";

import { Prisma } from "@prisma/client";

import { AuthError, requirePhoneVerified } from "@/lib/auth/guards";
import { request } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { buildQuote } from "@/lib/pricing/quote";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface RequestInput {
  listingId: string;
  checkIn: string; // 'YYYY-MM-DD'
  checkOut: string;
  guests: number;
  note: string;
}

export async function createBookingRequest(input: RequestInput): Promise<ActionResult<{ bookingId: string }>> {
  let userId: string;
  try {
    const user = await requirePhoneVerified();
    userId = user.id;
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: err.reason === "PHONE_UNVERIFIED" ? "errorPhoneUnverified" : "errorUnauthenticated" };
    }
    throw err;
  }

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { seasons: true },
  });
  if (!listing || listing.status !== "PUBLISHED" || listing.bookingMode !== "REQUEST") {
    return { ok: false, error: "errorUnavailable" };
  }

  const quote = buildQuote({
    config: {
      baseWeekdaySatang: listing.baseWeekdaySatang,
      baseWeekendSatang: listing.baseWeekendSatang,
      holidaySatang: listing.holidaySatang,
      includedGuests: listing.includedGuests,
      extraGuestFeeSatang: listing.extraGuestFeeSatang,
    },
    seasons: listing.seasons,
    holidays: new Set<string>(),
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
  });

  try {
    const booking = await request(
      {
        listingId: listing.id,
        userId,
        checkIn: new Date(input.checkIn),
        checkOut: new Date(input.checkOut),
        priceLines: quote.nights as unknown as Prisma.InputJsonValue,
        totalSatang: quote.totalSatang,
        commissionSatang: quote.commissionSatang,
        cancellationTier: listing.cancellationTier,
        houseRulesText: listing.houseRulesText,
        guestNoteToHost: input.note || null,
      },
      new Date(),
    );
    await notify(listing.hostId, "BOOKING_REQUESTED", {
      listingTitle: listing.title,
      guestName: "", // filled from the user in a follow-up; host sees note + dates regardless
      bookingId: booking.id,
    });
    return { ok: true, bookingId: booking.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, error: "errorDatesTaken" };
    throw err;
  }
}
```

> **Note for the implementer:** `BookingDraft` does not yet include `guestNoteToHost` — Task 1 adds the column; also add `guestNoteToHost?: string | null` to the `BookingDraft` interface and `createData()` in `src/lib/booking/transitions.ts` so `request()` persists it. Do that in this task (it's the consumer). Add a one-line test in `transitions.test.ts` asserting `create` receives `guestNoteToHost`.

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(booking): createBookingRequest action + guestNoteToHost wiring (#65)`.

---

### Task 5: Host accept/decline + guest withdraw actions

**Files:**
- Create: `src/app/[locale]/(protected)/(host)/requests/actions.ts`
- Test: `src/app/[locale]/(protected)/(host)/requests/actions.test.ts`

**Interfaces:**
- Consumes: `accept`/`decline` (`@/lib/booking/transitions`), `cancelByGuest`, `requireHostEligible`/`requireUser` (`@/lib/auth/guards`), `notify`, `prisma` (to read guestId/listingTitle for the notification).
- Produces: `acceptRequest(bookingId)`, `declineRequest(bookingId)`, `withdrawRequest(bookingId): Promise<ActionResult>`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/[locale]/(protected)/(host)/requests/actions.test.ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/guards", () => ({ requireHostEligible: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/booking/transitions", async (o) => ({ ...(await o<typeof import("@/lib/booking/transitions")>()), accept: vi.fn(), decline: vi.fn(), cancelByGuest: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { requireHostEligible, requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { accept, decline } from "@/lib/booking/transitions";

import { acceptRequest, declineRequest } from "./actions";

const hostGuard = requireHostEligible as unknown as Mock;
const findBooking = prisma.booking.findUnique as unknown as Mock;

beforeEach(() => {
  hostGuard.mockResolvedValue({ id: "host1" });
  (requireUser as unknown as Mock).mockResolvedValue({ id: "guest1" });
  findBooking.mockResolvedValue({ id: "bk1", userId: "guest1", listing: { title: "วิลล่า A" } });
  (accept as unknown as Mock).mockResolvedValue({ id: "bk1" });
  (decline as unknown as Mock).mockResolvedValue({ id: "bk1" });
  (notify as unknown as Mock).mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("host request actions", () => {
  it("accept → accept() + notifies the guest", async () => {
    const res = await acceptRequest("bk1");
    expect(accept).toHaveBeenCalledWith("bk1", "host1", expect.any(Date));
    expect(notify).toHaveBeenCalledWith("guest1", "REQUEST_ACCEPTED", expect.objectContaining({ listingTitle: "วิลล่า A" }));
    expect(res).toEqual({ ok: true });
  });
  it("decline → decline() + notifies the guest", async () => {
    await declineRequest("bk1");
    expect(decline).toHaveBeenCalledWith("bk1", "host1");
    expect(notify).toHaveBeenCalledWith("guest1", "REQUEST_DECLINED", expect.objectContaining({ listingTitle: "วิลล่า A" }));
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `requests/actions.ts`:

```typescript
"use server";

import { requireHostEligible, requireUser } from "@/lib/auth/guards";
import { accept, BookingError, cancelByGuest, decline } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function loadGuestAndTitle(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { listing: { select: { title: true } } } });
  return { guestId: b?.userId ?? null, listingTitle: b?.listing.title ?? "" };
}

function mapErr(err: unknown): ActionResult {
  if (err instanceof BookingError) {
    return { ok: false, error: err.reason === "NOT_HOST" || err.reason === "NOT_GUEST" ? "errorNotOwner" : "errorWrongState" };
  }
  throw err;
}

export async function acceptRequest(bookingId: string): Promise<ActionResult> {
  try {
    const host = await requireHostEligible();
    await accept(bookingId, host.id, new Date());
    const { guestId, listingTitle } = await loadGuestAndTitle(bookingId);
    if (guestId) await notify(guestId, "REQUEST_ACCEPTED", { listingTitle, bookingId });
    return { ok: true };
  } catch (err) {
    return mapErr(err);
  }
}

export async function declineRequest(bookingId: string): Promise<ActionResult> {
  try {
    const host = await requireHostEligible();
    await decline(bookingId, host.id);
    const { guestId, listingTitle } = await loadGuestAndTitle(bookingId);
    if (guestId) await notify(guestId, "REQUEST_DECLINED", { listingTitle, bookingId });
    return { ok: true };
  } catch (err) {
    return mapErr(err);
  }
}

export async function withdrawRequest(bookingId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await cancelByGuest(bookingId, user.id, new Date());
    return { ok: true };
  } catch (err) {
    return mapErr(err);
  }
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(booking): host accept/decline + withdraw actions (#65)`.

---

### Task 6: Request-expiry notification in the cron sweep

**Files:**
- Modify: `src/lib/booking/sweeps.ts` (`sweepOverdueRequests`)
- Modify: `src/lib/booking/sweeps.test.ts`

- [ ] **Step 1: Write the failing test** (extend the `sweepOverdueRequests` describe — add a `notify` mock):

```typescript
// add at top of sweeps.test.ts:
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
import { notify } from "@/lib/notifications";

// new test inside describe("sweepOverdueRequests"):
it("notifies the guest after expiring an overdue request", async () => {
  // expire() (mocked) returns the expired booking with guest + listing title
  (expire as unknown as Mock).mockResolvedValue({ id: "b1", userId: "guest1", listing: { title: "วิลล่า A" } });
  findMany.mockResolvedValue([{ id: "b1" }]);
  await sweepOverdueRequests(NOW);
  expect(notify).toHaveBeenCalledWith("guest1", "REQUEST_EXPIRED", expect.objectContaining({ listingTitle: "วิลล่า A" }));
});
```

> The current `forEachRow` discards the transition's return value. To notify, `sweepOverdueRequests` must call `expire` directly and read its result. Refactor just that sweep (keep `forEachRow` for the others).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — replace `sweepOverdueRequests` in `sweeps.ts`:

```typescript
import { notify } from "@/lib/notifications";
// ...
/** REQUESTED past respondBy → EXPIRED, then notify the guest. */
export async function sweepOverdueRequests(now: Date): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { status: BookingStatus.REQUESTED, respondBy: { lt: now } },
    select: { id: true },
  });
  let done = 0;
  for (const { id } of rows) {
    try {
      const booking = await expire(id, now);
      await notify(booking.userId, "REQUEST_EXPIRED", {
        listingTitle: (booking as { listing?: { title?: string } }).listing?.title ?? "",
        bookingId: booking.id,
      });
      done++;
    } catch (err) {
      console.error(`[cron] expire request ${id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return done;
}
```

> `expire()` returns a `Booking` without the listing relation. Add `include: { listing: { select: { title: true } } }` to `expire`'s final `update` in `transitions.ts` (it already loads the booking; widen the return), OR fetch the title in the sweep before expiring. Choose the sweep-side fetch to avoid touching `expire`: load `{ userId, listing: { title } }` for the id, then `expire`, then `notify`. Update the test's mock accordingly (findUnique). Keep `expire` untouched.

- [ ] **Step 4: Run → PASS** (`pnpm test src/lib/booking/sweeps.test.ts`). **Step 5: Commit** `feat(booking): notify guest on request-expiry sweep (#65)`.

---

### Task 7: Request-confirm screen + wire BookingCard CTA

**Files:**
- Create: `src/app/[locale]/listings/[id]/request/page.tsx` (server component)
- Create: `src/app/[locale]/listings/[id]/request/request-form.tsx` (client)
- Modify: `src/components/ui/BookingCard.tsx` (wire the request CTA to navigate)
- Modify: `messages/th.json` + `messages/en.json` (`Booking.request.*`)

- [ ] **Step 1: i18n keys** — add a `Booking.request` section to both files (th source, en mirror):

```json
"Booking": {
  "request": {
    "title": "ตรวจสอบคำขอจอง",
    "noteLabel": "ข้อความถึงโฮสต์ (ไม่บังคับ)",
    "notePlaceholder": "มากันกี่คน มาทำอะไร…",
    "houseRules": "ฉันยอมรับกฎของที่พัก",
    "submit": "ส่งคำขอจอง",
    "errorUnavailable": "ที่พักนี้ไม่เปิดรับคำขอจองในขณะนี้",
    "errorDatesTaken": "วันที่เลือกถูกจองแล้ว กรุณาเลือกวันอื่น",
    "errorPhoneUnverified": "กรุณายืนยันเบอร์โทรก่อนส่งคำขอจอง",
    "errorUnauthenticated": "กรุณาเข้าสู่ระบบก่อนส่งคำขอจอง",
    "errorGeneric": "เกิดข้อผิดพลาด กรุณาลองใหม่"
  }
}
```

- [ ] **Step 2: Server component** `request/page.tsx` — loads the listing + recomputes the quote from `searchParams` (`checkIn`/`checkOut`/`guests`), renders the summary (`PriceBreakdown`) + `<RequestForm/>`. (Reuse the same `buildQuote` inputs as the action.) If params missing/invalid → redirect back to the listing.

- [ ] **Step 3: Client form** `request-form.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createBookingRequest } from "./actions";

export function RequestForm(props: { listingId: string; checkIn: string; checkOut: string; guests: number }) {
  const t = useTranslations("Booking.request");
  const router = useRouter();
  const [note, setNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await createBookingRequest({ ...props, note });
      if (res.ok) router.push(`/trips/${res.bookingId}`);
      else if (res.error === "errorPhoneUnverified" || res.error === "errorUnauthenticated") router.push("/verify-phone");
      else setError(res.error);
    });
  }
  // textarea(note) + house-rules checkbox(agreed) + submit button (disabled unless agreed/!pending)
  // render {error && t(error)}; button label t("submit"); compose ui/ primitives (Button, Textarea, Checkbox).
}
```

- [ ] **Step 4: Wire `BookingCard` CTA** — its request button calls `useRouter().push(`/listings/${listingId}/request?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`)` (it already holds the selected dates/guests). Keep the instant CTA untouched (that's #22).

- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm lint`; manual: `pnpm dev` → listing → select dates → "ส่งคำขอจอง" → request page → submit → lands on `/trips/{id}`. **Commit** `feat(booking): request-confirm screen + BookingCard CTA (#65)`.

---

### Task 8: Guest booking-status page (`/trips/[bookingId]`)

**Files:**
- Create: `src/app/[locale]/(protected)/trips/[bookingId]/page.tsx` (server component)
- Create: `src/app/[locale]/(protected)/trips/[bookingId]/withdraw-button.tsx` (client)
- Modify: `messages/{th,en}.json` (`Booking.status.*`)

- [ ] **Step 1: i18n** — `Booking.status` keys: `awaitingHost`, `respondBy`, `withdraw`, `withdrawn`, `contactMasked` ("ติดต่อได้หลังยืนยันการจอง").
- [ ] **Step 2: Server component** — `requireUser()`, load the booking (owned by the user), render `StatusPill` + the `respondBy` countdown (a small client countdown component or server-rendered "เหลือ ~Xh") + masked host contact via `maskedContact(booking.contactUnmaskedAt, host)` + `<WithdrawButton/>` when status is REQUESTED/AWAITING_PAYMENT. 404 if not the guest's booking.
- [ ] **Step 3: Client `withdraw-button.tsx`** — `useTransition` → `withdrawRequest(bookingId)` → `router.refresh()` on success.
- [ ] **Step 4: Verify** `pnpm typecheck && pnpm lint`; manual: visit `/trips/{id}` as the guest → see REQUESTED + countdown + masked contact + withdraw works. **Commit** `feat(booking): guest booking-status page (#65)`.

---

### Task 9: Host requests inbox (`/(host)/requests`)

**Files:**
- Create: `src/app/[locale]/(protected)/(host)/requests/page.tsx` (server component)
- Create: `src/app/[locale]/(protected)/(host)/requests/request-actions.tsx` (client accept/decline buttons)
- Modify: `src/app/[locale]/(protected)/(host)/host-nav.tsx` (enable the `requests` tab)
- Modify: `messages/{th,en}.json` (`Host.requests.*`)

- [ ] **Step 1: i18n** — `Host.requests` keys: `title`, `empty`, `accept`, `decline`, `respondBy`, `guestNote`, `contactMasked`.
- [ ] **Step 2: Server component** — `requireHostEligible()`, load REQUESTED bookings whose `listing.hostId === host.id` (`prisma.booking.findMany({ where: { status: "REQUESTED", listing: { hostId } }, include: { listing, user } })`), ordered by `respondBy` asc; render each as a card: listing title, dates, guests, quote total (`formatSatang`), `guestNoteToHost`, masked guest contact (`maskedContact`), `respondBy` countdown, `<RequestActions bookingId/>`. Empty-state when none.
- [ ] **Step 3: Client `request-actions.tsx`** — two buttons → `acceptRequest`/`declineRequest` via `useTransition` → `router.refresh()`.
- [ ] **Step 4: Enable nav** — in `host-nav.tsx`, move `"requests"` out of `SOON_TABS` into the active tabs (route `/requests`).
- [ ] **Step 5: Verify** — `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status`; manual: as host, `/requests` lists the seeded request → accept moves it to AWAITING_PAYMENT (guest notified in console driver). **Commit** `feat(host): requests inbox + enable nav tab (#65)`.

---

## Self-review
- **Spec coverage:** schema `guestNoteToHost` (T1) ✓; templates (T2) ✓; masking helper (T3) ✓; `createBookingRequest` snapshot+notify+exclusion-map (T4) ✓; accept/decline/withdraw (T5) ✓; expiry-notify (T6) ✓; request-confirm screen + CTA (T7) ✓; guest status page (T8) ✓; host inbox + nav (T9) ✓; auth ladder enforced (T4/T5) ✓; contact masked (T3 used in T8/T9) ✓.
- **Placeholders:** UI tasks (T7–T9) describe components by composition + give the client-logic code (forms, transitions) in full; the server components are data-load + compose existing `ui/` primitives (`PriceBreakdown`, `StatusPill`, `Button`) — no new logic to test beyond the actions (already TDD'd in T4–T6). RTL tests only where logic lives (CLAUDE.md) — the forms' submit/redirect logic is covered via the action tests; add an RTL test for the form only if review wants it.
- **Type consistency:** `ActionResult` shape, `createBookingRequest(input)→{bookingId}`, `accept/declineRequest(bookingId)`, `maskedContact(unmaskedAt, contact)`, template keys `REQUEST_ACCEPTED/DECLINED/EXPIRED`, `BookingDraft.guestNoteToHost` — consistent across tasks.

## Verification (end-to-end)
1. `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status` — green.
2. `pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev` — request a seeded REQUEST villa → host inbox accept → booking AWAITING_PAYMENT; decline/withdraw/expiry paths fire console-driver notifications.
3. Open PR `feat/65-request-flow` → main, `Closes #65`, `area:booking` + `M3`. @AokDesu integrates the migration + squash-merges. (#21b — payment — follows.)
