import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/guards", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/booking/transitions", () => {
  class BookingError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
      this.name = "BookingError";
    }
  }
  return { BookingError, openDispute: vi.fn(), appealDispute: vi.fn() };
});
vi.mock("@/lib/reports/create", () => ({ createBookingReport: vi.fn() }));
vi.mock("@/lib/disputes/upload", () => ({ presignDisputePhotoUpload: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { booking: { findUnique: vi.fn() } } }));

import { BookingError, appealDispute, openDispute } from "@/lib/booking/transitions";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { createBookingReport } from "@/lib/reports/create";

import { appealDisputeAction, openDisputeAction } from "./actions";

const openFn = openDispute as unknown as Mock;
const appealFn = appealDispute as unknown as Mock;
const reportFn = createBookingReport as unknown as Mock;
const notifyFn = notify as unknown as Mock;
const findBooking = prisma.booking.findUnique as unknown as Mock;

beforeEach(async () => {
  const { requireUser } = await import("@/lib/auth/guards");
  (requireUser as unknown as Mock).mockResolvedValue({ id: "guest1" });
  openFn.mockResolvedValue({ id: "bk1" });
  reportFn.mockResolvedValue("r1");
  findBooking.mockResolvedValue({ userId: "guest1", code: "UR-2606-0001", listing: { title: "วิลล่า A", hostId: "host1" } });
});
afterEach(() => vi.clearAllMocks());

describe("openDisputeAction", () => {
  it("opens the dispute first, records the evidence report, and notifies both parties", async () => {
    const res = await openDisputeAction({
      bookingId: "bk1",
      category: "CLEANLINESS",
      text: "ห้องสกปรกมาก",
      photoKeys: ["disputes/bk1/a.jpg"],
    });

    expect(openFn).toHaveBeenCalledWith("bk1", "guest1");
    expect(reportFn).toHaveBeenCalledWith("guest1", "bk1", "CLEANLINESS", "ห้องสกปรกมาก", ["disputes/bk1/a.jpg"]);
    expect(notifyFn).toHaveBeenCalledWith("guest1", "DISPUTE_OPENED_GUEST", { listingTitle: "วิลล่า A" });
    expect(notifyFn).toHaveBeenCalledWith("host1", "DISPUTE_OPENED_HOST", { listingTitle: "วิลล่า A", code: "UR-2606-0001" });
    expect(res).toEqual({ ok: true });
  });

  it("does NOT create a report when the open gate fails (no orphan)", async () => {
    openFn.mockRejectedValue(new BookingError("WRONG_STATE"));
    const res = await openDisputeAction({ bookingId: "bk1", category: "SAFETY", text: "อันตราย", photoKeys: [] });
    expect(res).toEqual({ ok: false, reason: "WRONG_STATE" });
    expect(reportFn).not.toHaveBeenCalled();
    expect(notifyFn).not.toHaveBeenCalled();
  });

  it("rejects empty detail before touching the dispute", async () => {
    const res = await openDisputeAction({ bookingId: "bk1", category: "OTHER", text: "   ", photoKeys: [] });
    expect(res).toEqual({ ok: false, reason: "EMPTY_TEXT" });
    expect(openFn).not.toHaveBeenCalled();
  });
});

describe("appealDisputeAction", () => {
  it("derives the GUEST side and appeals once", async () => {
    appealFn.mockResolvedValue({ id: "bk1" });
    const res = await appealDisputeAction("bk1");
    expect(appealFn).toHaveBeenCalledWith("bk1", "guest1", "GUEST", expect.any(Date));
    expect(res).toEqual({ ok: true });
  });

  it("maps a second appeal to its reason", async () => {
    appealFn.mockRejectedValue(new BookingError("ALREADY_APPEALED"));
    expect(await appealDisputeAction("bk1")).toEqual({ ok: false, reason: "ALREADY_APPEALED" });
  });
});
