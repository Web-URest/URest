import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    kycSubmission: {
      findUnique: vi.fn(),
      update: vi.fn((args: unknown) => ({ op: "kyc.update", args })),
    },
    listing: {
      findUnique: vi.fn(),
      update: vi.fn((args: unknown) => ({ op: "listing.update", args })),
    },
    kycDocument: {
      updateMany: vi.fn((args: unknown) => ({ op: "doc.updateMany", args })),
    },
    auditLog: { create: vi.fn((args: unknown) => ({ op: "audit.create", args })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import {
  approveSubmission,
  rejectSubmission,
  requestNeedsInfo,
  setLegalBadge,
  ReviewError,
} from "./listing-review";

const subFindUnique = prisma.kycSubmission.findUnique as unknown as Mock;
const listingFindUnique = prisma.listing.findUnique as unknown as Mock;
const tx = prisma.$transaction as unknown as Mock;
const auditCreate = prisma.auditLog.create as unknown as Mock;
const notifyMock = notify as unknown as Mock;

const admin = { id: "admin1", email: "a@x.co", displayName: "Aok" };

const pendingSubmission = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  status: "PENDING_REVIEW",
  listingId: "l1",
  listing: {
    id: "l1",
    hostId: "host1",
    title: "บ้านสระว่ายน้ำ",
    status: "PENDING_REVIEW",
    publishedAt: null,
    legalBadgeAt: null,
  },
  ...over,
});

/** The ops array passed to the single $transaction call. */
type Op = { op: string; args?: { data?: Record<string, unknown> } };
const txOps = (): Op[] => tx.mock.calls[0]?.[0] as Op[];

beforeEach(() => vi.clearAllMocks());

describe("approveSubmission", () => {
  it("throws NOT_FOUND when submission or its listing is missing", async () => {
    subFindUnique.mockResolvedValue(null);
    await expect(approveSubmission(admin, "s1")).rejects.toMatchObject({ reason: "NOT_FOUND" });
    expect(tx).not.toHaveBeenCalled();
  });

  it("throws WRONG_STATE when not PENDING_REVIEW", async () => {
    subFindUnique.mockResolvedValue(pendingSubmission({ status: "APPROVED" }));
    await expect(approveSubmission(admin, "s1")).rejects.toBeInstanceOf(ReviewError);
    expect(tx).not.toHaveBeenCalled();
  });

  it("composes ONE tx [listing, kyc, audit] then notifies after", async () => {
    subFindUnique.mockResolvedValue(pendingSubmission());
    await approveSubmission(admin, "s1");

    expect(tx).toHaveBeenCalledTimes(1);
    const ops = txOps();
    expect(ops).toHaveLength(3);
    // AC#4: the audit row is an element of the SAME array as the state writes.
    const audit = ops.find((o) => o.op === "audit.create");
    expect(audit?.args?.data).toMatchObject({
      action: "LISTING_APPROVED",
      targetType: "Listing",
      targetId: "l1",
    });
    expect(ops.some((o) => o.op === "listing.update")).toBe(true);
    expect(ops.some((o) => o.op === "kyc.update")).toBe(true);

    // notify runs AFTER the tx, and is NOT one of the composed ops.
    expect(notifyMock).toHaveBeenCalledWith("host1", "LISTING_APPROVED", {
      listingTitle: "บ้านสระว่ายน้ำ",
    });
    expect(auditCreate.mock.invocationCallOrder[0]).toBeLessThan(
      notifyMock.mock.invocationCallOrder[0]!,
    );
    expect(ops.some((o) => o.op === "notify")).toBe(false);
  });
});

describe("rejectSubmission", () => {
  it("throws REASON_REQUIRED on a blank reason (before any read)", async () => {
    await expect(rejectSubmission(admin, "s1", "   ")).rejects.toMatchObject({
      reason: "REASON_REQUIRED",
    });
    expect(subFindUnique).not.toHaveBeenCalled();
  });

  it("composes [listing, kyc, purge, audit] with purgeAfter ~ now+90d, notifies reason", async () => {
    subFindUnique.mockResolvedValue(pendingSubmission());
    const t0 = Date.now();
    await rejectSubmission(admin, "s1", " ภาพปลอม ");

    const ops = txOps();
    expect(ops).toHaveLength(4);
    const purge = ops.find((o) => o.op === "doc.updateMany");
    const purgeAfter = purge?.args?.data?.purgeAfter as Date;
    const days = (purgeAfter.getTime() - t0) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);

    const audit = ops.find((o) => o.op === "audit.create");
    expect(audit?.args?.data?.action).toBe("LISTING_REJECTED");
    expect((audit?.args?.data?.after as Record<string, unknown>).reason).toBe("ภาพปลอม");
    expect(notifyMock).toHaveBeenCalledWith("host1", "LISTING_REJECTED", {
      listingTitle: "บ้านสระว่ายน้ำ",
      reason: "ภาพปลอม",
    });
  });
});

describe("requestNeedsInfo", () => {
  it("throws EMPTY_NEEDS_INFO when no items", async () => {
    await expect(requestNeedsInfo(admin, "s1", [])).rejects.toMatchObject({
      reason: "EMPTY_NEEDS_INFO",
    });
    expect(tx).not.toHaveBeenCalled();
  });

  it("composes [listing, kyc, audit] persisting items, notifies items", async () => {
    subFindUnique.mockResolvedValue(pendingSubmission());
    const items = [{ item: "THAI_ID_UNCLEAR" as const, satisfied: false }];
    await requestNeedsInfo(admin, "s1", items);

    const ops = txOps();
    expect(ops).toHaveLength(3);
    const audit = ops.find((o) => o.op === "audit.create");
    expect(audit?.args?.data?.action).toBe("LISTING_NEEDS_INFO");
    expect((audit?.args?.data?.after as Record<string, unknown>).items).toEqual(items);
    expect(notifyMock).toHaveBeenCalledWith("host1", "LISTING_NEEDS_INFO", {
      listingTitle: "บ้านสระว่ายน้ำ",
      items,
    });
  });
});

describe("setLegalBadge", () => {
  it("grant: own tx [listing, audit], never touches KYC or listing status; works in any state", async () => {
    listingFindUnique.mockResolvedValue({ id: "l1", legalBadgeAt: null });
    await setLegalBadge(admin, "l1", true);

    expect(subFindUnique).not.toHaveBeenCalled();
    const ops = txOps();
    expect(ops).toHaveLength(2);
    expect(ops.some((o) => o.op === "kyc.update")).toBe(false);
    const listingOp = ops.find((o) => o.op === "listing.update");
    expect(listingOp?.args?.data).toHaveProperty("legalBadgeAt");
    expect(listingOp?.args?.data).not.toHaveProperty("status");
    const audit = ops.find((o) => o.op === "audit.create");
    expect(audit?.args?.data?.action).toBe("LEGAL_BADGE_GRANTED");
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("refuse: clears legalBadgeAt + audits LEGAL_BADGE_REFUSED", async () => {
    listingFindUnique.mockResolvedValue({ id: "l1", legalBadgeAt: new Date() });
    await setLegalBadge(admin, "l1", false);
    const ops = txOps();
    const listingOp = ops.find((o) => o.op === "listing.update");
    expect(listingOp?.args?.data).toEqual({ legalBadgeAt: null });
    const audit = ops.find((o) => o.op === "audit.create");
    expect(audit?.args?.data?.action).toBe("LEGAL_BADGE_REFUSED");
  });

  it("throws NOT_FOUND for a missing listing", async () => {
    listingFindUnique.mockResolvedValue(null);
    await expect(setLegalBadge(admin, "l1", true)).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });
});
