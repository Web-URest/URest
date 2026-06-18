/**
 * Host strike issuance (ADR-012 §2). Shared by the automatic paths (host cancel,
 * dispute-resolved-as-host-fault — lib/booking/transitions) and the manual admin
 * path (report triage §5.6 — lib/admin/report-review). Always called inside the
 * caller's transaction so the strike + any suspension commit atomically with it.
 */
import type { HostStrikeReason, Prisma } from "@prisma/client";

/** 3 strikes → host suspended (ADR-012 §2). */
export const STRIKE_SUSPENSION_THRESHOLD = 3;

/**
 * Record a host strike; the third (or later) strike sets `User.suspendedAt`.
 * `bookingId` is null for strikes not tied to a booking (e.g. a listing/user report).
 */
export async function issueStrike(
  tx: Prisma.TransactionClient,
  hostUserId: string,
  reason: HostStrikeReason,
  bookingId: string | null,
  now: Date,
): Promise<void> {
  await tx.hostStrike.create({ data: { hostUserId, bookingId, reason } });
  const strikes = await tx.hostStrike.count({ where: { hostUserId } });
  if (strikes >= STRIKE_SUSPENSION_THRESHOLD) {
    await tx.user.update({ where: { id: hostUserId }, data: { suspendedAt: now } });
  }
}
