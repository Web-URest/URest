import { describe, expect, it, vi, afterEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    kycSubmission: { findFirst: vi.fn() },
    listing: { update: vi.fn((args: unknown) => ({ op: "listing.update", args })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

import { prisma } from "@/lib/db";
import { resubmitForReview, ResubmitError } from "./listing-resubmit";

const findFirst = prisma.kycSubmission.findFirst as unknown as Mock;
const tx = prisma.$transaction as unknown as Mock;

// kycSubmission.update is reached via resubmitKycOp; add it to the mock lazily.
const subUpdate = vi.fn((args: unknown) => ({ op: "kyc.update", args }));
(prisma as unknown as { kycSubmission: { update: Mock } }).kycSubmission.update = subUpdate;

afterEach(() => vi.clearAllMocks());

const items = (satisfied: boolean) => [
  { item: "THAI_ID_UNCLEAR", satisfied },
  { item: "BANK_NAME_MISMATCH", satisfied: true },
];

describe("resubmitForReview", () => {
  it("throws NOT_FOUND when there is no NEEDS_INFO submission (scoped to owner)", async () => {
    findFirst.mockResolvedValue(null);
    await expect(resubmitForReview("u1", "l1")).rejects.toMatchObject({ reason: "NOT_FOUND" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "u1", listingId: "l1", status: "NEEDS_INFO" },
    });
    expect(tx).not.toHaveBeenCalled();
  });

  it("throws ITEMS_INCOMPLETE when any item is unsatisfied", async () => {
    findFirst.mockResolvedValue({ id: "s1", needsInfoItems: items(false) });
    await expect(resubmitForReview("u1", "l1")).rejects.toBeInstanceOf(ResubmitError);
    expect(tx).not.toHaveBeenCalled();
  });

  it("composes [listing, kyc] in one tx when all items satisfied", async () => {
    findFirst.mockResolvedValue({ id: "s1", needsInfoItems: items(true) });
    await resubmitForReview("u1", "l1");
    expect(tx).toHaveBeenCalledTimes(1);
    const ops = tx.mock.calls[0]?.[0] as { op: string }[];
    expect(ops.map((o) => o.op)).toEqual(["listing.update", "kyc.update"]);
  });
});
