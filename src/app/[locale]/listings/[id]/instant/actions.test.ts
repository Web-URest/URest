import { BookingStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Self-contained mock: the real guards import next-auth (→ next/server), which
// vitest can't resolve. A stand-in AuthError keeps `instanceof` working.
vi.mock("@/lib/auth/guards", () => {
  class AuthError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "AuthError";
    }
  }
  return { AuthError, requirePhoneVerified: vi.fn() };
});
vi.mock("@/lib/booking/transitions", () => ({ instantHold: vi.fn() }));
vi.mock("@/lib/pricing/quote", () => ({ buildQuote: vi.fn() }));
vi.mock("@/lib/listing/queries", () => ({ getListingDetail: vi.fn() }));

import { AuthError, requirePhoneVerified } from "@/lib/auth/guards";
import { instantHold } from "@/lib/booking/transitions";
import { getListingDetail } from "@/lib/listing/queries";
import { buildQuote } from "@/lib/pricing/quote";

import { createInstantBooking } from "./actions";

const guard = requirePhoneVerified as unknown as Mock;
const getDetail = getListingDetail as unknown as Mock;
const quote = buildQuote as unknown as Mock;
const holdFn = instantHold as unknown as Mock;

const INPUT = { listingId: "l1", checkIn: "2026-07-01", checkOut: "2026-07-03", guests: 4 };
const LISTING = {
  id: "l1", title: "วิลล่า A", bookingMode: "INSTANT", hostId: "host1",
  cancellationTier: "MODERATE",
  baseWeekdaySatang: 1_000_00, baseWeekendSatang: 1_000_00, holidaySatang: 1_000_00,
  includedGuests: 6, extraGuestFeeSatang: 0, seasons: [],
};

beforeEach(() => {
  guard.mockResolvedValue({ id: "guest1", displayName: "สมชาย" });
  getDetail.mockResolvedValue({ listing: LISTING, holidaySet: new Set<string>() });
  quote.mockReturnValue({ nights: [], totalSatang: 2_000_00, commissionSatang: 200_00 });
  holdFn.mockResolvedValue({ id: "bk1", status: BookingStatus.AWAITING_PAYMENT });
});
afterEach(() => vi.clearAllMocks());

describe("createInstantBooking", () => {
  it("snapshots the quote and holds the dates via instantHold (no host notification)", async () => {
    const res = await createInstantBooking(INPUT);
    expect(guard).toHaveBeenCalled();
    expect(holdFn).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: "l1", userId: "guest1", totalSatang: 2_000_00, commissionSatang: 200_00,
        cancellationTier: "MODERATE", houseRulesText: null,
      }),
      expect.any(Date),
    );
    // instant has no note-to-host field
    expect(holdFn.mock.calls[0]?.[0]).not.toHaveProperty("guestNoteToHost");
    expect(res).toEqual({ ok: true, bookingId: "bk1" });
  });

  it("rejects a non-INSTANT (request-mode) listing", async () => {
    getDetail.mockResolvedValue({ listing: { ...LISTING, bookingMode: "REQUEST" }, holidaySet: new Set<string>() });
    expect(await createInstantBooking(INPUT)).toEqual({ ok: false, error: "errorUnavailable" });
    expect(holdFn).not.toHaveBeenCalled();
  });

  it("rejects when the listing isn't available (loader returns null)", async () => {
    getDetail.mockResolvedValue(null);
    expect(await createInstantBooking(INPUT)).toEqual({ ok: false, error: "errorUnavailable" });
  });

  it("maps the double-booking exclusion to errorDatesTaken", async () => {
    holdFn.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'conflicting key value violates exclusion constraint "booking_no_double_booking"',
        { code: "P2010", clientVersion: "6" },
      ),
    );
    expect(await createInstantBooking(INPUT)).toEqual({ ok: false, error: "errorDatesTaken" });
  });

  it("propagates an unrelated DB error instead of mislabeling it as dates-taken", async () => {
    holdFn.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", { code: "P2003", clientVersion: "6" }),
    );
    await expect(createInstantBooking(INPUT)).rejects.toThrow();
  });

  it("surfaces the phone-unverified ladder error", async () => {
    guard.mockRejectedValue(new AuthError("PHONE_UNVERIFIED"));
    expect(await createInstantBooking(INPUT)).toEqual({ ok: false, error: "errorPhoneUnverified" });
  });
});
