import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("@/lib/db", () => {
  const prisma: Record<string, unknown> = {
    report: {
      findUnique: vi.fn(),
      update: vi.fn((a: unknown) => ({ op: "report.update", a })),
    },
    listing: { update: vi.fn((a: unknown) => ({ op: "listing.update", a })) },
    auditLog: { create: vi.fn((a: unknown) => ({ op: "audit.create", a })) },
  };
  prisma.$transaction = vi.fn(async (arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as unknown[]),
  );
  return { prisma };
});
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/ledger/apply", () => ({ freeze: vi.fn() }));
vi.mock("@/lib/booking/transitions", () => ({ openDispute: vi.fn() }));
vi.mock("@/lib/booking/strikes", () => ({ issueStrike: vi.fn() }));

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { freeze } from "@/lib/ledger/apply";
import { openDispute } from "@/lib/booking/transitions";
import { issueStrike } from "@/lib/booking/strikes";
import {
  acceptIntoReview,
  dismissReport,
  escalateToDispute,
  resolveReport,
  strikeHostFromReport,
  unlistFromReport,
} from "./report-review";

const findUnique = prisma.report.findUnique as unknown as Mock;
const reportUpdate = prisma.report.update as unknown as Mock;
const listingUpdate = prisma.listing.update as unknown as Mock;
const auditCreate = prisma.auditLog.create as unknown as Mock;
const freezeMock = freeze as unknown as Mock;
const openDisputeMock = openDispute as unknown as Mock;
const issueStrikeMock = issueStrike as unknown as Mock;
const notifyMock = notify as unknown as Mock;

const admin = { id: "a1", email: "a@x.co", displayName: "Aok" };

const bookingReport = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  status: "RECEIVED",
  reporterId: "g1",
  category: "SAFETY",
  bookingId: "bk1",
  listingId: null,
  triageByAdminId: null,
  triageAt: null,
  booking: { id: "bk1", userId: "g1", escrowState: "HELD", listing: { hostId: "h1" } },
  listing: null,
  ...over,
});

const listingReport = (over: Record<string, unknown> = {}) => ({
  id: "r2",
  status: "RECEIVED",
  reporterId: "g1",
  category: "SUSPECTED_FRAUD",
  bookingId: null,
  listingId: "l1",
  triageByAdminId: null,
  triageAt: null,
  booking: null,
  listing: { id: "l1", hostId: "h1" },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("acceptIntoReview", () => {
  it("WRONG_STATE if not RECEIVED", async () => {
    findUnique.mockResolvedValue(bookingReport({ status: "IN_REVIEW" }));
    await expect(acceptIntoReview(admin, "r1")).rejects.toMatchObject({ reason: "WRONG_STATE" });
  });

  it("freezes a HELD booking report (AC#1) + IN_REVIEW + audit", async () => {
    findUnique.mockResolvedValue(bookingReport());
    await acceptIntoReview(admin, "r1");
    expect(freezeMock).toHaveBeenCalledWith(prisma, "bk1", "HOLD_BOOKING_REPORT", "r1");
    expect(reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "r1" }, data: expect.objectContaining({ status: "IN_REVIEW", triageByAdminId: "a1" }) }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "REPORT_ACCEPTED" }) }),
    );
  });

  it("skips freeze when escrow is already PAID", async () => {
    findUnique.mockResolvedValue(bookingReport({ booking: { id: "bk1", userId: "g1", escrowState: "PAID", listing: { hostId: "h1" } } }));
    await acceptIntoReview(admin, "r1");
    expect(freezeMock).not.toHaveBeenCalled();
    expect(reportUpdate).toHaveBeenCalled();
  });

  it("skips freeze for a listing report (no booking)", async () => {
    findUnique.mockResolvedValue(listingReport());
    await acceptIntoReview(admin, "r2");
    expect(freezeMock).not.toHaveBeenCalled();
  });
});

describe("resolveReport / dismissReport", () => {
  it("REASON_REQUIRED on blank reason", async () => {
    await expect(resolveReport(admin, "r1", "  ")).rejects.toMatchObject({ reason: "REASON_REQUIRED" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("resolves with reason + notifies the reporter", async () => {
    findUnique.mockResolvedValue(bookingReport({ status: "IN_REVIEW" }));
    await resolveReport(admin, "r1", " จัดการแล้ว ");
    expect(reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED", resolvedReason: "จัดการแล้ว" }) }),
    );
    expect(notifyMock).toHaveBeenCalledWith("g1", "REPORT_RESOLVED", { category: "SAFETY", reason: "จัดการแล้ว" });
  });

  it("dismisses with reason + notifies", async () => {
    findUnique.mockResolvedValue(bookingReport());
    await dismissReport(admin, "r1", "นอกประเด็น");
    expect(reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DISMISSED" }) }),
    );
    expect(notifyMock).toHaveBeenCalledWith("g1", "REPORT_DISMISSED", expect.anything());
  });

  it("WRONG_STATE when already terminal", async () => {
    findUnique.mockResolvedValue(bookingReport({ status: "RESOLVED" }));
    await expect(resolveReport(admin, "r1", "x")).rejects.toMatchObject({ reason: "WRONG_STATE" });
  });
});

describe("unlistFromReport (AC#3)", () => {
  it("rejects a booking report", async () => {
    findUnique.mockResolvedValue(bookingReport());
    await expect(unlistFromReport(admin, "r1")).rejects.toMatchObject({ reason: "NOT_LISTING_REPORT" });
  });

  it("unlists the listing + IN_REVIEW + audit", async () => {
    findUnique.mockResolvedValue(listingReport());
    await unlistFromReport(admin, "r2");
    expect(listingUpdate).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "UNLISTED" } });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "LISTING_UNLISTED", targetId: "l1" }) }),
    );
  });
});

describe("escalateToDispute", () => {
  it("rejects a listing report", async () => {
    findUnique.mockResolvedValue(listingReport());
    await expect(escalateToDispute(admin, "r2")).rejects.toMatchObject({ reason: "NOT_BOOKING_REPORT" });
  });

  it("calls openDispute(bookingId, guestId) + IN_REVIEW", async () => {
    findUnique.mockResolvedValue(bookingReport());
    await escalateToDispute(admin, "r1");
    expect(openDisputeMock).toHaveBeenCalledWith("bk1", "g1");
    expect(reportUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "IN_REVIEW" }) }),
    );
  });
});

describe("strikeHostFromReport (AC#4)", () => {
  it("strikes the booking's host with ADMIN_MANUAL + bookingId + audit", async () => {
    findUnique.mockResolvedValue(bookingReport());
    await strikeHostFromReport(admin, "r1", "ADMIN_MANUAL");
    expect(issueStrikeMock).toHaveBeenCalledWith(prisma, "h1", "ADMIN_MANUAL", "bk1", expect.any(Date));
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "HOST_STRUCK", targetId: "h1" }) }),
    );
  });

  it("strikes the listing's host with a null bookingId", async () => {
    findUnique.mockResolvedValue(listingReport());
    await strikeHostFromReport(admin, "r2", "ADMIN_MANUAL");
    expect(issueStrikeMock).toHaveBeenCalledWith(prisma, "h1", "ADMIN_MANUAL", null, expect.any(Date));
  });
});
