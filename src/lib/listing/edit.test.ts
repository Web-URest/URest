import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    listing: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    season: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));

import { prisma } from "@/lib/db";
import {
  editLocation,
  editOperational,
  editSeasons,
  setBookingMode,
} from "./edit";
import { ListingError } from "./transitions";

const findUnique = prisma.listing.findUnique as unknown as Mock;
const update = prisma.listing.update as unknown as Mock;

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

function live(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    hostId: "h1",
    regionId: "r1",
    status: "PUBLISHED",
    title: "บ้านทดสอบ",
    bookingMode: "REQUEST",
    instantAckAt: null,
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("editOperational ownership + editable-state guards", () => {
  it("throws NOT_FOUND when missing", async () => {
    findUnique.mockResolvedValue(null);
    await expect(editOperational("l1", "h1", { title: "x" })).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
  });

  it("throws NOT_OWNER for another host", async () => {
    findUnique.mockResolvedValue(live({ hostId: "other" }));
    await expect(editOperational("l1", "h1", { title: "x" })).rejects.toMatchObject({
      reason: "NOT_OWNER",
    });
  });

  it.each(["DRAFT", "PENDING_REVIEW", "REJECTED"])(
    "throws NOT_EDITABLE for status %s",
    async (status) => {
      findUnique.mockResolvedValue(live({ status }));
      await expect(editOperational("l1", "h1", { title: "x" })).rejects.toMatchObject({
        reason: "NOT_EDITABLE",
      });
    },
  );

  it.each(["PUBLISHED", "UNLISTED", "NEEDS_INFO"])(
    "saves in place for editable status %s without touching status",
    async (status) => {
      findUnique.mockResolvedValue(live({ status }));
      update.mockResolvedValue(live({ status, title: "ใหม่" }));
      await editOperational("l1", "h1", { title: "ใหม่" });
      expect(update).toHaveBeenCalledWith({
        where: { id: "l1" },
        data: { title: "ใหม่" },
      });
      expect(update.mock.calls[0]?.[0].data).not.toHaveProperty("status");
    },
  );
});

describe("editLocation re-review", () => {
  it("flips a PUBLISHED listing to PENDING_REVIEW with the new location", async () => {
    findUnique.mockResolvedValue(live());
    update.mockResolvedValue(live({ status: "PENDING_REVIEW" }));
    await editLocation("l1", "h1", { address: "ใหม่", mapLat: 12.9, mapLng: 100.9 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { address: "ใหม่", mapLat: 12.9, mapLng: 100.9, status: "PENDING_REVIEW" },
    });
  });
});

describe("setBookingMode", () => {
  it("requires the ack to switch to INSTANT when never acknowledged", async () => {
    findUnique.mockResolvedValue(live({ instantAckAt: null }));
    await expect(setBookingMode("l1", "h1", "INSTANT", false)).rejects.toMatchObject({
      reason: "INSTANT_ACK_REQUIRED",
    });
  });

  it("records instantAckAt when switching to INSTANT with the ack", async () => {
    findUnique.mockResolvedValue(live({ instantAckAt: null }));
    update.mockResolvedValue(live({ bookingMode: "INSTANT" }));
    await setBookingMode("l1", "h1", "INSTANT", true);
    const data = update.mock.calls[0]?.[0].data;
    expect(data.bookingMode).toBe("INSTANT");
    expect(data.instantAckAt).toBeInstanceOf(Date);
  });

  it("keeps the prior instantAckAt when switching back to REQUEST", async () => {
    const acked = utc("2026-05-01");
    findUnique.mockResolvedValue(live({ bookingMode: "INSTANT", instantAckAt: acked }));
    update.mockResolvedValue(live({ bookingMode: "REQUEST" }));
    await setBookingMode("l1", "h1", "REQUEST", false);
    expect(update.mock.calls[0]?.[0].data).toEqual({
      bookingMode: "REQUEST",
      instantAckAt: acked,
    });
  });
});

describe("editSeasons", () => {
  it("rejects overlapping seasons on a live listing", async () => {
    findUnique.mockResolvedValue(live());
    await expect(
      editSeasons("l1", "h1", [
        { nameTh: "a", startDate: utc("2026-11-01"), endDate: utc("2026-12-15"), weekdaySatang: 1, weekendSatang: 1 },
        { nameTh: "b", startDate: utc("2026-12-10"), endDate: utc("2027-01-01"), weekdaySatang: 1, weekendSatang: 1 },
      ]),
    ).rejects.toMatchObject({ reason: "SEASON_OVERLAP" });
  });

  it("writes disjoint seasons via the shared transaction", async () => {
    findUnique.mockResolvedValue(live());
    await editSeasons("l1", "h1", [
      { nameTh: "a", startDate: utc("2026-11-01"), endDate: utc("2026-12-01"), weekdaySatang: 1, weekendSatang: 1 },
    ]);
    expect(prisma.season.deleteMany).toHaveBeenCalledWith({ where: { listingId: "l1" } });
    expect(prisma.season.createMany).toHaveBeenCalled();
  });
});

describe("ListingError is thrown, not a bare Error", () => {
  it("uses ListingError for guard failures", async () => {
    findUnique.mockResolvedValue(null);
    await expect(editOperational("l1", "h1", {})).rejects.toBeInstanceOf(ListingError);
  });
});
