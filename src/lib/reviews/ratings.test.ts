import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: vi.fn() },
    guestRating: { create: vi.fn(), aggregate: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";

import { canRateGuest, loadGuestRatingSummary, rateGuest, RatingError } from "./ratings";

const db = prisma as unknown as {
  booking: { findUnique: Mock };
  guestRating: { create: Mock; aggregate: Mock };
};

const completed = (over: Record<string, unknown> = {}) => ({
  status: "COMPLETED",
  userId: "guest1",
  listing: { hostId: "host1" },
  guestRating: null,
  ...over,
});

afterEach(() => vi.clearAllMocks());

describe("rateGuest gates", () => {
  const rate = (over: Record<string, unknown> = {}) =>
    rateGuest({ bookingId: "bk1", hostRaterId: "host1", score: 5, ...over });

  it("rejects a missing booking", async () => {
    db.booking.findUnique.mockResolvedValue(null);
    await expect(rate()).rejects.toMatchObject({ reason: "NOT_FOUND" });
    expect(db.guestRating.create).not.toHaveBeenCalled();
  });

  it("rejects a rater who isn't the listing's host", async () => {
    db.booking.findUnique.mockResolvedValue(completed());
    await expect(rate({ hostRaterId: "someoneElse" })).rejects.toMatchObject({ reason: "NOT_HOST" });
  });

  it("rejects a booking that isn't COMPLETED", async () => {
    db.booking.findUnique.mockResolvedValue(completed({ status: "CHECKED_IN" }));
    await expect(rate()).rejects.toMatchObject({ reason: "NOT_COMPLETED" });
  });

  it("rejects a second rating for the same booking", async () => {
    db.booking.findUnique.mockResolvedValue(completed({ guestRating: { id: "gr0" } }));
    await expect(rate()).rejects.toMatchObject({ reason: "ALREADY_RATED" });
  });

  it("rejects an out-of-range score before touching the DB", async () => {
    await expect(rate({ score: 0 })).rejects.toMatchObject({ reason: "INVALID_SCORE" });
    expect(db.booking.findUnique).not.toHaveBeenCalled();
  });
});

describe("rateGuest happy path", () => {
  it("creates a GuestRating with the booking's guest as ratee", async () => {
    db.booking.findUnique.mockResolvedValue(completed());

    await rateGuest({ bookingId: "bk1", hostRaterId: "host1", score: 4, reason: "  มาสาย  " });

    expect(db.guestRating.create).toHaveBeenCalledWith({
      data: { bookingId: "bk1", hostRaterId: "host1", guestRateeId: "guest1", score: 4, reason: "มาสาย" },
    });
  });
});

describe("canRateGuest", () => {
  it("returns ok for a ratable booking", async () => {
    db.booking.findUnique.mockResolvedValue(completed());
    expect(await canRateGuest("bk1", "host1")).toEqual({ ok: true });
  });
  it("returns the typed reason otherwise", async () => {
    db.booking.findUnique.mockResolvedValue(completed({ guestRating: { id: "gr0" } }));
    expect(await canRateGuest("bk1", "host1")).toEqual({ ok: false, reason: "ALREADY_RATED" });
  });
});

describe("loadGuestRatingSummary", () => {
  it("returns the average + count for a guest", async () => {
    db.guestRating.aggregate.mockResolvedValue({ _avg: { score: 4.5 }, _count: 4 });
    expect(await loadGuestRatingSummary("guest1")).toEqual({ avgScore: 4.5, count: 4 });
    expect(db.guestRating.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guestRateeId: "guest1" } }),
    );
  });
  it("returns a null average for a guest with no ratings", async () => {
    db.guestRating.aggregate.mockResolvedValue({ _avg: { score: null }, _count: 0 });
    expect(await loadGuestRatingSummary("new")).toEqual({ avgScore: null, count: 0 });
  });
});

it("RatingError carries its reason", () => {
  expect(new RatingError("NOT_HOST").reason).toBe("NOT_HOST");
});
