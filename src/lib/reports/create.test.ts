import { describe, expect, it, vi, afterEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: vi.fn() },
    listing: { findUnique: vi.fn() },
    report: { create: vi.fn().mockResolvedValue({ id: "r1" }) },
  },
}));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { createBookingReport, createListingReport, ReportError } from "./create";

const bookingFind = prisma.booking.findUnique as unknown as Mock;
const listingFind = prisma.listing.findUnique as unknown as Mock;
const reportCreate = prisma.report.create as unknown as Mock;
const notifyMock = notify as unknown as Mock;

afterEach(() => vi.clearAllMocks());

describe("createBookingReport", () => {
  const booking = { id: "bk1", userId: "guest1", listing: { hostId: "host1", title: "วิลล่า A" } };

  it("rejects empty text before any read", async () => {
    await expect(createBookingReport("guest1", "bk1", "SAFETY", "   ")).rejects.toMatchObject({
      reason: "EMPTY_TEXT",
    });
    expect(bookingFind).not.toHaveBeenCalled();
  });

  it("rejects a reporter who is neither guest nor host", async () => {
    bookingFind.mockResolvedValue(booking);
    await expect(createBookingReport("stranger", "bk1", "SAFETY", "ปัญหา")).rejects.toMatchObject({
      reason: "NOT_RELATED",
    });
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it("creates a booking report for the guest + acks the reporter", async () => {
    bookingFind.mockResolvedValue(booking);
    const id = await createBookingReport("guest1", "bk1", "CLEANLINESS", " สกปรก ");
    expect(id).toBe("r1");
    expect(reportCreate).toHaveBeenCalledWith({
      data: { reporterId: "guest1", bookingId: "bk1", category: "CLEANLINESS", text: "สกปรก", photoKeys: [] },
    });
    expect(notifyMock).toHaveBeenCalledWith("guest1", "REPORT_RECEIVED", {
      category: "CLEANLINESS",
      targetLabel: "วิลล่า A",
    });
  });

  it("also allows the host to report the booking", async () => {
    bookingFind.mockResolvedValue(booking);
    await createBookingReport("host1", "bk1", "HOST_BEHAVIOR", "แขกเสียงดัง");
    expect(reportCreate).toHaveBeenCalled();
  });

  it("persists supplied photoKeys (dispute evidence)", async () => {
    bookingFind.mockResolvedValue(booking);
    await createBookingReport("guest1", "bk1", "CLEANLINESS", "สกปรก", ["disputes/bk1/a.jpg"]);
    expect(reportCreate).toHaveBeenCalledWith({
      data: {
        reporterId: "guest1",
        bookingId: "bk1",
        category: "CLEANLINESS",
        text: "สกปรก",
        photoKeys: ["disputes/bk1/a.jpg"],
      },
    });
  });

  it("throws NOT_FOUND for a missing booking", async () => {
    bookingFind.mockResolvedValue(null);
    await expect(createBookingReport("guest1", "bk1", "OTHER", "x")).rejects.toBeInstanceOf(ReportError);
  });
});

describe("createListingReport", () => {
  it("creates a listing report for a logged-out reporter (no notify)", async () => {
    listingFind.mockResolvedValue({ title: "วิลล่า B" });
    const id = await createListingReport(null, "l1", "SUSPECTED_FRAUD", "รูปปลอม");
    expect(id).toBe("r1");
    expect(reportCreate).toHaveBeenCalledWith({
      data: { reporterId: null, listingId: "l1", category: "SUSPECTED_FRAUD", text: "รูปปลอม", photoKeys: [] },
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("acks a logged-in listing reporter", async () => {
    listingFind.mockResolvedValue({ title: "วิลล่า B" });
    await createListingReport("u9", "l1", "DOESNT_MATCH_LISTING", "ไม่ตรงรูป");
    expect(notifyMock).toHaveBeenCalledWith("u9", "REPORT_RECEIVED", {
      category: "DOESNT_MATCH_LISTING",
      targetLabel: "วิลล่า B",
    });
  });

  it("throws NOT_FOUND for a missing listing", async () => {
    listingFind.mockResolvedValue(null);
    await expect(createListingReport(null, "l1", "OTHER", "x")).rejects.toMatchObject({
      reason: "NOT_FOUND",
    });
  });
});
