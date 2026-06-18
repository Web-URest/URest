import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { ledgerEntry: { findMany: vi.fn() } } }));

import { prisma } from "@/lib/db";

import { ledgerTotals } from "./apply";

describe("ledgerTotals", () => {
  it("folds every ledger entry into the running buckets", async () => {
    (prisma.ledgerEntry.findMany as unknown as Mock).mockResolvedValue([
      { fromState: null, toState: "HELD", amountSatang: 10_000_00 }, // a charge in
      { fromState: "HELD", toState: "RELEASABLE", amountSatang: 10_000_00 }, // checkout release
      { fromState: "RELEASABLE", toState: "PAID", amountSatang: 4_000_00 }, // an admin payout
    ]);

    const b = await ledgerTotals();

    expect(b.received).toBe(10_000_00);
    expect(b.paidOut).toBe(4_000_00);
    expect(b.releasable).toBe(6_000_00);
    expect(b.held).toBe(0);
  });
});
