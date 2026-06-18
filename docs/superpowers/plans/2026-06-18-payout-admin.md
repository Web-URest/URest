# Payout Admin Operations (#25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The admin payout surface (§5.2): a due list of RELEASABLE bookings grouped by host account, an audited single decryption path for the bank account number, mark-paid (ledger RELEASABLE→PAID + slip ref + host notify), booking/host-scope holds, and a reconciliation gate (live Opn balance vs ledger) that blocks payouts on a solvency mismatch.

**Architecture:** A `lib/admin/payout.ts` coordinator over the existing escrow ledger (`payout`, `Buckets`/`foldMove`), `crypto.decryptField`, and the admin auth/console/AuditLog patterns from #70. Mark-paid uses the **interactive** `prisma.$transaction(async tx => …)` form (escrow ops consume `tx`), then notifies after. No schema change — `Payout`/`PayoutHold`/`PayoutAccount` already have every field.

**Tech Stack:** Next.js 15 (admin server components + form actions), Prisma, the Opn fetch client, next-intl, Vitest.

## Global Constraints

- **Money is integer satang** (rule 1); `formatSatang` only at the UI/notification edge.
- **escrowState transitions ONLY via `lib/ledger`** (rule 2; `gate:status`) — mark-paid calls `payout(tx, …)`, never writes escrowState directly.
- **`accountNumberEnc` decrypts in exactly ONE function**, audited every call; plaintext never in logs/AuditLog/client HTML (rules 9/10).
- **Admin auth:** every page + action re-checks `requireAdmin()` (separate AdminUser + TOTP; consumer session can't satisfy it).
- **Op-builder/audit seam (#70):** admin state changes + their `AuditLog` row commit in ONE transaction; `notify()` fires after (never throws, not in the tx).
- **Host payout = `totalSatang − commissionSatang` (90%);** ledger `PAY` discharges the full escrow amount.
- **No schema change. No migration.** PR gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status && pnpm gate:bodyraw` + `pnpm build`.

## File structure

- New: `src/lib/admin/payout.ts` (+ `payout.test.ts`) — the coordinator (reconcile, revealAccountNumber, markPaid, placeHold, releaseHold, loadPayoutDueList).
- New: `src/app/[locale]/admin/(console)/payouts/{page,actions,reveal-account}.tsx`.
- Edit: `src/lib/payments/opn.ts` (+ `opn.test.ts`) — `getBalance`. `src/lib/ledger/apply.ts` (+ a test) — `ledgerTotals`. `src/lib/notifications/templates.ts` (+ test) — 3 keys. `src/app/[locale]/admin/(console)/layout.tsx` — a console nav strip. `messages/{th,en}.json` — `Admin.Payouts.*`.

---

### Task 1: Opn `getBalance` + ledger `ledgerTotals`

**Files:** Modify `src/lib/payments/opn.ts` (+ `opn.test.ts`), `src/lib/ledger/apply.ts` (+ `src/lib/ledger/totals.test.ts`)

**Interfaces:**
- Produces: `getBalance(): Promise<OpnBalance>` where `OpnBalance = { object: "balance"; total: number; available: number; currency: string }`; `ledgerTotals(): Promise<Buckets>` (the global escrow totals).

- [ ] **Step 1: opn test.** In `opn.test.ts`, add (mirroring the existing `stubFetch`/`lastCall` harness):

```ts
describe("getBalance", () => {
  it("GETs /balance and returns total + available (satang)", async () => {
    const fetchMock = stubFetch(200, { object: "balance", total: 5_000_00, available: 4_200_00, currency: "thb" });
    const bal = await getBalance();
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.omise.co/balance");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(bal.total).toBe(5_000_00);
    expect(bal.available).toBe(4_200_00);
  });
});
```

Add `getBalance` to the import line. Run: `pnpm vitest run src/lib/payments/opn.test.ts` → FAIL.

- [ ] **Step 2: opn impl.** In `opn.ts`, after `OpnRefund`:

```ts
/** The subset of the Opn balance object U-Rest reads (satang). */
export interface OpnBalance {
  object: "balance";
  total: number;
  available: number;
  currency: string;
}

/** Live Opn balance — the reconciliation reference (§5.2). */
export function getBalance(): Promise<OpnBalance> {
  return opnRequest<OpnBalance>("GET", "/balance");
}
```

Run the opn test → PASS.

- [ ] **Step 3: ledgerTotals test.** `src/lib/ledger/totals.test.ts`:

```ts
import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { ledgerEntry: { findMany: vi.fn() } } }));
import { prisma } from "@/lib/db";
import { ledgerTotals } from "./apply";

