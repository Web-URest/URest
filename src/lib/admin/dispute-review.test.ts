import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    dispute: { findUnique: vi.fn(), findMany: vi.fn() },
    report: { findMany: vi.fn() },
    booking: { findUnique: vi.fn() },
    refund: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/lib/booking/transitions", () => ({ resolveDispute: vi.fn(), resolveAppeal: vi.fn() }));
vi.mock("@/lib/messaging/admin", () => ({ readDisputeThreadRaw: vi.fn() }));

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { resolveAppeal, resolveDispute } from "@/lib/booking/transitions";
import { readDisputeThreadRaw } from "@/lib/messaging/admin";
import {
  DisputeReviewError,
  loadDisputeCase,
  listOpenDisputes,
  resolveAppealCase,
  resolveDisputeCase,
} from "./dispute-review";

const disputeFind = prisma.dispute.findUnique as unknown as Mock;
const disputeFindMany = prisma.dispute.findMany as unknown as Mock;
const reportFindMany = prisma.report.findMany as unknown as Mock;
const bookingFind = prisma.booking.findUnique as unknown as Mock;
const refundFind = prisma.refund.findUnique as unknown as Mock;
const notifyMock = notify as unknown as Mock;
const resolveDisputeMock = resolveDispute as unknown as Mock;
const resolveAppealMock = resolveAppeal as unknown as Mock;
const readRawMock = readDisputeThreadRaw as unknown as Mock;

const admin = { id: "a1", email: "a@x.co", displayName: "Aok" };

const bookingForNotify = {
  userId: "g1",
  code: "UR-2606-0001",
  totalSatang: 10_000_00,
  listing: { hostId: "h1", title: "วิลล่า A" },
};

afterEach(() => vi.clearAllMocks());

describe("listOpenDisputes", () => {
  it("returns OPEN cases and armed appeals awaiting a final decision", async () => {
    disputeFindMany.mockResolvedValue([
      {
        bookingId: "bk1",
        status: "OPEN",
        guestAppealedAt: null,
        hostAppealedAt: null,
        createdAt: new Date(),
        booking: { code: "UR-2606-0001", escrowState: "FROZEN", listing: { title: "วิลล่า A" }, user: { displayName: "เกสต์" } },
      },
    ]);
    const rows = await listOpenDisputes();
    expect(disputeFindMany).toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ bookingId: "bk1", status: "OPEN", listingTitle: "วิลล่า A" });
  });
});

describe("loadDisputeCase", () => {
  it("aggregates dispute + booking reports + the audited raw thread", async () => {
    disputeFind.mockResolvedValue({ bookingId: "bk1", status: "OPEN", booking: bookingForNotify });
    reportFindMany.mockResolvedValue([{ id: "r1", category: "CLEANLINESS", text: "สกปรก", photoKeys: ["disputes/bk1/a.jpg"] }]);
    readRawMock.mockResolvedValue({ bookingId: "bk1", guestId: "g1", guestName: "เกสต์", hostName: "โฮสต์", messages: [] });

    const result = await loadDisputeCase(admin, "bk1");

    expect(readRawMock).toHaveBeenCalledWith(admin, "bk1");
    expect(result.reports).toHaveLength(1);
    expect(result.thread.guestName).toBe("เกสต์");
  });

  it("throws NOT_FOUND for a booking without a dispute", async () => {
    disputeFind.mockResolvedValue(null);
    await expect(loadDisputeCase(admin, "bk1")).rejects.toBeInstanceOf(DisputeReviewError);
  });
});

describe("resolveDisputeCase", () => {
  it("resolves via lib/booking and notifies both parties with the decision", async () => {
    bookingFind.mockResolvedValue(bookingForNotify);
    refundFind.mockResolvedValue({ refundSatang: 4_000_00 });

    await resolveDisputeCase(admin, "bk1", { kind: "PARTIAL", refundPct: 40 });

    expect(resolveDisputeMock).toHaveBeenCalledWith("bk1", "a1", { kind: "PARTIAL", refundPct: 40 }, expect.any(Date));
    expect(notifyMock).toHaveBeenCalledWith("g1", "DISPUTE_RESOLVED", {
      listingTitle: "วิลล่า A",
      code: "UR-2606-0001",
      kind: "PARTIAL",
      refundSatang: 4_000_00,
    });
    expect(notifyMock).toHaveBeenCalledWith("h1", "DISPUTE_RESOLVED", expect.objectContaining({ kind: "PARTIAL" }));
  });
});

describe("resolveAppealCase", () => {
  it("resolves the appeal via lib/booking and notifies both parties as final", async () => {
    bookingFind.mockResolvedValue(bookingForNotify);
    refundFind.mockResolvedValue({ refundSatang: 10_000_00 });

    await resolveAppealCase(admin, "bk1", { kind: "REFUNDED" });

    expect(resolveAppealMock).toHaveBeenCalledWith("bk1", "a1", { kind: "REFUNDED" }, expect.any(Date));
    expect(notifyMock).toHaveBeenCalledWith("g1", "DISPUTE_APPEAL_RESOLVED", expect.objectContaining({ kind: "REFUNDED" }));
    expect(notifyMock).toHaveBeenCalledWith("h1", "DISPUTE_APPEAL_RESOLVED", expect.objectContaining({ kind: "REFUNDED" }));
  });
});
