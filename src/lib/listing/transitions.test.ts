import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    listing: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    listingPhoto: { count: vi.fn() },
    season: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    user: { updateMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { prisma } from "@/lib/db";
import {
  createDraft,
  ListingError,
  replaceSeasons,
  submitForReview,
  updateDraft,
} from "./transitions";

const findUnique = prisma.listing.findUnique as unknown as Mock;
const update = prisma.listing.update as unknown as Mock;
const create = prisma.listing.create as unknown as Mock;
const photoCount = prisma.listingPhoto.count as unknown as Mock;
const seasonFindMany = prisma.season.findMany as unknown as Mock;
const userUpdateMany = prisma.user.updateMany as unknown as Mock;
const txn = prisma.$transaction as unknown as Mock;

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

function draft(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    hostId: "h1",
    regionId: "r1",
    status: "DRAFT",
    title: "บ้านทดสอบ",
    baseWeekdaySatang: 12_900_00,
    baseWeekendSatang: 15_900_00,
    bookingMode: "REQUEST",
    instantAckAt: null,
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("createDraft", () => {
  it("creates a DRAFT row for the host + region", async () => {
    create.mockResolvedValue(draft());
    await createDraft("h1", "r1");
    expect(create).toHaveBeenCalledWith({
      data: { hostId: "h1", regionId: "r1", status: "DRAFT", title: "" },
    });
  });

  it("promotes the owner GUEST → HOST in the same transaction", async () => {
    create.mockResolvedValue(draft());
    await createDraft("h1", "r1");
    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: "h1", role: "GUEST" },
      data: { role: "HOST" },
    });
    // both writes commit together via one $transaction (atomic with the listing)
    expect(txn).toHaveBeenCalledOnce();
  });
});

describe("updateDraft ownership + state guards", () => {
  it("throws NOT_FOUND when the listing is missing", async () => {
    findUnique.mockResolvedValue(null);
    await expect(updateDraft("l1", "h1", { title: "x" })).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
  });

  it("throws NOT_OWNER for another host's listing", async () => {
    findUnique.mockResolvedValue(draft({ hostId: "someone-else" }));
    await expect(updateDraft("l1", "h1", { title: "x" })).rejects.toMatchObject({
      reason: "NOT_OWNER",
    });
  });

  it("throws NOT_DRAFT once submitted", async () => {
    findUnique.mockResolvedValue(draft({ status: "PENDING_REVIEW" }));
    await expect(updateDraft("l1", "h1", { title: "x" })).rejects.toBeInstanceOf(
      ListingError,
    );
  });

  it("writes the patch for an owned DRAFT and never touches status", async () => {
    findUnique.mockResolvedValue(draft());
    update.mockResolvedValue(draft({ title: "ใหม่" }));
    await updateDraft("l1", "h1", { title: "ใหม่" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { title: "ใหม่" },
    });
    expect(update.mock.calls[0]?.[0].data).not.toHaveProperty("status");
  });
});

describe("replaceSeasons", () => {
  it("rejects overlapping seasons before writing", async () => {
    findUnique.mockResolvedValue(draft());
    await expect(
      replaceSeasons("l1", "h1", [
        { nameTh: "a", startDate: utc("2026-11-01"), endDate: utc("2026-12-15"), weekdaySatang: 1, weekendSatang: 1 },
        { nameTh: "b", startDate: utc("2026-12-10"), endDate: utc("2027-01-01"), weekdaySatang: 1, weekendSatang: 1 },
      ]),
    ).rejects.toMatchObject({ reason: "SEASON_OVERLAP" });
  });
});

describe("submitForReview gate", () => {
  it("throws INCOMPLETE when required fields are missing", async () => {
    findUnique.mockResolvedValue(draft({ title: "" }));
    await expect(submitForReview("l1", "h1")).rejects.toMatchObject({
      reason: "INCOMPLETE",
    });
  });

  it("throws INSTANT_ACK_REQUIRED for instant mode without acknowledgment", async () => {
    findUnique.mockResolvedValue(draft({ bookingMode: "INSTANT", instantAckAt: null }));
    await expect(submitForReview("l1", "h1")).rejects.toMatchObject({
      reason: "INSTANT_ACK_REQUIRED",
    });
  });

  it("throws INSUFFICIENT_PHOTOS with fewer than 5 photos", async () => {
    findUnique.mockResolvedValue(draft());
    photoCount.mockResolvedValue(4);
    seasonFindMany.mockResolvedValue([]);
    await expect(submitForReview("l1", "h1")).rejects.toMatchObject({
      reason: "INSUFFICIENT_PHOTOS",
    });
  });

  it("transitions DRAFT → PENDING_REVIEW when the gate passes", async () => {
    findUnique.mockResolvedValue(draft());
    photoCount.mockResolvedValue(5);
    seasonFindMany.mockResolvedValue([]);
    update.mockResolvedValue(draft({ status: "PENDING_REVIEW" }));
    await submitForReview("l1", "h1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "PENDING_REVIEW" },
    });
  });
});
