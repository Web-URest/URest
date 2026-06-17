import { prisma } from "@/lib/db";

export type ConciergeMessageRow = {
  id: string;
  role: string;
  content: string;
  toolCalls: unknown;
  createdAt: Date;
};

/** Create or reuse a session for a user+listing combo. */
export async function getOrCreateSession(
  userId: string | null,
  scopedListingId?: string,
): Promise<string> {
  // Reuse the most recent open session for this user (within 24h) if scoped
  // to the same listing, otherwise always create a fresh session.
  if (userId && scopedListingId) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await prisma.conciergeSession.findFirst({
      where: { userId, scopedListingId, createdAt: { gte: cutoff } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing.id;
  }

  const session = await prisma.conciergeSession.create({
    data: { userId, scopedListingId },
  });
  return session.id;
}

export async function getSessionMessages(
  sessionId: string,
): Promise<ConciergeMessageRow[]> {
  return prisma.conciergeMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function saveMessage(
  sessionId: string,
  role: string,
  content: string,
  toolCalls?: unknown,
): Promise<void> {
  await prisma.conciergeMessage.create({
    data: { sessionId, role, content, toolCalls: toolCalls ?? undefined },
  });
}

export async function getSessionTokenCount(sessionId: string): Promise<number> {
  const result = await prisma.conciergeUsage.aggregate({
    where: { sessionId },
    _sum: { inputTokens: true },
  });
  return result._sum.inputTokens ?? 0;
}
