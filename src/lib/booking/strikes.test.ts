import { describe, expect, it, vi, afterEach } from "vitest";

import { issueStrike, STRIKE_SUSPENSION_THRESHOLD } from "./strikes";

function fakeTx(strikeCount: number) {
  return {
    hostStrike: { create: vi.fn(), count: vi.fn().mockResolvedValue(strikeCount) },
    user: { update: vi.fn() },
  };
}

const NOW = new Date("2026-06-18T00:00:00Z");
afterEach(() => vi.clearAllMocks());

describe("issueStrike", () => {
  it("records the strike with the supplied reason + bookingId", async () => {
    const tx = fakeTx(1);
    await issueStrike(tx as never, "host1", "ADMIN_MANUAL", "bk1", NOW);
    expect(tx.hostStrike.create).toHaveBeenCalledWith({
      data: { hostUserId: "host1", bookingId: "bk1", reason: "ADMIN_MANUAL" },
    });
  });

  it("does not suspend before the threshold", async () => {
    const tx = fakeTx(STRIKE_SUSPENSION_THRESHOLD - 1);
    await issueStrike(tx as never, "host1", "HOST_CANCELLED", "bk1", NOW);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("suspends the host on the third strike", async () => {
    const tx = fakeTx(STRIKE_SUSPENSION_THRESHOLD);
    await issueStrike(tx as never, "host1", "ADMIN_MANUAL", null, NOW);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "host1" },
      data: { suspendedAt: NOW },
    });
  });

  it("allows a null bookingId (strike not tied to a booking)", async () => {
    const tx = fakeTx(1);
    await issueStrike(tx as never, "host1", "ADMIN_MANUAL", null, NOW);
    expect(tx.hostStrike.create).toHaveBeenCalledWith({
      data: { hostUserId: "host1", bookingId: null, reason: "ADMIN_MANUAL" },
    });
  });
});
