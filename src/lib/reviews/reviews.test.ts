import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ publicUrl: (k: string) => `https://cdn.test/${k}` }));
vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: vi.fn() },
    review: { findUnique: vi.fn(), create: vi.fn(), aggregate: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    listing: { update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { canReview, loadListingReviews, removeReview, ReviewError, submitReview } from "./reviews";

const notifyFn = notify as unknown as Mock;
const db = prisma as unknown as {
  booking: { findUnique: Mock };
  review: { findUnique: Mock; create: Mock; aggregate: Mock; findMany: Mock; update: Mock };
  listing: { update: Mock };
  auditLog: { create: Mock };
  $transaction: Mock;
};

const ADMIN = { id: "adm1", email: "a@u.test", displayName: "Admin" };
const GOOD = { overall: 5, cleanliness: 5, accuracyToPhotos: 4, hostResponsiveness: 5, valueForMoney: 4 };

/** Make the mocked interactive `$transaction` run its callback against the db mock. */
const armTx = () => db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));

const NOW_OK = new Date("2026-06-10T00:00:00Z"); // 9 days after checkout
const NOW_LATE = new Date("2026-06-20T00:00:00Z"); // 19 days after — window closed

const completed = (over: Record<string, unknown> = {}) => ({
  status: "COMPLETED",
  userId: "guest1",
  checkOut: new Date("2026-06-01T00:00:00Z"),
  code: "UR-2606-0001",
  listingId: "lst1",
  listing: { title: "วิลล่า A", hostId: "host1" },
  review: null,
  ...over,
});

afterEach(() => vi.clearAllMocks());

describe("submitReview gates", () => {
  const submit = (over: Record<string, unknown> = {}) => {
    armTx();
    return submitReview({ bookingId: "bk1", authorId: "guest1", ...GOOD, ...over }, NOW_OK);
  };

  it("rejects a missing booking", async () => {
    db.booking.findUnique.mockResolvedValue(null);
    await expect(submit()).rejects.toMatchObject({ reason: "NOT_FOUND" });
    expect(db.review.create).not.toHaveBeenCalled();
  });

  it("rejects an author who isn't the booking's guest", async () => {
    db.booking.findUnique.mockResolvedValue(completed());
    await expect(submit({ authorId: "intruder" })).rejects.toMatchObject({ reason: "NOT_GUEST" });
  });

  it("rejects a booking that isn't COMPLETED", async () => {
    db.booking.findUnique.mockResolvedValue(completed({ status: "CHECKED_IN" }));
    await expect(submit()).rejects.toMatchObject({ reason: "NOT_COMPLETED" });
  });

  it("rejects past the 14-day window", async () => {
    armTx();
    db.booking.findUnique.mockResolvedValue(completed());
    await expect(
      submitReview({ bookingId: "bk1", authorId: "guest1", ...GOOD }, NOW_LATE),
    ).rejects.toMatchObject({ reason: "WINDOW_CLOSED" });
  });

  it("rejects a second review for the same booking", async () => {
    db.booking.findUnique.mockResolvedValue(completed({ review: { id: "rv0" } }));
    await expect(submit()).rejects.toMatchObject({ reason: "ALREADY_REVIEWED" });
  });

  it("rejects an out-of-range score before touching the DB", async () => {
    await expect(submit({ overall: 6 })).rejects.toMatchObject({ reason: "INVALID_SCORE" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("submitReview happy path", () => {
  it("creates the review, recomputes the listing aggregate, then notifies the host", async () => {
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
    db.booking.findUnique.mockResolvedValue(completed());
    db.review.create.mockResolvedValue({ id: "rv1" });
    db.review.aggregate.mockResolvedValue({ _avg: { overall: 4.5 }, _count: 2 });

    await submitReview(
      { bookingId: "bk1", authorId: "guest1", ...GOOD, text: "  ดีมาก  ", photoKeys: ["reviews/bk1/a.jpg"] },
      NOW_OK,
    );

    expect(db.review.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookingId: "bk1",
        authorId: "guest1",
        overall: 5,
        cleanliness: 5,
        accuracyToPhotos: 4,
        hostResponsiveness: 5,
        valueForMoney: 4,
        text: "ดีมาก", // trimmed
        photoKeys: ["reviews/bk1/a.jpg"],
      }),
    });
    expect(db.listing.update).toHaveBeenCalledWith({
      where: { id: "lst1" },
      data: { avgRating: 4.5, reviewCount: 2 },
    });
    expect(notifyFn).toHaveBeenCalledWith(
      "host1",
      "REVIEW_RECEIVED_HOST",
      expect.objectContaining({ listingTitle: "วิลล่า A", code: "UR-2606-0001" }),
    );
  });
});

describe("canReview", () => {
  it("returns ok for an eligible booking", async () => {
    db.booking.findUnique.mockResolvedValue(completed());
    expect(await canReview("bk1", "guest1", NOW_OK)).toEqual({ ok: true });
  });
  it("returns the typed reason for an ineligible booking", async () => {
    db.booking.findUnique.mockResolvedValue(completed({ status: "CHECKED_IN" }));
    expect(await canReview("bk1", "guest1", NOW_OK)).toEqual({ ok: false, reason: "NOT_COMPLETED" });
  });
});

describe("removeReview", () => {
  it("soft-deletes, recomputes the aggregate, and writes an audit row", async () => {
    armTx();
    db.review.findUnique.mockResolvedValue({ id: "rv1", removedAt: null, booking: { listingId: "lst1" } });
    db.review.aggregate.mockResolvedValue({ _avg: { overall: 5 }, _count: 1 });

    await removeReview(ADMIN, "rv1", "doxxing");

    expect(db.review.update).toHaveBeenCalledWith({
      where: { id: "rv1" },
      data: expect.objectContaining({ removedByAdminId: "adm1", removedReason: "doxxing" }),
    });
    expect(db.review.update.mock.calls[0]?.[0]?.data?.removedAt).toBeInstanceOf(Date);
    expect(db.listing.update).toHaveBeenCalledWith({ where: { id: "lst1" }, data: { avgRating: 5, reviewCount: 1 } });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "REVIEW_REMOVED", targetId: "rv1" }),
    });
  });

  it("throws on a missing or already-removed review", async () => {
    armTx();
    db.review.findUnique.mockResolvedValue(null);
    await expect(removeReview(ADMIN, "nope", "x")).rejects.toBeInstanceOf(ReviewError);
  });
});

