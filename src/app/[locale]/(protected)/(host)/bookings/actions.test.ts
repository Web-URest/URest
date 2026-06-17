import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/guards", () => ({ requireHostEligible: vi.fn() }));
vi.mock("@/lib/booking/transitions", () => {
  class BookingError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "BookingError";
    }
  }
  return { BookingError, cancelByHost: vi.fn() };
});
vi.mock("@/lib/payments/charge", () => ({ refundBookingToGuest: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() } } }));

import { requireHostEligible } from "@/lib/auth/guards";
import { BookingError, cancelByHost } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { refundBookingToGuest } from "@/lib/payments/charge";

import { cancelBookingByHost } from "./actions";

const guard = requireHostEligible as unknown as Mock;
const cancelFn = cancelByHost as unknown as Mock;
const refundFn = refundBookingToGuest as unknown as Mock;
const notifyFn = notify as unknown as Mock;
const findBooking = prisma.booking.findUnique as unknown as Mock;

beforeEach(() => {
  guard.mockResolvedValue({ id: "host1" });
  cancelFn.mockResolvedValue({ id: "bk1" });
  refundFn.mockResolvedValue(undefined);
  notifyFn.mockResolvedValue(undefined);
  findBooking.mockResolvedValue({ userId: "guest1", totalSatang: 12_900_00, listing: { title: "วิลล่า A" } });
});
afterEach(() => vi.clearAllMocks());

describe("cancelBookingByHost", () => {
  it("cancels via the transition, refunds the guest 100%, and notifies the guest with the amount", async () => {
    const res = await cancelBookingByHost("bk1");
    expect(cancelFn).toHaveBeenCalledWith("bk1", "host1", expect.any(Date));
    expect(refundFn).toHaveBeenCalledWith("bk1");
    expect(notifyFn).toHaveBeenCalledWith(
      "guest1",
      "BOOKING_CANCELLED_BY_HOST",
      expect.objectContaining({ listingTitle: "วิลล่า A", refundSatang: 12_900_00, bookingId: "bk1" }),
    );
    expect(res).toEqual({ ok: true });
  });

  it("maps a non-owner host to errorNotOwner (no refund, no notify)", async () => {
    cancelFn.mockRejectedValue(new BookingError("NOT_HOST"));
    expect(await cancelBookingByHost("bk1")).toEqual({ ok: false, error: "errorNotOwner" });
    expect(refundFn).not.toHaveBeenCalled();
    expect(notifyFn).not.toHaveBeenCalled();
  });

  it("maps a wrong-state booking to errorWrongState", async () => {
    cancelFn.mockRejectedValue(new BookingError("WRONG_STATE"));
    expect(await cancelBookingByHost("bk1")).toEqual({ ok: false, error: "errorWrongState" });
  });
});
