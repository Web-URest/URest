import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: vi.fn() },
    messageThread: { upsert: vi.fn() },
    message: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { prisma } from "@/lib/db";
import { readDisputeThreadRaw } from "./admin";
import { MessagingError } from "./thread";

const bookingFind = prisma.booking.findUnique as unknown as Mock;
const threadUpsert = prisma.messageThread.upsert as unknown as Mock;
const messageFind = prisma.message.findMany as unknown as Mock;
const auditCreate = prisma.auditLog.create as unknown as Mock;

const admin = { id: "admin1", email: "a@u.test", displayName: "Aok" };

const bookingRow = {
  userId: "guest1",
  user: { displayName: "เกสต์" },
  listing: { host: { displayName: "โฮสต์" } },
};

afterEach(() => vi.clearAllMocks());

describe("readDisputeThreadRaw", () => {
  it("returns the unmasked bodyRaw evidence and writes a reveal audit row", async () => {
    bookingFind.mockResolvedValue(bookingRow);
    threadUpsert.mockResolvedValue({ id: "thr1" });
    messageFind.mockResolvedValue([
      { id: "m1", senderId: "guest1", bodyRaw: "โทรหาเบอร์ 0812345678", wasMasked: true, createdAt: new Date() },
    ]);

    const result = await readDisputeThreadRaw(admin, "bk1");

    expect(result.messages[0]?.body).toBe("โทรหาเบอร์ 0812345678");
    expect(result.guestName).toBe("เกสต์");
    expect(result.hostName).toBe("โฮสต์");
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        adminId: "admin1",
        action: "DISPUTE_THREAD_REVEALED",
        targetType: "MessageThread",
        targetId: "thr1",
      },
    });
  });

  it("audits on EVERY access (each reveal is logged)", async () => {
    bookingFind.mockResolvedValue(bookingRow);
    threadUpsert.mockResolvedValue({ id: "thr1" });
    messageFind.mockResolvedValue([]);

    await readDisputeThreadRaw(admin, "bk1");
    await readDisputeThreadRaw(admin, "bk1");

    expect(auditCreate).toHaveBeenCalledTimes(2);
  });

  it("throws for a missing booking", async () => {
    bookingFind.mockResolvedValue(null);
    await expect(readDisputeThreadRaw(admin, "bk1")).rejects.toBeInstanceOf(MessagingError);
  });
});
