import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/payments/opn", () => ({ getBalance: vi.fn() }));
vi.mock("@/lib/ledger/apply", () => ({ ledgerTotals: vi.fn() }));

import { ledgerTotals } from "@/lib/ledger/apply";
import { getBalance } from "@/lib/payments/opn";

import { reconcile } from "./payout";

const balance = getBalance as unknown as Mock;
const totals = ledgerTotals as unknown as Mock;

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
