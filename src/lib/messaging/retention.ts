/**
 * In-app message purge cron (#35, ADR-010 §6 + PRD §5: messages retained 12 months).
 * Lives in lib/messaging (the Message owner). Deletes Message rows older than 12
 * months; the booking-linked MessageThread shell is left in place (cheap, harmless).
 */
import { prisma } from "@/lib/db";

const MESSAGE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

export async function purgeOldMessages(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - MESSAGE_RETENTION_MS);
  const { count } = await prisma.message.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
