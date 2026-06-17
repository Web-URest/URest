/**
 * Retry sweep for FAILED notifications (ADR-004/005). Re-renders + re-dispatches
 * each FAILED row under the attempt cap; wired into the cron scheduler. Count-
 * capped (no exponential backoff — YAGNI for pilot).
 */
import { NotificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import { resolveSend } from "./index";
import { getTemplate } from "./templates";

const MAX_ATTEMPTS = 5;

export async function sweepFailedNotifications(): Promise<number> {
  const rows = await prisma.notificationLog.findMany({
    where: { status: NotificationStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } },
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
    try {
      await send();
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: row.attempts + 1 },
      });
      resent++;
    } catch (err) {
      await prisma.notificationLog.update({
        where: { id: row.id },
        data: { attempts: row.attempts + 1, lastError: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return resent;
}
