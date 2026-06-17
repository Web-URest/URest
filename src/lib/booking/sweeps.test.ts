import { BookingStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { booking: { findMany: vi.fn() } } }));
vi.mock("./transitions", () => ({ expire: vi.fn(), checkIn: vi.fn(), complete: vi.fn() }));

import { prisma } from "@/lib/db";
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

const NOW = new Date("2026-06-20T03:00:00.000Z");

beforeEach(() => {
  expireMock.mockResolvedValue({});
  checkInMock.mockResolvedValue({});
  completeMock.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("sweepOverdueRequests", () => {
  it("expires every REQUESTED booking past its respond-by", async () => {
    findMany.mockResolvedValue([{ id: "b1" }, { id: "b2" }]);

    const n = await sweepOverdueRequests(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.REQUESTED, respondBy: { lt: NOW } },
      select: { id: true },
    });
    expect(expireMock).toHaveBeenCalledWith("b1", NOW);
    expect(expireMock).toHaveBeenCalledWith("b2", NOW);
    expect(n).toBe(2);
  });

  it("is a no-op when nothing is due", async () => {
    findMany.mockResolvedValue([]);
    const n = await sweepOverdueRequests(NOW);
    expect(expireMock).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it("isolates a per-row failure and still processes the rest", async () => {
    findMany.mockResolvedValue([{ id: "bad" }, { id: "ok" }]);
    expireMock.mockReset();
    expireMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const n = await sweepOverdueRequests(NOW);

    expect(expireMock).toHaveBeenCalledTimes(2);
    expect(n).toBe(1); // only the succeeding row counts
    spy.mockRestore();
  });
});

describe("sweepOverduePayments", () => {
  it("expires every AWAITING_PAYMENT booking past its pay-by", async () => {
    findMany.mockResolvedValue([{ id: "p1" }]);
    const n = await sweepOverduePayments(NOW);
    expect(findMany).toHaveBeenCalledWith({
      where: { status: BookingStatus.AWAITING_PAYMENT, payBy: { lt: NOW } },
      select: { id: true },
    });
    expect(expireMock).toHaveBeenCalledWith("p1", NOW);
    expect(n).toBe(1);
  });
});

describe("sweepDueCheckIns", () => {
  it("checks in CONFIRMED bookings once 15:00 ICT (now − 8h) has passed", async () => {
    findMany.mockResolvedValue([{ id: "c1" }]);

    const n = await sweepDueCheckIns(NOW);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.CONFIRMED,
        checkIn: { lte: new Date(NOW.getTime() - CHECKIN_OFFSET_MS) },
      },
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
      where: {
        status: BookingStatus.CHECKED_IN,
        checkOut: { lte: new Date(NOW.getTime() - CHECKOUT_OFFSET_MS) },
      },
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
