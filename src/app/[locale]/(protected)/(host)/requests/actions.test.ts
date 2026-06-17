import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth/guards", () => ({ requireHostEligible: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/booking/transitions", () => {
  class BookingError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "BookingError";
    }
  }
  return { BookingError, accept: vi.fn(), decline: vi.fn(), cancelByGuest: vi.fn() };
});
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { requireHostEligible, requireUser } from "@/lib/auth/guards";
import { accept, BookingError, cancelByGuest, decline } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { acceptRequest, declineRequest, withdrawRequest } from "./actions";

const hostGuard = requireHostEligible as unknown as Mock;
const userGuard = requireUser as unknown as Mock;
const findBooking = prisma.booking.findUnique as unknown as Mock;
const acceptFn = accept as unknown as Mock;
const declineFn = decline as unknown as Mock;
const cancelFn = cancelByGuest as unknown as Mock;
const notifyFn = notify as unknown as Mock;

beforeEach(() => {
  hostGuard.mockResolvedValue({ id: "host1" });
  userGuard.mockResolvedValue({ id: "guest1" });
  findBooking.mockResolvedValue({ id: "bk1", userId: "guest1", listing: { title: "วิลล่า A" } });
  acceptFn.mockResolvedValue({ id: "bk1" });
  declineFn.mockResolvedValue({ id: "bk1" });
  cancelFn.mockResolvedValue({ id: "bk1" });
  notifyFn.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("acceptRequest", () => {
  it("accepts and notifies the guest", async () => {
    const res = await acceptRequest("bk1");
    expect(acceptFn).toHaveBeenCalledWith("bk1", "host1", expect.any(Date));
    expect(notifyFn).toHaveBeenCalledWith("guest1", "REQUEST_ACCEPTED", expect.objectContaining({ listingTitle: "วิลล่า A" }));
    expect(res).toEqual({ ok: true });
  });

  it("maps a non-owner BookingError to errorNotOwner", async () => {
    acceptFn.mockRejectedValue(new BookingError("NOT_HOST"));
    expect(await acceptRequest("bk1")).toEqual({ ok: false, error: "errorNotOwner" });
    expect(notifyFn).not.toHaveBeenCalled();
  });
});

describe("declineRequest", () => {
  it("declines and notifies the guest", async () => {
    await declineRequest("bk1");
    expect(declineFn).toHaveBeenCalledWith("bk1", "host1");
    expect(notifyFn).toHaveBeenCalledWith("guest1", "REQUEST_DECLINED", expect.objectContaining({ listingTitle: "วิลล่า A" }));
  });
});

describe("withdrawRequest", () => {
  it("withdraws via cancelByGuest", async () => {
    const res = await withdrawRequest("bk1");
    expect(cancelFn).toHaveBeenCalledWith("bk1", "guest1", expect.any(Date));
    expect(res).toEqual({ ok: true });
  });
});