it("folds every ledger entry into the running buckets", async () => {
  (prisma.ledgerEntry.findMany as unknown as Mock).mockResolvedValue([
    { fromState: null, toState: "HELD", amountSatang: 10_000_00 }, // received
    { fromState: "HELD", toState: "RELEASABLE", amountSatang: 10_000_00 },
    { fromState: "RELEASABLE", toState: "PAID", amountSatang: 4_000_00 }, // paid out
  ]);
  const b = await ledgerTotals();
  expect(b.received).toBe(10_000_00);
  expect(b.paidOut).toBe(4_000_00);
  expect(b.releasable).toBe(6_000_00);
  expect(b.held).toBe(0);
});
```

Run: `pnpm vitest run src/lib/ledger/totals.test.ts` → FAIL.

- [ ] **Step 4: ledgerTotals impl.** In `apply.ts`, add a `prisma` import (`import { prisma } from "@/lib/db";`) and:

```ts
import { type Buckets } from "./escrow";

/** Global escrow totals — folds the entire LedgerEntry log (pilot volume). For reconciliation (#25). */
export async function ledgerTotals(): Promise<Buckets> {
  const entries = await prisma.ledgerEntry.findMany({
    select: { fromState: true, toState: true, amountSatang: true },
  });
  let buckets = EMPTY_BUCKETS;
  for (const e of entries) {
    buckets = foldMove(buckets, {
      fromState: e.fromState ?? EscrowState.NONE,
      toState: e.toState,
      amountSatang: e.amountSatang,
      cause: LedgerCause.CHARGE_WEBHOOK, // cause irrelevant to the money fold
    });
  }
  return buckets;
}
```

Run → PASS. Then `pnpm gate:status` (apply.ts still escrow-only) + `pnpm typecheck`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/payments/opn.ts src/lib/payments/opn.test.ts src/lib/ledger/apply.ts src/lib/ledger/totals.test.ts
git commit -m "feat(payout): Opn getBalance + ledgerTotals (reconciliation inputs) (#25)"
```

---

### Task 2: `reconcile` (the solvency/integrity gate)

**Files:** Create `src/lib/admin/payout.ts` (+ `src/lib/admin/payout.test.ts`)

**Interfaces:**
- Consumes: `getBalance` (Task 1), `ledgerTotals` (Task 1), `invariantHolds` (escrow.ts).
- Produces: `reconcile(): Promise<Reconciliation>` where `Reconciliation = { invariantOk: boolean; opnTotalSatang: number; obligationSatang: number; ok: boolean }`.

