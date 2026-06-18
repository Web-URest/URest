import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/payments/opn", () => ({ getBalance: vi.fn() }));
vi.mock("@/lib/ledger/apply", () => ({ ledgerTotals: vi.fn(), payout: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decryptField: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    payoutAccount: { findUnique: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    booking: { findUnique: vi.fn(), findMany: vi.fn() },
    payoutHold: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    payout: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { decryptField } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ledgerTotals, payout } from "@/lib/ledger/apply";
import { notify } from "@/lib/notifications";
import { getBalance } from "@/lib/payments/opn";

import { reconcile, revealAccountNumber } from "./payout";

const balance = getBalance as unknown as Mock;
const totals = ledgerTotals as unknown as Mock;
const payoutOp = payout as unknown as Mock;
const notifyFn = notify as unknown as Mock;
const decryptFieldMock = decryptField as unknown as Mock;
const db = prisma as unknown as {
  payoutAccount: { findUnique: Mock; findFirst: Mock };
  auditLog: { create: Mock };
  booking: { findUnique: Mock; findMany: Mock };
  payoutHold: { findFirst: Mock; findMany: Mock; create: Mock; update: Mock };
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
