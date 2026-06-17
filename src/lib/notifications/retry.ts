/**
 * Retry sweep for FAILED notifications (ADR-004/005). Re-renders + re-dispatches
 * each FAILED row under the attempt cap; wired into the cron scheduler. Count-
 * capped (no exponential backoff — YAGNI for pilot).
 *
 * Concurrency: each attempt is claimed atomically by bumping `attempts` with a
 * compare-and-swap (`where: { id, status: FAILED, attempts }`). Only one sweep
 * can win a given attempt, so overlapping ticks never double-dispatch. The row
 * stays FAILED throughout (never a transient claimed state), so a crash after
 * claiming just consumes one attempt — the notification is never lost.
 */
import { NotificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import { resolveSend } from "./index";
import { getTemplate } from "./templates";

const MAX_ATTEMPTS = 5;
const BATCH = 100;

export async function sweepFailedNotifications(): Promise<number> {
  const rows = await prisma.notificationLog.findMany({
    where: { status: NotificationStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  let resent = 0;
  for (const row of rows) {
    const template = getTemplate(row.templateKey);
    if (!template || !row.userId) continue;
    const user = await prisma.user.findUnique({
      where: { id: row.userId },
      select: { email: true, lineUserId: true },
    });
    if (!user) continue;
    const payload =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : {};
    const send = resolveSend(row.channel, user, template, payload);
    if (!send) continue;

    // Atomically claim this attempt — an overlapping tick reading the same
    // `attempts` will get count 0 here and skip, so we never double-dispatch.
    const claim = await prisma.notificationLog.updateMany({
      where: { id: row.id, status: NotificationStatus.FAILED, attempts: row.attempts },
      data: { attempts: row.attempts + 1 },
    });
    if (claim.count === 0) continue;

    try {
      await send();
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
      resent++;
    } catch (err) {
      // Stays FAILED (attempts already bumped by the claim) — retried next tick until MAX.
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { lastError: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return resent;
}
