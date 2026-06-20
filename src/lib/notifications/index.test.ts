import { NotificationStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    notificationLog: { create: vi.fn(), update: vi.fn() },
  },
}));
const emailSend = vi.fn();
const linePush = vi.fn();
vi.mock("./drivers", () => ({
  getEmailDriver: () => ({ send: emailSend }),
  getLineDriver: () => ({ push: linePush }),
}));
vi.mock("./templates", () => ({ getTemplate: vi.fn() }));

import { prisma } from "@/lib/db";
import { getTemplate } from "./templates";

import { notify } from "./index";

const findUser = prisma.user.findUnique as unknown as Mock;
const logCreate = prisma.notificationLog.create as unknown as Mock;
const logUpdate = prisma.notificationLog.update as unknown as Mock;
const template = getTemplate as unknown as Mock;

const PRIORITY_TPL = {
  priority: true,
  email: () => ({ subject: "s", body: "b" }),
  line: () => "t",
};

beforeEach(() => {
  template.mockReturnValue(PRIORITY_TPL);
  logCreate.mockImplementation(async ({ data }: { data: { channel: string } }) => ({ id: `log-${data.channel}` }));
  logUpdate.mockResolvedValue({});
  emailSend.mockResolvedValue(undefined);
  linePush.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("notify", () => {
  it("always emails, and pushes LINE for a priority template when lineUserId is linked", async () => {
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: "U1" });

    await notify("u1", "BOOKING_REQUESTED", { a: 1 });

    expect(emailSend).toHaveBeenCalledWith("g@x.com", "s", "b");
    expect(linePush).toHaveBeenCalledWith("U1", "t");
    expect(logCreate).toHaveBeenCalledTimes(2);
    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.SENT }) }),
    );
  });

  it("emails only when the user has no linked LINE", async () => {
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: null });
    await notify("u1", "BOOKING_REQUESTED", {});
    expect(emailSend).toHaveBeenCalledOnce();
    expect(linePush).not.toHaveBeenCalled();
  });

  it("skips LINE for a non-priority template", async () => {
    template.mockReturnValue({ ...PRIORITY_TPL, priority: false });
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: "U1" });
    await notify("u1", "SOMETHING", {});
    expect(emailSend).toHaveBeenCalledOnce();
    expect(linePush).not.toHaveBeenCalled();
  });

  it("never throws when a driver fails — marks the row FAILED", async () => {
    findUser.mockResolvedValue({ email: "g@x.com", lineUserId: null });
    emailSend.mockRejectedValue(new Error("smtp down"));

    await expect(notify("u1", "BOOKING_REQUESTED", {})).resolves.toBeUndefined();

    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: NotificationStatus.FAILED, lastError: "smtp down" }),
      }),
    );
  });

  it("is a safe no-op for an unknown template", async () => {
    template.mockReturnValue(undefined);
    await notify("u1", "NOPE", {});
    expect(findUser).not.toHaveBeenCalled();
    expect(logCreate).not.toHaveBeenCalled();
  });

  it("suppresses an optional-group channel the user disabled (§3.7 prefs)", async () => {
    // MESSAGE_NEW ∈ MESSAGES (optional); user muted its email but kept LINE.
    findUser.mockResolvedValue({
      email: "g@x.com",
      lineUserId: "U1",
      notificationPrefs: { MESSAGES: { email: false, line: true } },
    });
    await notify("u1", "MESSAGE_NEW", {});
    expect(emailSend).not.toHaveBeenCalled();
    expect(linePush).toHaveBeenCalledOnce();
    expect(logCreate).toHaveBeenCalledTimes(1); // only the LINE channel logged
  });

  it("still emails an essential group even when the user disabled it (locked channel)", async () => {
    // BOOKING_CANCELLED_BY_HOST ∈ BOOKING (essential); email is the channel of record.
    findUser.mockResolvedValue({
      email: "g@x.com",
      lineUserId: "U1",
      notificationPrefs: { BOOKING: { email: false, line: false } },
    });
    await notify("u1", "BOOKING_CANCELLED_BY_HOST", {});
    expect(emailSend).toHaveBeenCalledOnce(); // locked on despite email:false
    expect(linePush).not.toHaveBeenCalled(); // LINE is toggleable → suppressed
  });
});
