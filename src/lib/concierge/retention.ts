/**
 * Concierge transcript purge cron (#35, ADR-010 §6 + AI_CONCIERGE_SPEC §5): delete
 * sessions older than 12 months. Cascades to ConciergeMessage / ConciergeUsage /
 * UnansweredQuestion / ConciergeBookingDraft (onDelete: Cascade), so the whole
 * transcript goes in one statement. Sessions are short-lived chats, so session
 * createdAt is the right retention anchor.
 */
import { prisma } from "@/lib/db";

const TRANSCRIPT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

export async function purgeConciergeTranscripts(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - TRANSCRIPT_RETENTION_MS);
  const { count } = await prisma.conciergeSession.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