describe("loadListingReviews", () => {
  it("returns published reviews with photo URLs + a computed summary, filtering removed at the query", async () => {
    db.review.findMany.mockResolvedValue([
      {
        id: "rv1",
        overall: 5,
        cleanliness: 5,
        accuracyToPhotos: 5,
        hostResponsiveness: 5,
        valueForMoney: 5,
        text: "เยี่ยม",
        photoKeys: ["reviews/bk1/a.jpg"],
        createdAt: new Date("2026-06-10"),
        author: { displayName: "ก", image: null },
      },
      {
        id: "rv2",
        overall: 3,
        cleanliness: 3,
        accuracyToPhotos: 3,
        hostResponsiveness: 3,
        valueForMoney: 3,
        text: null,
        photoKeys: [],
        createdAt: new Date("2026-06-09"),
        author: { displayName: "ข", image: null },
      },
    ]);

    const res = await loadListingReviews("lst1");

    expect(db.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ removedAt: null, booking: { listingId: "lst1" } }) }),
    );
    expect(res.reviews[0]?.photoUrls).toEqual(["https://cdn.test/reviews/bk1/a.jpg"]);
    expect(res.reviews[0]?.verified).toBe(true);
    expect(res.summary.reviewCount).toBe(2);
    expect(res.summary.avgRating).toBe(4); // (5+3)/2
    expect(res.summary.subScores?.cleanliness).toBe(4);
  });

  it("returns a null summary when there are no reviews", async () => {
    db.review.findMany.mockResolvedValue([]);
    const res = await loadListingReviews("lst1");
    expect(res.summary).toEqual({ avgRating: null, reviewCount: 0, subScores: null });
  });
});
