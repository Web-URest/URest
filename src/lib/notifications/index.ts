/**
 * Notification fan-out (ADR-005). `notify` emails always (channel of record) and
 * pushes LINE for `priority` templates when the user has a linked `lineUserId`.
 * Each channel is one NotificationLog row (QUEUED→SENT/FAILED). NEVER throws —
 * dispatch failures become FAILED rows for the retry sweep, so callers just await.
 */
import { NotificationChannel, NotificationStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { getEmailDriver, getLineDriver } from "./drivers";
import { getTemplate, type NotificationTemplate } from "./templates";

interface Recipient {
  email: string | null;
  lineUserId: string | null;
}

/** Build the driver call for a channel, or null if it can't/shouldn't send. Shared with the retry sweep. */
export function resolveSend(
  channel: NotificationChannel,
  user: Recipient,
  template: NotificationTemplate,
  payload: Record<string, unknown>,
): (() => Promise<void>) | null {
  if (channel === NotificationChannel.EMAIL && user.email) {
    const to = user.email;
    const { subject, body } = template.email(payload);
    const driver = getEmailDriver();
    return () => driver.send(to, subject, body);
  }
  if (channel === NotificationChannel.LINE && template.priority && user.lineUserId) {
    const driver = getLineDriver();
    if (!driver) return null;
    const to = user.lineUserId;
    const text = template.line(payload);
    return () => driver.push(to, text);
  }
  return null;
}

async function dispatch(
  channel: NotificationChannel,
  userId: string,
  templateKey: string,
  payload: Record<string, unknown>,
  send: () => Promise<void>,
): Promise<void> {
  const log = await prisma.notificationLog.create({
    data: {
      userId,
      channel,
      templateKey,
      payload: payload as Prisma.InputJsonValue,
      status: NotificationStatus.QUEUED,
    },
  });
  try {
    await send();
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: 1 },
    });
  } catch (err) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: NotificationStatus.FAILED,
        attempts: 1,
        lastError: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export async function notify(
  userId: string,
  templateKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const template = getTemplate(templateKey);
  if (!template) {
    console.error(`[notify] unknown template: ${templateKey}`);
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, lineUserId: true },
  });
  if (!user) {
    console.error(`[notify] unknown user: ${userId}`);
    return;
  }

  for (const channel of [NotificationChannel.EMAIL, NotificationChannel.LINE]) {
    const send = resolveSend(channel, user, template, payload);
    if (send) await dispatch(channel, userId, templateKey, payload, send);
  }
}
