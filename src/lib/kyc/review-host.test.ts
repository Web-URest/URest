import { describe, expect, it, vi, afterEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    kycSubmission: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn((args: unknown) => args),
    },
  },
}));

import { prisma } from "@/lib/db";
import { KycError } from "./submission";
import { loadNeedsInfoSubmission, markItemSatisfied } from "./review-host";

const findFirst = prisma.kycSubmission.findFirst as unknown as Mock;
const findUnique = prisma.kycSubmission.findUnique as unknown as Mock;
const update = prisma.kycSubmission.update as unknown as Mock;

afterEach(() => vi.clearAllMocks());

describe("loadNeedsInfoSubmission", () => {
  it("queries NEEDS_INFO (not PENDING_REVIEW) scoped to the owner, with docs", async () => {
    findFirst.mockResolvedValue({ id: "s1", documents: [] });
    await loadNeedsInfoSubmission("u1", "l1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "u1", listingId: "l1", status: "NEEDS_INFO" },
      include: { documents: true },
    });
  });
});

describe("markItemSatisfied", () => {
  const sub = {
    id: "s1",
    userId: "u1",
    status: "NEEDS_INFO",
    needsInfoItems: [
      { item: "THAI_ID_UNCLEAR", satisfied: false },
      { item: "BANK_NAME_MISMATCH", note: "n", satisfied: false },
    ],
  };

  it("rejects a non-owner", async () => {
    findUnique.mockResolvedValue({ ...sub, userId: "other" });
    await expect(markItemSatisfied("u1", "s1", "THAI_ID_UNCLEAR", true)).rejects.toMatchObject({
      reason: "NOT_OWNER",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects when submission is not NEEDS_INFO", async () => {
    findUnique.mockResolvedValue({ ...sub, status: "PENDING_REVIEW" });
    await expect(markItemSatisfied("u1", "s1", "THAI_ID_UNCLEAR", true)).rejects.toMatchObject({
      reason: "WRONG_STATE",
    });
  });

  it("throws when the item is not in the checklist", async () => {
    findUnique.mockResolvedValue(sub);
    await expect(markItemSatisfied("u1", "s1", "REMAP_PIN", true)).rejects.toMatchObject({
      reason: "ITEM_NOT_IN_CHECKLIST",
    });
  });

  it("flips only the matching item's satisfied flag", async () => {
    findUnique.mockResolvedValue(sub);
    await markItemSatisfied("u1", "s1", "THAI_ID_UNCLEAR", true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: {
        needsInfoItems: [
          { item: "THAI_ID_UNCLEAR", satisfied: true },
          { item: "BANK_NAME_MISMATCH", note: "n", satisfied: false },
        ],
      },
    });
  });

  it("throws NOT_FOUND for a missing submission", async () => {
    findUnique.mockResolvedValue(null);
    await expect(markItemSatisfied("u1", "s1", "THAI_ID_UNCLEAR", true)).rejects.toBeInstanceOf(
      KycError,
    );
  });
});
