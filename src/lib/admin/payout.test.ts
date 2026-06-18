import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/payments/opn", () => ({ getBalance: vi.fn() }));
vi.mock("@/lib/ledger/apply", () => ({ ledgerTotals: vi.fn(), payout: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decryptField: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    payoutAccount: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    booking: { findUnique: vi.fn(), findMany: vi.fn() },
    payoutHold: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    payout: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { decryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ledgerTotals, payout } from "@/lib/ledger/apply";
import { notify } from "@/lib/notifications";
import { getBalance } from "@/lib/payments/opn";

import {
  loadPayoutDueList,
  markPaid,
  PayoutError,
  placeHold,
  reconcile,
  releaseHold,
  revealAccountNumber,
} from "./payout";

const balance = getBalance as unknown as Mock;
const totals = ledgerTotals as unknown as Mock;
const payoutOp = payout as unknown as Mock;
const notifyFn = notify as unknown as Mock;
const decryptFieldMock = decryptField as unknown as Mock;
const db = prisma as unknown as {
  payoutAccount: { findUnique: Mock; findFirst: Mock; findMany: Mock };
  auditLog: { create: Mock };
  booking: { findUnique: Mock; findMany: Mock };
  payoutHold: { findUnique: Mock; findFirst: Mock; findMany: Mock; create: Mock; update: Mock };
  payout: { create: Mock };
  $transaction: Mock;
};

const ADMIN = { id: "adm1", email: "a@u.test", displayName: "Admin A" };

const buckets = (o: Partial<Record<string, number>> = {}) => ({
  received: 0,
  refunded: 0,
  paidOut: 0,
  held: 0,
  releasable: 0,
  frozen: 0,
  ...o,
});

afterEach(() => vi.clearAllMocks());

describe("reconcile", () => {
  it("is ok when the Opn balance covers the escrow obligation (a commission surplus is fine)", async () => {
    totals.mockResolvedValue(buckets({ received: 10_000_00, releasable: 6_000_00, held: 4_000_00 }));
    balance.mockResolvedValue({ total: 12_000_00, available: 12_000_00 }); // surplus over the obligation

    const r = await reconcile();

    expect(r.obligationSatang).toBe(10_000_00);
    expect(r.invariantOk).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("blocks when the Opn balance is short of the obligation", async () => {
    totals.mockResolvedValue(buckets({ received: 10_000_00, held: 10_000_00 }));
    balance.mockResolvedValue({ total: 9_000_00, available: 9_000_00 });

    expect((await reconcile()).ok).toBe(false);
  });

  it("blocks when the ledger invariant is broken (corruption), even with a huge balance", async () => {
    totals.mockResolvedValue(buckets({ received: 10_000_00, held: 9_999_00 })); // 9999 ≠ 10000
    balance.mockResolvedValue({ total: 50_000_00, available: 50_000_00 });

    const r = await reconcile();

    expect(r.invariantOk).toBe(false);
    expect(r.ok).toBe(false);
  });
});

describe("revealAccountNumber", () => {
  it("decrypts the account number once and writes an audit row WITHOUT the plaintext", async () => {
    db.payoutAccount.findUnique.mockResolvedValue({
      id: "pa1",
      bankCode: "014",
      accountName: "สมชาย ใจดี",
      accountNumberEnc: "v1.k1.iv.ct.tag",
    });
    decryptFieldMock.mockReturnValue("1234567890");

    const res = await revealAccountNumber(ADMIN, "pa1");

    expect(decryptFieldMock).toHaveBeenCalledExactlyOnceWith("v1.k1.iv.ct.tag");
    expect(res).toEqual({ accountNumber: "1234567890", bankCode: "014", accountName: "สมชาย ใจดี" });

    const audit = db.auditLog.create.mock.calls[0]?.[0]?.data;
    expect(audit.action).toBe("PAYOUT_ACCOUNT_DECRYPTED");
    expect(audit.targetType).toBe("PayoutAccount");
    expect(audit.targetId).toBe("pa1");
    expect(audit.adminId).toBe("adm1");
    expect(JSON.stringify(audit)).not.toContain("1234567890"); // plaintext never logged
  });

  it("throws when the payout account is missing", async () => {
    db.payoutAccount.findUnique.mockResolvedValue(null);
    await expect(revealAccountNumber(ADMIN, "nope")).rejects.toThrow();
    expect(decryptFieldMock).not.toHaveBeenCalled();
  });
});

describe("markPaid", () => {
  const txClient = { payout: { create: vi.fn() }, auditLog: { create: vi.fn() } };

  /** Arrange a fully payable booking (RELEASABLE, no hold, host account, reconcile ok). */
  const ready = () => {
    db.booking.findUnique.mockResolvedValue({
      id: "bk1",
      escrowState: "RELEASABLE",
      totalSatang: 10_000_00,
      commissionSatang: 1_000_00,
      code: "UR-2606-0001",
      listing: { hostId: "host1" },
    });
    db.payoutHold.findFirst.mockResolvedValue(null);
    db.payoutAccount.findFirst.mockResolvedValue({ id: "pa1", userId: "host1" });
    totals.mockResolvedValue(buckets({ received: 10_000_00, releasable: 10_000_00 }));
    balance.mockResolvedValue({ total: 20_000_00, available: 20_000_00 });
    db.$transaction.mockImplementation(async (fn: (tx: typeof txClient) => unknown) => fn(txClient));
  };

  it("pays out: ledger payout + Payout row (90% host amount) + audit, then notifies the host", async () => {
    ready();

    await markPaid(ADMIN, "bk1", "SLIP-001");

    expect(payoutOp).toHaveBeenCalledWith(txClient, "bk1", "adm1");
    expect(txClient.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: "bk1",
        payoutAccountId: "pa1",
        hostAmountSatang: 9_000_00, // total − commission
        slipRef: "SLIP-001",
        paidByAdminId: "adm1",
      }),
    });
    expect(txClient.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "PAYOUT_PAID", targetId: "bk1" }),
    });
    expect(notifyFn).toHaveBeenCalledWith(
      "host1",
      "PAYOUT_PAID_HOST",
      expect.objectContaining({ amountSatang: 9_000_00, slipRef: "SLIP-001", code: "UR-2606-0001" }),
    );
  });

  it("refuses an empty slip ref before touching anything", async () => {
    ready();
    await expect(markPaid(ADMIN, "bk1", "   ")).rejects.toBeInstanceOf(PayoutError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses when escrow is not RELEASABLE", async () => {
    ready();
    db.booking.findUnique.mockResolvedValue({
      id: "bk1",
      escrowState: "HELD",
      totalSatang: 10_000_00,
      commissionSatang: 1_000_00,
      code: "UR-2606-0001",
      listing: { hostId: "host1" },
    });
    await expect(markPaid(ADMIN, "bk1", "SLIP")).rejects.toBeInstanceOf(PayoutError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses when an active hold covers the booking or host", async () => {
    ready();
    db.payoutHold.findFirst.mockResolvedValue({ id: "h1", reason: "ตรวจสอบ" });
    await expect(markPaid(ADMIN, "bk1", "SLIP")).rejects.toBeInstanceOf(PayoutError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses when reconciliation fails (gateway shortfall) — no ledger payout", async () => {
    ready();
    balance.mockResolvedValue({ total: 1_000_00, available: 1_000_00 }); // short of the obligation
    await expect(markPaid(ADMIN, "bk1", "SLIP")).rejects.toBeInstanceOf(PayoutError);
    expect(payoutOp).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("placeHold", () => {
  // Array-form $transaction: the ops are built by prisma.X.create(...) then passed as a list.
  const arm = () => db.$transaction.mockImplementation(async (ops: unknown) => ops);

  it("booking-scope: creates a PayoutHold + audit and notifies the booking's host", async () => {
    arm();
    db.booking.findUnique.mockResolvedValue({ listing: { hostId: "host1" } });

    await placeHold(ADMIN, { bookingId: "bk1" }, "รอตรวจสลิปโอน");

    expect(db.payoutHold.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bookingId: "bk1", reason: "รอตรวจสลิปโอน", createdByAdminId: "adm1" }),
    });
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(notifyFn).toHaveBeenCalledWith(
      "host1",
      "PAYOUT_HOLD_CREATED",
      expect.objectContaining({ reason: "รอตรวจสลิปโอน" }),
    );
  });

  it("host-scope: creates a whole-host PayoutHold and notifies that host (no booking lookup)", async () => {
    arm();

    await placeHold(ADMIN, { hostUserId: "host9" }, "บัญชีน่าสงสัย");

    expect(db.payoutHold.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ hostUserId: "host9", reason: "บัญชีน่าสงสัย", createdByAdminId: "adm1" }),
    });
    expect(notifyFn).toHaveBeenCalledWith("host9", "PAYOUT_HOLD_CREATED", expect.objectContaining({ reason: "บัญชีน่าสงสัย" }));
    expect(db.booking.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an empty reason without writing", async () => {
    arm();
    await expect(placeHold(ADMIN, { bookingId: "bk1" }, "   ")).rejects.toBeInstanceOf(PayoutError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an ambiguous target (neither or both scopes)", async () => {
    arm();
    await expect(placeHold(ADMIN, {} as { bookingId: string }, "reason")).rejects.toBeInstanceOf(PayoutError);
    await expect(
      placeHold(ADMIN, { bookingId: "b", hostUserId: "h" } as { bookingId: string }, "reason"),
    ).rejects.toBeInstanceOf(PayoutError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("releaseHold", () => {
  it("clears the hold (releasedAt + admin) + audit, then notifies the host", async () => {
    db.$transaction.mockImplementation(async (ops: unknown) => ops);
    db.payoutHold.findUnique.mockResolvedValue({
      id: "h1",
      bookingId: null,
      hostUserId: "host3",
      releasedAt: null,
    });

    await releaseHold(ADMIN, "h1");

    expect(db.payoutHold.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: expect.objectContaining({ releasedByAdminId: "adm1" }),
    });
    const data = db.payoutHold.update.mock.calls[0]?.[0]?.data;
    expect(data.releasedAt).toBeInstanceOf(Date);
    expect(notifyFn).toHaveBeenCalledWith("host3", "PAYOUT_HOLD_RELEASED", expect.anything());
  });

  it("throws when the hold does not exist or is already released", async () => {
    db.payoutHold.findUnique.mockResolvedValue(null);
    await expect(releaseHold(ADMIN, "nope")).rejects.toBeInstanceOf(PayoutError);
  });
});

describe("loadPayoutDueList", () => {
  it("groups RELEASABLE bookings by host, computes 90% amounts, and annotates held items without dropping them", async () => {
    db.booking.findMany.mockResolvedValue([
      {
        id: "bk1",
        code: "UR-2606-0001",
        checkOut: new Date("2026-07-01"),
        totalSatang: 10_000_00,
        commissionSatang: 1_000_00,
        listing: { hostId: "host1", host: { displayName: "โฮสต์ หนึ่ง" } },
      },
      {
        id: "bk2",
        code: "UR-2606-0002",
        checkOut: new Date("2026-07-02"),
        totalSatang: 5_000_00,
        commissionSatang: 500_00,
        listing: { hostId: "host1", host: { displayName: "โฮสต์ หนึ่ง" } },
      },
      {
        id: "bk3",
        code: "UR-2606-0003",
        checkOut: new Date("2026-07-03"),
        totalSatang: 8_000_00,
        commissionSatang: 800_00,
        listing: { hostId: "host2", host: { displayName: "โฮสต์ สอง" } },
      },
    ]);
    db.payoutHold.findMany.mockResolvedValue([
      { bookingId: "bk2", hostUserId: null, reason: "รอตรวจสลิป" }, // booking-scope
      { bookingId: null, hostUserId: "host2", reason: "บัญชีถูกระงับ" }, // whole-host scope
    ]);
    db.payoutAccount.findMany.mockResolvedValue([
      { id: "pa1", userId: "host1", bankCode: "014", accountName: "H1" }, // host2 has no account
    ]);

    const groups = await loadPayoutDueList();

    expect(groups).toHaveLength(2);

    const g1 = groups.find((g) => g.hostId === "host1")!;
    expect(g1.payoutAccount).toEqual({ id: "pa1", bankCode: "014", accountName: "H1" });
    expect(g1.bookings).toHaveLength(2);
    expect(g1.bookings.find((b) => b.id === "bk1")).toMatchObject({ hostAmountSatang: 9_000_00, heldReason: null });
    expect(g1.bookings.find((b) => b.id === "bk2")).toMatchObject({ hostAmountSatang: 4_500_00, heldReason: "รอตรวจสลิป" });
    expect(g1.totalSatang).toBe(9_000_00); // excludes the held bk2

    const g2 = groups.find((g) => g.hostId === "host2")!;
    expect(g2.payoutAccount).toBeNull();
    expect(g2.hostName).toBe("โฮสต์ สอง");
    expect(g2.bookings[0]).toMatchObject({ id: "bk3", hostAmountSatang: 7_200_00, heldReason: "บัญชีถูกระงับ" });
    expect(g2.totalSatang).toBe(0); // its only booking is host-held
  });

  it("returns an empty list when nothing is RELEASABLE", async () => {
    db.booking.findMany.mockResolvedValue([]);
    db.payoutHold.findMany.mockResolvedValue([]);
    db.payoutAccount.findMany.mockResolvedValue([]);
    expect(await loadPayoutDueList()).toEqual([]);
  });
});
