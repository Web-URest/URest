import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

// Haiku 4.5 token prices in satang per 1M tokens (as of spec lock 2026-06-12).
// Update when CONCIERGE_MODEL changes (gate on eval results per ADR-006).
const HAIKU_INPUT_SATANG_PER_MTOK = 25; // $0.25/Mtok × ~100 satang/$ ≈ 25
const HAIKU_OUTPUT_SATANG_PER_MTOK = 125; // $1.25/Mtok

export function computeCostSatang(
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost = Math.round(
    (inputTokens / 1_000_000) * HAIKU_INPUT_SATANG_PER_MTOK,
  );
  const outputCost = Math.round(
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_SATANG_PER_MTOK,
  );
  return inputCost + outputCost;
}

/** True when monthly ConciergeUsage.costSatang sum ≥ CONCIERGE_BUDGET_SATANG. */
export async function isKillSwitchActive(): Promise<boolean> {
  const now = new Date();
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);

  const result = await prisma.conciergeUsage.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { costSatang: true },
  });

  const spent = result._sum.costSatang ?? 0;
  return spent >= env.CONCIERGE_BUDGET_SATANG;
}

/** True when user has hit their daily message limit (resets midnight UTC+7). */
export async function isDailyLimitReached(userId: string): Promise<boolean> {
  // Midnight ICT = UTC-17h offset: ICT midnight = UTC 17:00 previous day.
  const now = new Date();
  const ictOffset = 7 * 60 * 60 * 1000;
  const ictNow = new Date(now.getTime() + ictOffset);
  const ictMidnight = new Date(
    Date.UTC(ictNow.getUTCFullYear(), ictNow.getUTCMonth(), ictNow.getUTCDate()),
  );
  const utcMidnight = new Date(ictMidnight.getTime() - ictOffset);

  const count = await prisma.conciergeMessage.count({
    where: {
      session: { userId },
      role: "user",
      createdAt: { gte: utcMidnight },
    },
  });

  return count >= env.CONCIERGE_DAILY_MSG_LIMIT;
}

/** True when cumulative input tokens in a session exceeds the conversation ceiling. */
export function isTokenCeilingReached(cumulativeInputTokens: number): boolean {
  return cumulativeInputTokens >= 60_000;
}

export async function logUsage(
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadInputTokens: number,
): Promise<void> {
  const costSatang = computeCostSatang(inputTokens, outputTokens);
  await prisma.conciergeUsage.create({
    data: { sessionId, inputTokens, outputTokens, cacheReadInputTokens, costSatang },
  });
}
