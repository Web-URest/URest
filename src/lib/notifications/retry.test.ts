import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const emailSend = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationLog: { findMany: vi.fn(), update: vi.fn() },
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
const update = prisma.notificationLog.update as unknown as Mock;
const findUser = prisma.user.findUnique as unknown as Mock;

beforeEach(() => {
  update.mockResolvedValue({});
  findUser.mockResolvedValue({ email: "g@x.com", lineUserId: null });
  emailSend.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("sweepFailedNotifications", () => {
  it("queries FAILED rows under the attempt cap and re-sends them", async () => {
    findMany.mockResolvedValue([
      { id: "l1", userId: "u1", channel: NotificationChannel.EMAIL, templateKey: "BOOKING_REQUESTED", payload: {}, attempts: 1 },
    ]);

    const n = await sweepFailedNotifications();

    expect(findMany).toHaveBeenCalledWith({
      where: { status: NotificationStatus.FAILED, attempts: { lt: 5 } },
    });
    expect(emailSend).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l1" },
        data: expect.objectContaining({ status: NotificationStatus.SENT, attempts: 2 }),
      }),
    );
    expect(n).toBe(1);
  });

  it("keeps the row FAILED (attempts+1) when the re-send fails again", async () => {
    findMany.mockResolvedValue([
      { id: "l1", userId: "u1", channel: NotificationChannel.EMAIL, templateKey: "BOOKING_REQUESTED", payload: {}, attempts: 2 },
    ]);
    emailSend.mockRejectedValue(new Error("still down"));

    const n = await sweepFailedNotifications();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l1" },
        data: expect.objectContaining({ attempts: 3, lastError: "still down" }),
      }),
    );
    expect(n).toBe(0);
  });
});
