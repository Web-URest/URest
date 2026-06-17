import { BookingStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: vi.fn() } } }));
vi.mock("./transitions", () => ({ expire: vi.fn(), checkIn: vi.fn(), complete: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { checkIn, complete, expire } from "./transitions";

import {
  CHECKIN_OFFSET_MS,
  CHECKOUT_OFFSET_MS,
  sweepDueCheckIns,
  sweepDueCheckouts,
  sweepOverduePayments,
  sweepOverdueRequests,
} from "./sweeps";

const findMany = prisma.booking.findMany as unknown as Mock;
const expireMock = expire as unknown as Mock;
const checkInMock = checkIn as unknown as Mock;
const completeMock = complete as unknown as Mock;
const notifyFn = notify as unknown as Mock;

const NOW = new Date("2026-06-20T03:00:00.000Z");

beforeEach(() => {
  expireMock.mockResolvedValue({});
  checkInMock.mockResolvedValue({});
  completeMock.mockResolvedValue({});
  notifyFn.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("sweepOverdueRequests", () => {
  it("expires every REQUESTED booking past its respond-by and notifies the guest", async () => {
    findMany.mockResolvedValue([
      { id: "b1", userId: "g1", listing: { title: "วิลล่า A" } },
      { id: "b2", userId: "g2", listing: { title: "วิลล่า B" } },
    ]);

    const n = await sweepOverdueRequests(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.REQUESTED, respondBy: { lt: NOW } },
      select: { id: true, userId: true, listing: { select: { title: true } } },
    });
    expect(expireMock).toHaveBeenCalledWith("b1", NOW);
    expect(notifyFn).toHaveBeenCalledWith("g1", "REQUEST_EXPIRED", expect.objectContaining({ listingTitle: "วิลล่า A" }));
    expect(notifyFn).toHaveBeenCalledWith("g2", "REQUEST_EXPIRED", expect.objectContaining({ listingTitle: "วิลล่า B" }));
    expect(n).toBe(2);
  });

  it("is a no-op when nothing is due", async () => {
    findMany.mockResolvedValue([]);
    const n = await sweepOverdueRequests(NOW);
    expect(expireMock).not.toHaveBeenCalled();
    expect(notifyFn).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it("isolates a per-row failure (no notify for the failed row) and processes the rest", async () => {
    findMany.mockResolvedValue([
      { id: "bad", userId: "g1", listing: { title: "วิลล่า A" } },
      { id: "ok", userId: "g2", listing: { title: "วิลล่า B" } },
    ]);
    expireMock.mockReset();
    expireMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const n = await sweepOverdueRequests(NOW);

    expect(expireMock).toHaveBeenCalledTimes(2);
    expect(notifyFn).toHaveBeenCalledTimes(1); // only the succeeding row
    expect(notifyFn).toHaveBeenCalledWith("g2", "REQUEST_EXPIRED", expect.anything());
    expect(n).toBe(1);
    spy.mockRestore();
  });
});

describe("sweepOverduePayments", () => {
  it("expires AWAITING_PAYMENT past pay-by and notifies the host for REQUEST-mode bookings", async () => {
    findMany.mockResolvedValue([
      { id: "p1", bookingMode: "REQUEST", listing: { hostId: "h1", title: "วิลล่า A" } },
      { id: "p2", bookingMode: "INSTANT", listing: { hostId: "h2", title: "วิลล่า B" } },
    ]);

    const n = await sweepOverduePayments(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: NOW } },
      select: { id: true, bookingMode: true, listing: { select: { hostId: true, title: true } } },
    });
    expect(expireMock).toHaveBeenCalledWith("p1", NOW);
    expect(expireMock).toHaveBeenCalledWith("p2", NOW);
    expect(notifyFn).toHaveBeenCalledTimes(1); // only the REQUEST-mode host
    expect(notifyFn).toHaveBeenCalledWith("h1", "PAYMENT_EXPIRED_HOST", { listingTitle: "วิลล่า A", bookingId: "p1" });
    expect(n).toBe(2);
  });

  it("isolates a per-row failure (no notify for the failed row)", async () => {
    findMany.mockResolvedValue([
      { id: "bad", bookingMode: "REQUEST", listing: { hostId: "h1", title: "วิลล่า A" } },
      { id: "ok", bookingMode: "REQUEST", listing: { hostId: "h2", title: "วิลล่า B" } },
    ]);
    expireMock.mockReset();
    expireMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const n = await sweepOverduePayments(NOW);

    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(notifyFn).toHaveBeenCalledWith("h2", "PAYMENT_EXPIRED_HOST", expect.anything());
    expect(n).toBe(1);
    spy.mockRestore();
  });
});

describe("sweepDueCheckIns", () => {
  it("checks in CONFIRMED bookings once 15:00 ICT (now − 8h) has passed", async () => {
    findMany.mockResolvedValue([{ id: "c1" }]);
    const n = await sweepDueCheckIns(NOW);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.CONFIRMED, checkIn: { lte: new Date(NOW.getTime() - CHECKIN_OFFSET_MS) } },
      select: { id: true },
    });
    expect(checkInMock).toHaveBeenCalledWith("c1");
    expect(n).toBe(1);
  });
});

describe("sweepDueCheckouts", () => {
  it("completes CHECKED_IN bookings once 11:00 ICT (now − 4h) has passed", async () => {
    findMany.mockResolvedValue([{ id: "d1" }]);
    const n = await sweepDueCheckouts(NOW);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.CHECKED_IN, checkOut: { lte: new Date(NOW.getTime() - CHECKOUT_OFFSET_MS) } },
      select: { id: true },
    });
    expect(completeMock).toHaveBeenCalledWith("d1");
    expect(n).toBe(1);
  });
});

it("CHECKIN/CHECKOUT offsets are 8h/4h (ICT = UTC+7)", () => {
  expect(CHECKIN_OFFSET_MS).toBe(8 * 60 * 60 * 1000);
  expect(CHECKOUT_OFFSET_MS).toBe(4 * 60 * 60 * 1000);
});
