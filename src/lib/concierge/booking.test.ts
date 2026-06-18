import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/pricing/quote", () => ({ buildQuote: vi.fn() }));
vi.mock("@/lib/booking/transitions", () => ({ request: vi.fn(), instantHold: vi.fn() }));
vi.mock("@/lib/payments/opn", () => ({ createPromptPayCharge: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    listing: { findUnique: vi.fn() },
    calendarBlock: { findFirst: vi.fn() },
    booking: { findFirst: vi.fn() },
    thaiHoliday: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    conciergeBookingDraft: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { instantHold, request } from "@/lib/booking/transitions";
import { notify } from "@/lib/notifications";
import { createPromptPayCharge } from "@/lib/payments/opn";
import { buildQuote } from "@/lib/pricing/quote";

import { confirmDraft, createDraft, submitDraft } from "./booking";

const db = prisma as unknown as {
  listing: { findUnique: Mock };
  calendarBlock: { findFirst: Mock };
  booking: { findFirst: Mock };
  thaiHoliday: { findMany: Mock };
  user: { findUnique: Mock };
  conciergeBookingDraft: { create: Mock; findUnique: Mock; update: Mock };
};
const buildQuoteMock = buildQuote as unknown as Mock;
const requestMock = request as unknown as Mock;
const instantHoldMock = instantHold as unknown as Mock;
const chargeMock = createPromptPayCharge as unknown as Mock;
const notifyMock = notify as unknown as Mock;

const NOW = new Date("2026-07-01T00:00:00Z");

const LISTING = {
  id: "lst1",
  title: "วิลล่า A",
  status: "PUBLISHED",
  maxGuests: 8,
  baseWeekdaySatang: 1_000_000,
  baseWeekendSatang: 1_200_000,
  holidaySatang: null,
  includedGuests: 6,
  extraGuestFeeSatang: 0,
  cancellationTier: "MODERATE",
  bookingMode: "REQUEST",
  hostId: "host1",
  seasons: [],
};
const QUOTE = {
  nights: [
    { date: "2026-08-01", rule: "BASE", dayKind: "WEEKDAY", rateSatang: 1_000_000 },
    { date: "2026-08-02", rule: "BASE", dayKind: "WEEKDAY", rateSatang: 1_000_000 },
  ],
  nightsSubtotalSatang: 2_000_000,
  extraGuestFeeSatang: 0,
  totalSatang: 2_000_000,
  commissionSatang: 200_000,
  hostEarningsSatang: 1_800_000,
  nightCount: 2,
  guests: 4,
};
const draftInput = {
  sessionId: "s1",
  userId: "guest1",
  listingId: "lst1",
  checkIn: "2026-08-01",
  checkOut: "2026-08-03",
  guests: 4,
};

afterEach(() => vi.clearAllMocks());

describe("createDraft", () => {
  it("rejects an over-capacity request without writing a draft", async () => {
    db.listing.findUnique.mockResolvedValue(LISTING);
    const res = await createDraft({ ...draftInput, guests: 10 }, NOW);
    expect(res).toMatchObject({ ok: false, reason: "OVER_CAPACITY" });
    expect(db.conciergeBookingDraft.create).not.toHaveBeenCalled();
  });

  it("rejects unavailable dates (calendar/booking conflict)", async () => {
    db.listing.findUnique.mockResolvedValue(LISTING);
    db.calendarBlock.findFirst.mockResolvedValue({ id: "blk1" });
    db.booking.findFirst.mockResolvedValue(null);
    const res = await createDraft(draftInput, NOW);
    expect(res).toMatchObject({ ok: false, reason: "UNAVAILABLE" });
    expect(db.conciergeBookingDraft.create).not.toHaveBeenCalled();
  });

  it("computes the quote and writes a draft snapshot with a TTL", async () => {
    db.listing.findUnique.mockResolvedValue(LISTING);
    db.calendarBlock.findFirst.mockResolvedValue(null);
    db.booking.findFirst.mockResolvedValue(null);
    db.thaiHoliday.findMany.mockResolvedValue([]);
    buildQuoteMock.mockReturnValue(QUOTE);
    db.conciergeBookingDraft.create.mockResolvedValue({ id: "d1" });

    const res = await createDraft(draftInput, NOW);

    expect(buildQuoteMock).toHaveBeenCalled();
    const data = db.conciergeBookingDraft.create.mock.calls[0]?.[0]?.data;
    expect(data).toMatchObject({
      sessionId: "s1",
      userId: "guest1",
      listingId: "lst1",
      guests: 4,
      totalSatang: 2_000_000,
      commissionSatang: 200_000,
      cancellationTier: "MODERATE",
    });
    expect(data.expiresAt.getTime()).toBe(NOW.getTime() + 30 * 60 * 1000);
    expect(res).toMatchObject({ ok: true, draft: { draftId: "d1", title: "วิลล่า A", nights: 2, totalSatang: 2_000_000 } });
  });
});

describe("confirmDraft", () => {
  it("mints the token window on the owning user's draft", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue({
      id: "d1",
      userId: "guest1",
      consumedBookingId: null,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });

    const res = await confirmDraft("d1", "guest1", NOW);

    expect(res.ok).toBe(true);
    const data = db.conciergeBookingDraft.update.mock.calls[0]?.[0]?.data;
    expect(data.confirmedAt).toEqual(NOW);
    expect(typeof data.confirmTokenHash).toBe("string");
    expect(data.confirmTokenExpiresAt.getTime()).toBe(NOW.getTime() + 10 * 60 * 1000);
  });

  it("refuses a draft owned by another user", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue({ id: "d1", userId: "someoneElse", consumedBookingId: null, expiresAt: new Date(NOW.getTime() + 60_000) });
    const res = await confirmDraft("d1", "guest1", NOW);
    expect(res.ok).toBe(false);
    expect(db.conciergeBookingDraft.update).not.toHaveBeenCalled();
  });
});

describe("submitDraft gates", () => {
  const confirmed = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    userId: "guest1",
    listingId: "lst1",
    checkIn: new Date("2026-08-01"),
    checkOut: new Date("2026-08-03"),
    guests: 4,
    priceLines: QUOTE.nights,
    totalSatang: 2_000_000,
    commissionSatang: 200_000,
    cancellationTier: "MODERATE",
    guestNoteToHost: null,
    consumedBookingId: null,
    confirmedAt: NOW,
    confirmTokenHash: "abc",
    confirmTokenExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    ...over,
  });

  it("refuses an unconfirmed draft (no tap)", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue(confirmed({ confirmedAt: null, confirmTokenHash: null, confirmTokenExpiresAt: null }));
    expect(await submitDraft("d1", "guest1", NOW)).toMatchObject({ ok: false, reason: "NEEDS_CONFIRM" });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("refuses an expired confirmation", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue(confirmed({ confirmTokenExpiresAt: new Date(NOW.getTime() - 1000) }));
    expect(await submitDraft("d1", "guest1", NOW)).toMatchObject({ ok: false, reason: "EXPIRED" });
  });

  it("refuses a re-submit (single-use)", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue(confirmed({ consumedBookingId: "bk0" }));
    expect(await submitDraft("d1", "guest1", NOW)).toMatchObject({ ok: false, reason: "ALREADY_SUBMITTED" });
  });

  it("REQUEST mode: creates the booking, consumes the draft, notifies the host, no QR", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue(confirmed());
    db.listing.findUnique.mockResolvedValue({ bookingMode: "REQUEST", hostId: "host1", title: "วิลล่า A" });
    db.user.findUnique.mockResolvedValue({ displayName: "สมชาย" });
    requestMock.mockResolvedValue({ id: "bk1", code: "UR-2608-0001" });

    const res = await submitDraft("d1", "guest1", NOW);

    expect(requestMock).toHaveBeenCalled();
    expect(db.conciergeBookingDraft.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { consumedBookingId: "bk1" } });
    expect(notifyMock).toHaveBeenCalledWith("host1", "BOOKING_REQUESTED", expect.objectContaining({ listingTitle: "วิลล่า A" }));
    expect(res).toMatchObject({ ok: true, mode: "REQUEST", bookingId: "bk1", code: "UR-2608-0001" });
    expect((res as { qrUrl?: string }).qrUrl).toBeUndefined();
  });

  it("INSTANT mode: instant-holds + returns the PromptPay QR, no host notify", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue(confirmed());
    db.listing.findUnique.mockResolvedValue({ bookingMode: "INSTANT", hostId: "host1", title: "วิลล่า A" });
    instantHoldMock.mockResolvedValue({ id: "bk2", code: null });
    chargeMock.mockResolvedValue({ source: { scannable_code: { image: { download_uri: "https://cdn/qr.png" } } } });

    const res = await submitDraft("d1", "guest1", NOW);

    expect(instantHoldMock).toHaveBeenCalled();
    expect(chargeMock).toHaveBeenCalledWith({ amountSatang: 2_000_000, bookingId: "bk2" });
    expect(res).toMatchObject({ ok: true, mode: "INSTANT", bookingId: "bk2", qrUrl: "https://cdn/qr.png" });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("maps a double-booking race to DATES_TAKEN", async () => {
    db.conciergeBookingDraft.findUnique.mockResolvedValue(confirmed());
    db.listing.findUnique.mockResolvedValue({ bookingMode: "REQUEST", hostId: "host1", title: "วิลล่า A" });
    db.user.findUnique.mockResolvedValue({ displayName: "สมชาย" });
    requestMock.mockRejectedValue(new Error("exclusion constraint"));

    expect(await submitDraft("d1", "guest1", NOW)).toMatchObject({ ok: false, reason: "DATES_TAKEN" });
    expect(db.conciergeBookingDraft.update).not.toHaveBeenCalled();
  });
});
