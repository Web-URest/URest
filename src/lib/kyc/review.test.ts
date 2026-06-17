import { describe, expect, it, vi, afterEach, type Mock } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  prisma: {
    kycSubmission: { update: vi.fn((args: unknown) => args) },
    kycDocument: { updateMany: vi.fn((args: unknown) => args) },
  },
}));

import { prisma } from "@/lib/db";
import {
  allItemsSatisfied,
  approveKycOp,
  needsInfoKycOp,
  parseNeedsInfoItems,
  purgeDocumentsOp,
  rejectKycOp,
  resubmitKycOp,
  type NeedsInfoItem,
} from "./review";

const subUpdate = prisma.kycSubmission.update as unknown as Mock;
const docUpdateMany = prisma.kycDocument.updateMany as unknown as Mock;

afterEach(() => vi.clearAllMocks());

describe("parseNeedsInfoItems", () => {
  it("returns [] for null / non-array / garbage", () => {
    expect(parseNeedsInfoItems(null)).toEqual([]);
    expect(parseNeedsInfoItems(undefined)).toEqual([]);
    expect(parseNeedsInfoItems("nope" as unknown as Prisma.JsonValue)).toEqual([]);
    expect(parseNeedsInfoItems({ item: "X" } as unknown as Prisma.JsonValue)).toEqual([]);
  });

  it("drops malformed and unknown-key entries, round-trips valid ones", () => {
    const raw = [
      { item: "THAI_ID_UNCLEAR", satisfied: false },
      { item: "BANK_NAME_MISMATCH", note: "ชื่อไม่ตรง", satisfied: true },
      { item: "NOT_A_KEY", satisfied: false }, // unknown → dropped
      { satisfied: true }, // no item → dropped
      42, // not an object → dropped
    ] as unknown as Prisma.JsonValue;
    expect(parseNeedsInfoItems(raw)).toEqual([
      { item: "THAI_ID_UNCLEAR", satisfied: false },
      { item: "BANK_NAME_MISMATCH", note: "ชื่อไม่ตรง", satisfied: true },
    ]);
  });

  it("coerces a missing/non-true satisfied to false", () => {
    const raw = [{ item: "REMAP_PIN" }] as unknown as Prisma.JsonValue;
    expect(parseNeedsInfoItems(raw)).toEqual([{ item: "REMAP_PIN", satisfied: false }]);
  });
});

describe("allItemsSatisfied", () => {
  const mk = (sat: boolean[]): NeedsInfoItem[] =>
    sat.map((satisfied, i) => ({ item: i === 0 ? "THAI_ID_UNCLEAR" : "MORE_PHOTOS", satisfied }));

  it("false on empty list", () => {
    expect(allItemsSatisfied([])).toBe(false);
  });
  it("false when any item unsatisfied", () => {
    expect(allItemsSatisfied(mk([true, false]))).toBe(false);
  });
  it("true only when all satisfied", () => {
    expect(allItemsSatisfied(mk([true, true]))).toBe(true);
  });
});

describe("kyc review op builders", () => {
  const at = new Date("2026-06-17T10:00:00Z");

  it("approveKycOp → APPROVED, stamps reviewer + clears checklist", () => {
    approveKycOp("s1", "admin1", at);
    expect(subUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: {
        status: "APPROVED",
        reviewedByAdminId: "admin1",
        reviewedAt: at,
        needsInfoItems: Prisma.DbNull,
      },
    });
  });

  it("rejectKycOp → REJECTED with reviewer", () => {
    rejectKycOp("s1", "admin1", at);
    expect(subUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "REJECTED", reviewedByAdminId: "admin1", reviewedAt: at },
    });
  });

  it("needsInfoKycOp → NEEDS_INFO persisting the items", () => {
    const items: NeedsInfoItem[] = [{ item: "THAI_ID_UNCLEAR", satisfied: false }];
    needsInfoKycOp("s1", "admin1", items, at);
    expect(subUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: {
        status: "NEEDS_INFO",
        reviewedByAdminId: "admin1",
        reviewedAt: at,
        needsInfoItems: items,
      },
    });
  });

  it("purgeDocumentsOp marks every doc for purge", () => {
    const purgeAfter = new Date("2026-09-15T10:00:00Z");
    purgeDocumentsOp("s1", purgeAfter);
    expect(docUpdateMany).toHaveBeenCalledWith({
      where: { submissionId: "s1" },
      data: { purgeAfter },
    });
  });

  it("resubmitKycOp → PENDING_REVIEW clears checklist", () => {
    resubmitKycOp("s1");
    expect(subUpdate).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { status: "PENDING_REVIEW", needsInfoItems: Prisma.DbNull },
    });
  });
});
