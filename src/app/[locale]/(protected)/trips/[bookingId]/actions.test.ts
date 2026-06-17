import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/guards", () => {
  class AuthError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "AuthError";
    }
  }
  return { AuthError, requireUser: vi.fn() };
});
vi.mock("@/lib/booking/transitions", () => {
  class BookingError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "BookingError";
    }
  }
  return { BookingError, cancelByGuest: vi.fn() };
});
vi.mock("@/lib/payments/charge", () => ({ refundBookingToGuest: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() } } }));

import { BookingError, cancelByGuest } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { refundBookingToGuest } from "@/lib/payments/charge";

import { cancelBookingByGuest } from "./actions";

const cancelFn = cancelByGuest as unknown as Mock;
const refundFn = refundBookingToGuest as unknown as Mock;
const notifyFn = notify as unknown as Mock;
const findBooking = prisma.booking.findUnique as unknown as Mock;

beforeEach(async () => {
  const { requireUser } = await import("@/lib/auth/guards");
  (requireUser as unknown as Mock).mockResolvedValue({ id: "guest1" });
  cancelFn.mockResolvedValue({ id: "bk1" });
  refundFn.mockResolvedValue(undefined);
  notifyFn.mockResolvedValue(undefined);
  findBooking.mockResolvedValue({ listing: { hostId: "host1", title: "วิลล่า A" } });
});
afterEach(() => vi.clearAllMocks());

describe("cancelBookingByGuest", () => {
  it("cancels via the transition, fires the Opn refund, and notifies the host", async () => {
    const res = await cancelBookingByGuest("bk1");
    expect(cancelFn).toHaveBeenCalledWith("bk1", "guest1", expect.any(Date));
    expect(refundFn).toHaveBeenCalledWith("bk1");
    expect(notifyFn).toHaveBeenCalledWith("host1", "BOOKING_CANCELLED_BY_GUEST", expect.objectContaining({ listingTitle: "วิลล่า A", bookingId: "bk1" }));
    expect(res).toEqual({ ok: true });
  });

  it("maps a non-guest caller to errorNotOwner (no refund, no notify)", async () => {
    cancelFn.mockRejectedValue(new BookingError("NOT_GUEST"));
    expect(await cancelBookingByGuest("bk1")).toEqual({ ok: false, error: "errorNotOwner" });
    expect(refundFn).not.toHaveBeenCalled();
    expect(notifyFn).not.toHaveBeenCalled();
  });

  it("maps a wrong-state booking to errorWrongState", async () => {
    cancelFn.mockRejectedValue(new BookingError("WRONG_STATE"));
    expect(await cancelBookingByGuest("bk1")).toEqual({ ok: false, error: "errorWrongState" });
  });
});
