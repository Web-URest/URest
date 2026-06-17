import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Self-contained mock: the real guards import next-auth (→ next/server), which
// vitest can't resolve. A stand-in AuthError keeps `instanceof` working since
// the action imports it from this same mocked module.
vi.mock("@/lib/auth/guards", () => {
  class AuthError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "AuthError";
    }
  }
  return { AuthError, requirePhoneVerified: vi.fn() };
});
vi.mock("@/lib/booking/transitions", () => ({ request: vi.fn() }));
vi.mock("@/lib/pricing/quote", () => ({ buildQuote: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/listing/queries", () => ({ getListingDetail: vi.fn() }));

import { AuthError, requirePhoneVerified } from "@/lib/auth/guards";
import { request } from "@/lib/booking/transitions";
import { getListingDetail } from "@/lib/listing/queries";
import { notify } from "@/lib/notifications";
import { buildQuote } from "@/lib/pricing/quote";

import { createBookingRequest } from "./actions";

const guard = requirePhoneVerified as unknown as Mock;
const getDetail = getListingDetail as unknown as Mock;
const quote = buildQuote as unknown as Mock;
const requestFn = request as unknown as Mock;
const notifyFn = notify as unknown as Mock;

const INPUT = { listingId: "l1", checkIn: "2026-07-01", checkOut: "2026-07-03", guests: 4, note: "ครอบครัว" };
const LISTING = {
  id: "l1", title: "วิลล่า A", bookingMode: "REQUEST", hostId: "host1",
  cancellationTier: "MODERATE",
  baseWeekdaySatang: 1_000_00, baseWeekendSatang: 1_000_00, holidaySatang: 1_000_00,
  includedGuests: 6, extraGuestFeeSatang: 0, seasons: [],
};

beforeEach(() => {
  guard.mockResolvedValue({ id: "guest1" });
  getDetail.mockResolvedValue({ listing: LISTING, holidaySet: new Set<string>() });
  quote.mockReturnValue({ nights: [], totalSatang: 2_000_00, commissionSatang: 200_00 });
  requestFn.mockResolvedValue({ id: "bk1" });
  notifyFn.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("createBookingRequest", () => {
  it("snapshots the quote, creates a REQUESTED booking, and notifies the host", async () => {
    const res = await createBookingRequest(INPUT);
    expect(guard).toHaveBeenCalled();
    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: "l1", userId: "guest1", totalSatang: 2_000_00, commissionSatang: 200_00,
        cancellationTier: "MODERATE", houseRulesText: null, guestNoteToHost: "ครอบครัว",
      }),
      expect.any(Date),
    );
    expect(notifyFn).toHaveBeenCalledWith("host1", "BOOKING_REQUESTED", expect.any(Object));
    expect(res).toEqual({ ok: true, bookingId: "bk1" });
  });

  it("rejects when the listing isn't available (loader returns null)", async () => {
    getDetail.mockResolvedValue(null);
    expect(await createBookingRequest(INPUT)).toEqual({ ok: false, error: "errorUnavailable" });
    expect(requestFn).not.toHaveBeenCalled();
  });

  it("rejects a non-REQUEST (instant) listing", async () => {
    getDetail.mockResolvedValue({ listing: { ...LISTING, bookingMode: "INSTANT" }, holidaySet: new Set<string>() });
    expect(await createBookingRequest(INPUT)).toEqual({ ok: false, error: "errorUnavailable" });
  });

  it("maps the double-booking exclusion to errorDatesTaken", async () => {
    requestFn.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("x", { code: "P2010", clientVersion: "6" }));
    expect(await createBookingRequest(INPUT)).toEqual({ ok: false, error: "errorDatesTaken" });
  });

  it("surfaces the phone-unverified ladder error", async () => {
    guard.mockRejectedValue(new AuthError("PHONE_UNVERIFIED"));
    expect(await createBookingRequest(INPUT)).toEqual({ ok: false, error: "errorPhoneUnverified" });
  });
});