- [ ] **Step 1: test** (`payout.test.ts`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/payments/opn", () => ({ getBalance: vi.fn() }));
vi.mock("@/lib/ledger/apply", () => ({ ledgerTotals: vi.fn() }));

import { getBalance } from "@/lib/payments/opn";
import { ledgerTotals } from "@/lib/ledger/apply";
import { reconcile } from "./payout";

const balance = getBalance as unknown as Mock;
const totals = ledgerTotals as unknown as Mock;
const buckets = (o: Partial<Record<string, number>> = {}) => ({ received: 0, refunded: 0, paidOut: 0, held: 0, releasable: 0, frozen: 0, ...o });

afterEach(() => vi.clearAllMocks());

it("ok when the Opn balance covers the escrow obligation (surplus from commission is fine)", async () => {
  totals.mockResolvedValue(buckets({ received: 10_000_00, releasable: 6_000_00, held: 4_000_00 }));
  balance.mockResolvedValue({ total: 12_000_00, available: 12_000_00 }); // surplus
  const r = await reconcile();
  expect(r.obligationSatang).toBe(10_000_00);
  expect(r.ok).toBe(true);
});

it("blocks when the Opn balance is short of the obligation", async () => {
  totals.mockResolvedValue(buckets({ received: 10_000_00, held: 10_000_00 }));
  balance.mockResolvedValue({ total: 9_000_00, available: 9_000_00 });
  expect((await reconcile()).ok).toBe(false);
});

it("blocks when the ledger invariant is broken (corruption)", async () => {
  totals.mockResolvedValue(buckets({ received: 10_000_00, held: 9_999_00 })); // 9999 ≠ 10000
  balance.mockResolvedValue({ total: 50_000_00, available: 50_000_00 });
  const r = await reconcile();
  expect(r.invariantOk).toBe(false);
  expect(r.ok).toBe(false);
});
```

Run → FAIL (module missing).

- [ ] **Step 2: impl** (`payout.ts`):

```ts
import { invariantHolds } from "@/lib/ledger/escrow";
import { ledgerTotals } from "@/lib/ledger/apply";
import { getBalance } from "@/lib/payments/opn";

export interface Reconciliation {
  invariantOk: boolean;
  opnTotalSatang: number;
  obligationSatang: number;
  ok: boolean;
}

/** §5.2 gate: ledger integrity + Opn solvency. A surplus (retained commission) is fine. */
export async function reconcile(): Promise<Reconciliation> {
  const [b, balance] = await Promise.all([ledgerTotals(), getBalance()]);
  const invariantOk = invariantHolds(b);
  const obligationSatang = b.held + b.releasable + b.frozen;
  const ok = invariantOk && balance.total >= obligationSatang;
  return { invariantOk, opnTotalSatang: balance.total, obligationSatang, ok };
}
```

Run → PASS. Commit.

```bash
git add src/lib/admin/payout.ts src/lib/admin/payout.test.ts
git commit -m "feat(payout): reconcile() solvency + ledger-integrity gate (#25)"
```

---

### Task 3: `revealAccountNumber` (single audited decryption)

**Files:** Modify `src/lib/admin/payout.ts` (+ test)

**Interfaces:**
- Consumes: `decryptField` (`@/lib/crypto`), `AdminPrincipal` (`@/lib/admin/auth`), prisma.
- Produces: `revealAccountNumber(admin: AdminPrincipal, payoutAccountId: string): Promise<{ accountNumber: string; bankCode: string; accountName: string }>`.

- [ ] **Step 1: test.** Mock `@/lib/crypto` (`decryptField`) + `@/lib/db` (`prisma.payoutAccount.findUnique`, `prisma.auditLog.create`):

```ts
it("decrypts the account number exactly once and writes an audit row WITHOUT the plaintext", async () => {
  payoutAccountFindUnique.mockResolvedValue({ id: "pa1", bankCode: "014", accountName: "สมชาย", accountNumberEnc: "v1.k1.iv.ct.tag" });
  decryptFieldMock.mockReturnValue("1234567890");
  const res = await revealAccountNumber({ id: "adm1", email: "a", displayName: "A" }, "pa1");
  expect(decryptFieldMock).toHaveBeenCalledWith("v1.k1.iv.ct.tag");
  expect(res.accountNumber).toBe("1234567890");
  const audit = auditCreate.mock.calls[0]?.[0]?.data;
  expect(audit.action).toBe("PAYOUT_ACCOUNT_DECRYPTED");
  expect(audit.targetId).toBe("pa1");
  expect(JSON.stringify(audit)).not.toContain("1234567890"); // plaintext never logged
});
```

Run → FAIL.

- [ ] **Step 2: impl** (add to `payout.ts`):

```ts
import { decryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import type { AdminPrincipal } from "./auth";

export class PayoutError extends Error {
  constructor(public readonly reason: "ACCOUNT_NOT_FOUND" | "NOT_FOUND" | "NOT_RELEASABLE" | "ON_HOLD" | "RECONCILE_BLOCKED" | "NO_PAYOUT_ACCOUNT" | "SLIP_REQUIRED" | "REASON_REQUIRED" | "TARGET_REQUIRED") {
    super(reason);
    this.name = "PayoutError";
  }
}

/** The ONLY place accountNumberEnc is decrypted (§5.2). Every call is audited; plaintext is never logged. */
export async function revealAccountNumber(
  admin: AdminPrincipal,
  payoutAccountId: string,
): Promise<{ accountNumber: string; bankCode: string; accountName: string }> {
  const acct = await prisma.payoutAccount.findUnique({ where: { id: payoutAccountId } });
  if (!acct) throw new PayoutError("ACCOUNT_NOT_FOUND");
  const accountNumber = decryptField(acct.accountNumberEnc);
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "PAYOUT_ACCOUNT_DECRYPTED", targetType: "PayoutAccount", targetId: acct.id },
  });
  return { accountNumber, bankCode: acct.bankCode, accountName: acct.accountName };
}
```

Run → PASS. Commit (`feat(payout): audited single accountNumber decryption (#25)`).

---

### Task 4: `markPaid`

**Files:** Modify `src/lib/admin/payout.ts` (+ test)

**Interfaces:**
- Consumes: `reconcile` (Task 2), `payout(tx, bookingId, adminId)` (`@/lib/ledger/apply`), `notify`.
- Produces: `markPaid(admin: AdminPrincipal, bookingId: string, slipRef: string): Promise<void>`.

- [ ] **Step 1: tests.** Mock `@/lib/ledger/apply` (`payout` + `ledgerTotals`), `@/lib/payments/opn` (`getBalance`), `@/lib/notifications` (`notify`), prisma (`booking.findUnique`, `payoutHold.findFirst`, `$transaction`, `payout.create`, `auditLog.create`). Drive reconcile via getBalance/ledgerTotals mocks. Cover:
  - happy: RELEASABLE booking + no hold + reconcile ok → `payout(tx,…)` called, `payout.create` with `hostAmountSatang = totalSatang − commissionSatang` + `slipRef`, audit written, `notify(hostId, "PAYOUT_PAID_HOST", …)`.
  - refuses (no payout/transaction) when: reconcile not ok (`PayoutError RECONCILE_BLOCKED`); booking not RELEASABLE (`NOT_RELEASABLE`); an active hold exists (`ON_HOLD`); empty slipRef (`SLIP_REQUIRED`).

```ts
it("marks paid: ledger payout + Payout row (90%) + audit, then notifies the host", async () => {
  findBooking.mockResolvedValue({ id: "bk1", status: "CONFIRMED", escrowState: "RELEASABLE", totalSatang: 10_000_00, commissionSatang: 1_000_00, code: "UR-2606-0001", listing: { hostId: "host1" }, payoutAccountId: "pa1" });
  holdFindFirst.mockResolvedValue(null);
  totals.mockResolvedValue(buckets({ received: 10_000_00, releasable: 10_000_00 }));
  balance.mockResolvedValue({ total: 20_000_00, available: 20_000_00 });
  tx.mockImplementation(async (fn) => fn(txClient)); // interactive form
  await markPaid({ id: "adm1", email: "a", displayName: "A" }, "bk1", "SLIP-001");
  expect(payoutOp).toHaveBeenCalledWith(txClient, "bk1", "adm1");
  expect(txClient.payout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ bookingId: "bk1", hostAmountSatang: 9_000_00, slipRef: "SLIP-001", paidByAdminId: "adm1" }) });
  expect(notifyFn).toHaveBeenCalledWith("host1", "PAYOUT_PAID_HOST", expect.objectContaining({ amountSatang: 9_000_00, slipRef: "SLIP-001", code: "UR-2606-0001" }));
});
```

(The booking's `payoutAccountId` comes from the host's `PayoutAccount`; load it via the host's account — `prisma.payoutAccount.findFirst({ where: { userId: hostId } })` — see impl. A booking whose host has no account → `NO_PAYOUT_ACCOUNT`.)

Run → FAIL.

- [ ] **Step 2: impl** (add to `payout.ts`):

```ts
import { notify } from "@/lib/notifications";
import { payout } from "@/lib/ledger/apply";

export async function markPaid(admin: AdminPrincipal, bookingId: string, slipRef: string): Promise<void> {
  const ref = slipRef.trim();
  if (!ref) throw new PayoutError("SLIP_REQUIRED");

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, escrowState: true, totalSatang: true, commissionSatang: true, code: true, listing: { select: { hostId: true } } },
  });
  if (!booking) throw new PayoutError("NOT_FOUND");
  if (booking.escrowState !== "RELEASABLE") throw new PayoutError("NOT_RELEASABLE");

  const hostId = booking.listing.hostId;
  const onHold = await prisma.payoutHold.findFirst({
    where: { releasedAt: null, OR: [{ bookingId }, { hostUserId: hostId }] },
  });
  if (onHold) throw new PayoutError("ON_HOLD");

  const account = await prisma.payoutAccount.findFirst({ where: { userId: hostId }, orderBy: { createdAt: "desc" } });
  if (!account) throw new PayoutError("NO_PAYOUT_ACCOUNT");

  const { ok } = await reconcile();
  if (!ok) throw new PayoutError("RECONCILE_BLOCKED");

  const hostAmountSatang = booking.totalSatang - booking.commissionSatang;
  await prisma.$transaction(async (tx) => {
    await payout(tx, bookingId, admin.id); // ledger RELEASABLE→PAID
    await tx.payout.create({
      data: { bookingId, payoutAccountId: account.id, hostAmountSatang, slipRef: ref, paidByAdminId: admin.id, paidAt: new Date() },
    });
    await tx.auditLog.create({
      data: { adminId: admin.id, action: "PAYOUT_PAID", targetType: "Booking", targetId: bookingId, after: { hostAmountSatang, slipRef: ref } },
    });
  });

  if (booking.code) {
    await notify(hostId, "PAYOUT_PAID_HOST", { amountSatang: hostAmountSatang, slipRef: ref, code: booking.code });
  }
}
```

Run → PASS. `pnpm gate:status` (escrow only via `payout`). Commit (`feat(payout): mark-paid — ledger PAID + Payout row + host notify, reconcile-gated (#25)`).

---

### Task 5: holds (place + release) + the active-hold helper

**Files:** Modify `src/lib/admin/payout.ts` (+ test)

**Interfaces:**
- Produces: `placeHold(admin, target: { bookingId: string } | { hostUserId: string }, reason: string): Promise<void>`; `releaseHold(admin, holdId: string): Promise<void>`.

- [ ] **Step 1: tests.** Cover: place a booking-scope hold (PayoutHold row `{ bookingId, reason, createdByAdminId }` + audit + notify host); place a host-scope hold (`{ hostUserId, … }`); empty reason → `REASON_REQUIRED`; neither/both target keys → `TARGET_REQUIRED`; releaseHold sets `releasedAt`/`releasedByAdminId` + audit + notify. For booking-scope, the host to notify is the booking's host; for host-scope, the `hostUserId`.

- [ ] **Step 2: impl.** `placeHold` validates exactly one target + non-empty reason; for a booking target, resolve the host (`booking.listing.hostId`) for the notify; create `PayoutHold` + `AuditLog` in one `$transaction([...])` (these are single creates → array form is fine here), then `notify(hostId, "PAYOUT_HOLD_CREATED", { reason })`. `releaseHold` loads the hold, `$transaction([ payoutHold.update({ where: { id }, data: { releasedAt: now, releasedByAdminId: admin.id } }), auditLog.create(...) ])`, then `notify(hostId, "PAYOUT_HOLD_RELEASED", {})`. Run → PASS. Commit.

---

### Task 6: `loadPayoutDueList`

**Files:** Modify `src/lib/admin/payout.ts` (+ test)

**Interfaces:**
- Produces: `loadPayoutDueList(): Promise<PayoutGroup[]>` where `PayoutGroup = { hostId; hostName; payoutAccount: { id; bankCode; accountName } | null; bookings: { id; code; checkOut; hostAmountSatang; heldReason: string | null }[]; totalSatang }`.

- [ ] **Step 1: test.** Mock `booking.findMany` (RELEASABLE bookings w/ listing.host + the host's payoutAccount) + `payoutHold.findMany` (active holds). Assert: grouping by host, `hostAmountSatang = total − commission`, group total, a booking covered by an active hold gets `heldReason` set (still listed, not dropped), a host with no payout account → `payoutAccount: null`.

- [ ] **Step 2: impl.** Query RELEASABLE bookings (`escrowState: "RELEASABLE"`, `select` id/code/checkOut/totalSatang/commissionSatang + listing.hostId + listing.host.displayName); query active `PayoutHold`s (`releasedAt: null`) to build a per-booking + per-host hold map; query `payoutAccount` per host. Group by host; compute `hostAmountSatang` + group total over **non-held** bookings; annotate held bookings with `heldReason`. Order groups by earliest checkOut. Run → PASS. Commit.

---

### Task 7: notification templates

**Files:** Modify `src/lib/notifications/templates.ts` (+ test)

- [ ] **Step 1: test** — `PAYOUT_PAID_HOST` priority, body contains the formatted amount (`satang(p.amountSatang)`) + slip ref + code; `PAYOUT_HOLD_CREATED` carries the reason; `PAYOUT_HOLD_RELEASED` exists. Run → FAIL.
- [ ] **Step 2: impl** — append 3 templates (reuse the `satang()` helper for the amount):

```ts
  PAYOUT_PAID_HOST: {
    priority: true,
    email: (p) => ({
      subject: `โอนเงินแล้ว — การจอง ${str(p.code)}`,
      body: `โอนเงิน ${satang(p.amountSatang)} สำหรับการจอง ${str(p.code)} เรียบร้อยแล้ว (อ้างอิงสลิป ${str(p.slipRef)})`,
    }),
    line: (p) => `💸 โอนเงิน ${satang(p.amountSatang)} แล้ว — การจอง ${str(p.code)} (สลิป ${str(p.slipRef)})`,
  },
  PAYOUT_HOLD_CREATED: {
    priority: true,
    email: (p) => ({ subject: "การโอนเงินถูกระงับชั่วคราว", body: `การโอนเงินของคุณถูกระงับชั่วคราวเพื่อตรวจสอบ: ${str(p.reason)} ทีมงานจะติดต่อกลับ` }),
    line: (p) => `⏸️ การโอนเงินถูกระงับชั่วคราว — ${str(p.reason)}`,
  },
  PAYOUT_HOLD_RELEASED: {
    priority: true,
    email: () => ({ subject: "การโอนเงินกลับมาดำเนินการแล้ว", body: "การระงับการโอนถูกยกเลิกแล้ว เงินจะถูกโอนในรอบถัดไป" }),
    line: () => "▶️ การระงับการโอนถูกยกเลิกแล้ว — เงินจะถูกโอนในรอบถัดไป",
  },
```

Run → PASS. Commit.

---

### Task 8: admin payouts UI + nav + i18n

**Files:** Create `src/app/[locale]/admin/(console)/payouts/{page,actions,reveal-account}.tsx`; Modify `src/app/[locale]/admin/(console)/layout.tsx`, `messages/{th,en}.json`

- [ ] **Step 1: i18n.** Append `Admin.Payouts.*` to both locales (th source): `title`, `subtitle`, `empty`, `reconcileOk`, `reconcileBlocked` (with `{obligation}`/`{balance}`), `noAccount`, `revealAccount`, `slipRefLabel`, `markPaid`, `markPaidConfirm`, `holdCta`, `holdReasonLabel`, `holdHostScope`, `release`, `heldReason`, `total`, plus nav keys `nav.approvalQueue`/`nav.payouts`/`nav.unanswered`.

- [ ] **Step 2: console nav.** In `layout.tsx`, add a `<nav>` strip under the header linking the console sections (`/admin/approval-queue`, `/admin/payouts`, `/admin/unanswered-questions`) via `Link` from `@/i18n/navigation`, ink-styled (token classes). (Currently there's no cross-section nav.)

- [ ] **Step 3: `actions.ts`** (form actions, each `requireAdmin` → coordinator → `revalidatePath`):

```ts
"use server";
import { requireAdmin } from "@/lib/admin/auth";
import { markPaid, placeHold, releaseHold, revealAccountNumber } from "@/lib/admin/payout";
import { revalidatePath } from "next/cache";

export async function markPaidAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await markPaid(admin, String(fd.get("bookingId")), String(fd.get("slipRef") ?? ""));
  revalidatePath("/admin/payouts");
}
export async function placeHoldAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const reason = String(fd.get("reason") ?? "");
  const hostUserId = fd.get("hostUserId");
  await placeHold(admin, hostUserId ? { hostUserId: String(hostUserId) } : { bookingId: String(fd.get("bookingId")) }, reason);
  revalidatePath("/admin/payouts");
}
export async function releaseHoldAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await releaseHold(admin, String(fd.get("holdId")));
  revalidatePath("/admin/payouts");
}
// reveal returns data → called from the client component:
export async function revealAccountAction(payoutAccountId: string): Promise<{ ok: true; accountNumber: string; bankCode: string; accountName: string } | { ok: false }> {
  const admin = await requireAdmin();
  try { return { ok: true, ...(await revealAccountNumber(admin, payoutAccountId)) }; }
  catch { return { ok: false }; }
}
```

- [ ] **Step 4: `reveal-account.tsx`** (client) — a button that calls `revealAccountAction` via `useTransition` and shows the returned number transiently (never in the initial server HTML).

- [ ] **Step 5: `page.tsx`** (server) — `requireAdmin()`, `reconcile()` → a green/red banner (red shows obligation vs balance and disables mark-paid), `loadPayoutDueList()` → grouped cards; per group the `RevealAccount` + (per booking) a mark-paid `<form action={markPaidAction}>` (hidden bookingId + slipRef input, disabled when `!reconcile.ok`), a hold form, and held bookings greyed with `heldReason` + a release form. Token classes only; `formatSatang` for amounts.

- [ ] **Step 6:** `pnpm typecheck && pnpm build` → the `/admin/payouts` route compiles. Commit.

---

### Task 9: full gate + final review + PR

- [ ] **Step 1:** `pnpm typecheck && pnpm lint && pnpm test && pnpm gate:status && pnpm gate:bodyraw && pnpm build` — all green (lint: only the pre-existing `_fd`/concierge warnings).
- [ ] **Step 2:** final whole-branch review (read-only Explore subagent) → PR `Closes #25`, labels `area:ledger-payments` + `area:admin`, milestone M3.

## Self-Review

**Spec coverage:** §A reconcile → Tasks 1–2; §B decryption → Task 3; §C mark-paid → Task 4; §D holds → Task 5; §E due list + UI + nav → Tasks 6, 8; §F templates → Task 7; no-schema-change honored throughout. Acceptance: #1 staging payout → Tasks 4/8 + manual; #2 holds both scopes remove-from-list reversibly+audited → Tasks 5/6; #3 reconciliation blocks marking → Task 4 (server gate) + Task 8 (UI); #4 decryption audited → Task 3.

**Placeholder scan:** no TBD/TODO; lib code is complete; the UI page/reveal steps describe concrete structure with the actions fully written (Task 8 is UI glue, verified by build — RTL not set up).

**Type consistency:** `Reconciliation`/`PayoutError`/`PayoutGroup` + the coordinator fn signatures (`reconcile`/`revealAccountNumber`/`markPaid`/`placeHold`/`releaseHold`/`loadPayoutDueList`) are consistent across tasks; `getBalance`→`OpnBalance.total`, `ledgerTotals`→`Buckets`, `payout(tx, bookingId, adminId)` match the real ledger signature; `hostAmountSatang = totalSatang − commissionSatang` consistent (Task 4 + 6); template keys `PAYOUT_PAID_HOST`/`PAYOUT_HOLD_CREATED`/`PAYOUT_HOLD_RELEASED` match between Task 7 and the notify calls.
