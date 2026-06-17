/**
 * In-process job scheduler (ADR-004): one node-cron minute-tick runs every
 * idempotent sweep. Deadlines are DB rows, so a restart re-derives all work.
 * Started once from src/instrumentation.ts at boot.
 */
import cron from "node-cron";

import {
  sweepDueCheckIns,
  sweepDueCheckouts,
  sweepOverduePayments,
  sweepOverdueRequests,
} from "@/lib/booking/sweeps";
import { sweepFailedNotifications } from "@/lib/notifications/retry";
import { purgeDeadOtps } from "@/lib/otp/otp";

let started = false;

/** Run all idempotent sweeps once; isolates per-sweep failures. */
export async function runSweeps(now: Date): Promise<void> {
  const jobs: Array<readonly [string, () => Promise<number>]> = [
    ["overdue-requests", () => sweepOverdueRequests(now)],
    ["overdue-payments", () => sweepOverduePayments(now)],
    ["due-check-ins", () => sweepDueCheckIns(now)],
    ["due-checkouts", () => sweepDueCheckouts(now)],
    ["purge-otps", () => purgeDeadOtps()],
    ["retry-notifications", () => sweepFailedNotifications()],
  ];
  for (const [name, run] of jobs) {
    try {
      const n = await run();
      if (n > 0) console.info(`[cron] ${name}: ${n}`);
    } catch (err) {
      console.error(`[cron] ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Start the minute-tick scheduler once (idempotent across calls). */
export function startScheduler(): void {
  if (started) return;
  started = true;
  cron.schedule("* * * * *", () => {
    void runSweeps(new Date());
  });
  console.info("[cron] scheduler started (minute tick)");
}
