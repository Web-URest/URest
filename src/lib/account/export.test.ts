import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/messaging/export", () => ({ exportSentMessages: vi.fn() }));

import { prisma } from "@/lib/db";
import { exportSentMessages } from "@/lib/messaging/export";

import { exportUserData } from "./export";

const findUser = prisma.user.findUnique as unknown as Mock;
const sentMessages = exportSentMessages as unknown as Mock;

const FIXTURE = {
  id: "u1",
  displayName: "สมชาย",
  email: "g@x.com",
  phone: "0810000000",
  image: null,
  lineUserId: "U1",
  phoneVerifiedAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  suspendedAt: null,
  savedVillas: [{ listingId: "l1", createdAt: new Date() }],
  bookings: [{ id: "b1", code: "UR-2606-0001", totalSatang: 1_290_000 }],
  reviewsWritten: [{ id: "r1", overall: 5 }],
  guestRatingsReceived: [{ id: "gr1", score: 5 }],
  reportsSubmitted: [{ id: "rp1", category: "SAFETY" }],
  consents: [{ id: "c1", type: "TOS" }],
  kycSubmissions: [{ id: "k1", status: "APPROVED", submittedAt: new Date(), reviewedAt: new Date() }],
  conciergesessions: [{ id: "cs1", createdAt: new Date(), messages: [{ role: "user", content: "hi", createdAt: new Date() }] }],
};

describe("exportUserData", () => {
  it("returns a complete archive across every user-owned section", async () => {
    findUser.mockResolvedValue(FIXTURE);
    sentMessages.mockResolvedValue([{ id: "m1", bookingId: "b1", body: "hello", wasMasked: false, createdAt: new Date() }]);

    const out = await exportUserData("u1");

    // every section present
    expect(out.user.id).toBe("u1");
    expect(out.user.email).toBe("g@x.com");
    expect(out.savedVillas).toHaveLength(1);
    expect(out.bookings[0]!.code).toBe("UR-2606-0001");
    expect(out.reviews).toHaveLength(1);
    expect(out.guestRatingsReceived).toHaveLength(1);
    expect(out.reports).toHaveLength(1);
    expect(out.consents).toHaveLength(1);
    expect(out.kycSubmissions[0]!.status).toBe("APPROVED");
    expect(out.conciergeSessions[0]!.messages[0]!.content).toBe("hi");
    expect(typeof out.exportedAt).toBe("string");

    // message bodies come from the lib/messaging owner (gate:bodyraw), not lib/account
    expect(sentMessages).toHaveBeenCalledWith("u1");
    expect(out.messagesSent[0]!.body).toBe("hello");
  });

  it("throws when the user does not exist", async () => {
    findUser.mockResolvedValue(null);
    await expect(exportUserData("ghost")).rejects.toThrow();
  });
});
