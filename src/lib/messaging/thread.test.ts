import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    booking: { findUnique: vi.fn() },
    messageThread: { upsert: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    message: { create: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/notifications", () => ({ notify: vi.fn() }));

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { listThreadsForUser, loadThreadForViewer, MessagingError, sendMessage } from "./thread";

const findBooking = prisma.booking.findUnique as unknown as Mock;
const threadUpsert = prisma.messageThread.upsert as unknown as Mock;
const threadUpdateMany = prisma.messageThread.updateMany as unknown as Mock;
const msgCreate = prisma.message.create as unknown as Mock;
const msgFindMany = prisma.message.findMany as unknown as Mock;
const msgUpdateMany = prisma.message.updateMany as unknown as Mock;
const notifyFn = notify as unknown as Mock;

const NOW = new Date("2026-06-18T12:00:00.000Z");

function booking(over: Record<string, unknown> = {}) {
  return {
    id: "bk1",
    userId: "guest1",
    contactUnmaskedAt: null,
    user: { displayName: "สมชาย" },
    listing: { title: "วิลล่า A", hostId: "host1", host: { displayName: "โฮสต์" } },
    ...over,
  };
}

beforeEach(() => {
  findBooking.mockResolvedValue(booking());
  threadUpsert.mockResolvedValue({ id: "th1" });
  threadUpdateMany.mockResolvedValue({ count: 1 });
  msgCreate.mockResolvedValue({ id: "m1" });
  notifyFn.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("sendMessage — masking at write", () => {
  it("masks a phone number pre-CONFIRMED (wasMasked, bodyRaw kept, bodyMasked redacted)", async () => {
    await sendMessage({ bookingId: "bk1", senderId: "guest1", body: "โทร 0812345678 นะ" }, NOW);
    const data = msgCreate.mock.calls[0]?.[0]?.data;
    expect(data.bodyRaw).toBe("โทร 0812345678 นะ");
    expect(data.wasMasked).toBe(true);
    expect(data.bodyMasked).toContain("[ปกปิด]");
    expect(data.bodyMasked).not.toContain("0812345678");
  });

  it("does NOT mask once the booking is CONFIRMED (contactUnmaskedAt set)", async () => {
    findBooking.mockResolvedValue(booking({ contactUnmaskedAt: NOW }));
    await sendMessage({ bookingId: "bk1", senderId: "host1", body: "โทร 0812345678 นะ" }, NOW);
    const data = msgCreate.mock.calls[0]?.[0]?.data;
    expect(data.wasMasked).toBe(false);
    expect(data.bodyMasked).toBe("โทร 0812345678 นะ");
    expect(data.bodyRaw).toBe("โทร 0812345678 นะ");
  });
});

describe("sendMessage — notify throttle (1/thread/10min)", () => {
  it("notifies the OTHER party when the CAS claim wins", async () => {
    threadUpdateMany.mockResolvedValue({ count: 1 });
    await sendMessage({ bookingId: "bk1", senderId: "guest1", body: "สวัสดีค่ะ" }, NOW);
    expect(notifyFn).toHaveBeenCalledWith("host1", "MESSAGE_NEW", expect.objectContaining({ senderName: "สมชาย", listingTitle: "วิลล่า A", bookingId: "bk1" }));
  });

  it("suppresses the push when the thread was notified < 10min ago (CAS count 0)", async () => {
    threadUpdateMany.mockResolvedValue({ count: 0 });
    await sendMessage({ bookingId: "bk1", senderId: "guest1", body: "อีกข้อความ" }, NOW);
    expect(msgCreate).toHaveBeenCalled(); // message still stored
    expect(notifyFn).not.toHaveBeenCalled(); // but no second push
  });

  it("notifies the guest when the host sends", async () => {
    await sendMessage({ bookingId: "bk1", senderId: "host1", body: "ได้ครับ" }, NOW);
    expect(notifyFn).toHaveBeenCalledWith("guest1", "MESSAGE_NEW", expect.objectContaining({ senderName: "โฮสต์" }));
  });
});

describe("sendMessage — guards", () => {
  it("rejects a non-participant (no message, no notify)", async () => {
    await expect(sendMessage({ bookingId: "bk1", senderId: "stranger", body: "hi" }, NOW)).rejects.toBeInstanceOf(MessagingError);
    expect(msgCreate).not.toHaveBeenCalled();
    expect(notifyFn).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    await expect(sendMessage({ bookingId: "bk1", senderId: "guest1", body: "   " }, NOW)).rejects.toMatchObject({ reason: "EMPTY_BODY" });
    expect(msgCreate).not.toHaveBeenCalled();
  });
});

describe("loadThreadForViewer", () => {
  it("returns messages selecting bodyMasked but NEVER bodyRaw, and marks inbound read", async () => {
    msgFindMany.mockResolvedValue([{ id: "m1", senderId: "host1", bodyMasked: "hi", createdAt: NOW, readAt: null }]);
    msgUpdateMany.mockResolvedValue({ count: 1 });

    await loadThreadForViewer("bk1", "guest1");

    const select = msgFindMany.mock.calls[0]?.[0]?.select;
    expect(select).toBeDefined();
    expect(select.bodyMasked).toBe(true);
    expect(select).not.toHaveProperty("bodyRaw");
    // marks the other party's unread messages read
    expect(msgUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ senderId: { not: "guest1" }, readAt: null }) }));
  });

  it("rejects a non-participant viewer", async () => {
    await expect(loadThreadForViewer("bk1", "stranger")).rejects.toBeInstanceOf(MessagingError);
  });
});

describe("listThreadsForUser", () => {
  it("maps threads to a preview + unread, picking the counterparty by the viewer's role", async () => {
    (prisma.messageThread.findMany as unknown as Mock).mockResolvedValue([
      {
        bookingId: "bk1",
        booking: {
          userId: "guest1",
          user: { displayName: "สมชาย" },
          listing: { title: "วิลล่า A", host: { displayName: "โฮสต์" } },
        },
        messages: [{ bodyMasked: "สวัสดี", createdAt: NOW }],
        _count: { messages: 2 },
      },
    ]);
    // viewer is the guest → counterparty is the host
    const rows = await listThreadsForUser("guest1");
    expect(rows[0]).toMatchObject({
      bookingId: "bk1",
      listingTitle: "วิลล่า A",
      otherPartyName: "โฮสต์",
      lastMessage: "สวัสดี",
      unread: 2,
    });
  });
});
