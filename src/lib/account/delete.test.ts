import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { $transaction: vi.fn() } }));

import { prisma } from "@/lib/db";

import { deleteAccount } from "./delete";

const txMock = prisma.$transaction as unknown as Mock;

const ZERO_COUNT = {
  bookings: 0,
  listings: 0,
  payoutAccounts: 0,
  reviewsWritten: 0,
  guestRatingsGiven: 0,
  guestRatingsReceived: 0,
  reportsSubmitted: 0,
  reportsReceived: 0,
  messagesSent: 0,
  hostStrikes: 0,
  payoutHolds: 0,
  kycSubmissions: 0,
};

function makeTx(count: Record<string, number>) {
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ email: "g@x.com", _count: count }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    consent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    savedVilla: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    phoneOtp: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    account: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    conciergeSession: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  // run the interactive transaction callback against this stub
  txMock.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
  return tx;
}

describe("deleteAccount", () => {
  it("hard-deletes a user with no ledger/host/social footprint", async () => {
    const tx = makeTx(ZERO_COUNT);

    const res = await deleteAccount("u1");

    expect(res.mode).toBe("HARD");
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
    expect(tx.user.update).not.toHaveBeenCalled();
    // owned children explicitly removed before the row goes
    expect(tx.savedVilla.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(tx.conciergeSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("soft-deletes + anonymizes a user who has bookings (ledger survives)", async () => {
    const tx = makeTx({ ...ZERO_COUNT, bookings: 2 });

    const res = await deleteAccount("u1");

    expect(res.mode).toBe("ANONYMIZED");
    expect(tx.user.delete).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({
          displayName: "[deleted]",
          email: null,
          phone: null,
          lineUserId: null,
          image: null,
          anonymizedAt: expect.any(Date),
          deletedAt: expect.any(Date),
        }),
      }),
    );
    // auth revoked + owned ephemera cleared; ledger/social rows untouched (no deleteMany on them)
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(tx.account.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("anonymizes when only a host footprint exists (e.g. a listing, no bookings)", async () => {
    const tx = makeTx({ ...ZERO_COUNT, listings: 1 });
    const res = await deleteAccount("u1");
    expect(res.mode).toBe("ANONYMIZED");
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("anonymizes a user who was reported by someone else (keeps the abuse-trail subject)", async () => {
    const tx = makeTx({ ...ZERO_COUNT, reportsReceived: 1 });
    const res = await deleteAccount("u1");
    expect(res.mode).toBe("ANONYMIZED");
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("throws when the user does not exist", async () => {
    const tx = makeTx(ZERO_COUNT);
    tx.user.findUnique.mockResolvedValue(null);
    await expect(deleteAccount("ghost")).rejects.toThrow();
  });
});
