import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("@/lib/booking/sweeps", () => ({
  sweepOverdueRequests: vi.fn().mockResolvedValue(0),
  sweepOverduePayments: vi.fn().mockResolvedValue(0),
  sweepDueCheckIns: vi.fn().mockResolvedValue(0),
  sweepDueCheckouts: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/notifications/retry", () => ({ sweepFailedNotifications: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/otp/otp", () => ({ purgeDeadOtps: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/kyc/retention", () => ({ purgeRejectedKycDocs: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/concierge/retention", () => ({ purgeConciergeTranscripts: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/messaging/retention", () => ({ purgeOldMessages: vi.fn().mockResolvedValue(0) }));

import cron from "node-cron";
import { sweepDueCheckIns, sweepOverdueRequests } from "@/lib/booking/sweeps";
import { purgeConciergeTranscripts } from "@/lib/concierge/retention";
import { purgeRejectedKycDocs } from "@/lib/kyc/retention";
import { purgeOldMessages } from "@/lib/messaging/retention";
import { sweepFailedNotifications } from "@/lib/notifications/retry";
import { purgeDeadOtps } from "@/lib/otp/otp";

import { runSweeps, startScheduler } from "./scheduler";

const schedule = (cron as unknown as { schedule: Mock }).schedule;
const NOW = new Date("2026-06-20T03:00:00.000Z");

afterEach(() => vi.clearAllMocks());

describe("runSweeps", () => {
  it("runs every sweep with the supplied now", async () => {
    await runSweeps(NOW);
    expect(sweepOverdueRequests as unknown as Mock).toHaveBeenCalledWith(NOW);
    expect(sweepDueCheckIns as unknown as Mock).toHaveBeenCalledWith(NOW);
    expect(purgeDeadOtps as unknown as Mock).toHaveBeenCalledOnce();
    expect(sweepFailedNotifications as unknown as Mock).toHaveBeenCalledOnce();
    // #35 retention sweeps run with the supplied now
    expect(purgeRejectedKycDocs as unknown as Mock).toHaveBeenCalledWith(NOW);
    expect(purgeConciergeTranscripts as unknown as Mock).toHaveBeenCalledWith(NOW);
    expect(purgeOldMessages as unknown as Mock).toHaveBeenCalledWith(NOW);
  });

  it("isolates a failing sweep so the others still run", async () => {
    (sweepOverdueRequests as unknown as Mock).mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runSweeps(NOW);
    expect(purgeDeadOtps as unknown as Mock).toHaveBeenCalledOnce(); // reached despite earlier throw
    spy.mockRestore();
  });
});

describe("startScheduler", () => {
  it("registers a minute tick exactly once even if called twice", () => {
    startScheduler();
    startScheduler();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[0]).toBe("* * * * *");
  });
});
