import { describe, expect, it, vi, afterEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { update: vi.fn((args: unknown) => args) },
  },
}));

import { prisma } from "@/lib/db";
import {
  grantLegalBadgeOp,
  needsInfoListingOp,
  publishListingOp,
  refuseLegalBadgeOp,
  rejectListingOp,
  resubmitListingOp,
} from "./review";

const update = prisma.listing.update as unknown as Mock;

afterEach(() => vi.clearAllMocks());

describe("listing review op builders", () => {
  const at = new Date("2026-06-17T10:00:00Z");

  it("publishListingOp → PUBLISHED with publishedAt", () => {
    publishListingOp("l1", at);
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "PUBLISHED", publishedAt: at },
    });
  });

  it("rejectListingOp → REJECTED", () => {
    rejectListingOp("l1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "REJECTED" },
    });
  });

  it("needsInfoListingOp → NEEDS_INFO", () => {
    needsInfoListingOp("l1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "NEEDS_INFO" },
    });
  });

  it("resubmitListingOp → PENDING_REVIEW", () => {
    resubmitListingOp("l1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "PENDING_REVIEW" },
    });
  });

  it("grantLegalBadgeOp sets legalBadgeAt; refuse clears it", () => {
    grantLegalBadgeOp("l1", at);
    expect(update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { legalBadgeAt: at } });
    refuseLegalBadgeOp("l1");
    expect(update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { legalBadgeAt: null } });
  });
});
