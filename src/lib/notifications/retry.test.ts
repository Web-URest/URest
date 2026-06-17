import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const emailSend = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationLog: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("./drivers", () => ({ getEmailDriver: () => ({ send: emailSend }), getLineDriver: () => null }));
vi.mock("./templates", () => ({
  getTemplate: () => ({ priority: true, email: () => ({ subject: "s", body: "b" }), line: () => "t" }),
}));

import { prisma } from "@/lib/db";

import { sweepFailedNotifications } from "./retry";

const findMany = prisma.notificationLog.findMany as unknown as Mock;
const updateMany = prisma.notificationLog.updateMany as unknown as Mock;
const update = prisma.notificationLog.update as unknown as Mock;
const findUser = prisma.user.findUnique as unknown as Mock;

const ROW = {
  id: "l1",
  userId: "u1",
  channel: NotificationChannel.EMAIL,
  templateKey: "BOOKING_REQUESTED",
  payload: {},
  attempts: 1,
};

beforeEach(() => {
  updateMany.mockResolvedValue({ count: 1 }); // claim wins by default
  update.mockResolvedValue({});
  findUser.mockResolvedValue({ email: "g@x.com", lineUserId: null });
  emailSend.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("sweepFailedNotifications", () => {
  it("claims FAILED rows (CAS on attempts) under the cap, ordered, bounded — then re-sends", async () => {
    findMany.mockResolvedValue([{ ...ROW }]);

    const n = await sweepFailedNotifications();

    expect(findMany).toHaveBeenCalledWith({
      where: { status: NotificationStatus.FAILED, attempts: { lt: 5 } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    // atomic claim: only matches if still FAILED at the same attempts count
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "l1", status: NotificationStatus.FAILED, attempts: 1 },
      data: { attempts: 2 },
    });
    expect(emailSend).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" }, data: expect.objectContaining({ status: NotificationStatus.SENT }) }),
    );
    expect(n).toBe(1);
  });

  it("skips a row already claimed by another tick (claim count 0) — no double-dispatch", async () => {
    findMany.mockResolvedValue([{ ...ROW }]);
    updateMany.mockResolvedValue({ count: 0 });

    const n = await sweepFailedNotifications();

    expect(emailSend).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(n).toBe(0);
  });

  it("records lastError (stays FAILED, attempts already bumped) when the re-send fails again", async () => {
    findMany.mockResolvedValue([{ ...ROW, attempts: 2 }]);
    emailSend.mockRejectedValue(new Error("still down"));

    const n = await sweepFailedNotifications();

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "l1", status: NotificationStatus.FAILED, attempts: 2 },
      data: { attempts: 3 },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" }, data: { lastError: "still down" } }),
    );
    expect(n).toBe(0);
  });
});
