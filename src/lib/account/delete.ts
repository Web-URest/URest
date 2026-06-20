/**
 * Account deletion (#35, PRODUCT_FLOWS §3.7 + ADR-010 §5). Sole writer of the
 * delete/anonymize transition.
 *
 * - No ledger/host/social footprint → HARD delete (true PDPA erasure).
 * - Any footprint → soft-delete + anonymize: scrub PII, keep the row so the
 *   append-only ledger + bookings + social records stay coherent.
 *
 * Auth is revoked either way (DB sessions deleted). No AuditLog row — that table
 * is admin-only; the `deletedAt`/`anonymizedAt` timestamps are the record.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export type DeleteMode = "HARD" | "ANONYMIZED";

/** Relations whose presence means the row must survive (ledger/host/social). */
const FOOTPRINT_COUNT = {
  bookings: true,
  listings: true,
  payoutAccounts: true,
  reviewsWritten: true,
  guestRatingsGiven: true,
  guestRatingsReceived: true,
  reportsSubmitted: true,
  // A user *reported by someone else* anonymizes rather than hard-deletes, so the
  // abuse-report subject linkage survives (PII is still scrubbed — erasure-equivalent
  // — the reported party just can't erase the trail by deleting their account).
  reportsReceived: true,
  messagesSent: true,
  hostStrikes: true,
  payoutHolds: true,
  kycSubmissions: true,
} as const;

export async function deleteAccount(userId: string): Promise<{ mode: DeleteMode }> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, _count: { select: FOOTPRINT_COUNT } },
    });
    if (!user) throw new Error(`deleteAccount: user ${userId} not found`);

    const hasFootprint = Object.values(user._count).some((n) => n > 0);
    const now = new Date();

    // Revoke auth + clear owned/ephemeral data either way.
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.phoneOtp.deleteMany({ where: { userId } });
    await tx.savedVilla.deleteMany({ where: { userId } });
    await tx.conciergeSession.deleteMany({ where: { userId } }); // cascades messages/usage/drafts

    if (!hasFootprint) {
      // True erasure: drop remaining owned rows, then the user itself.
      await tx.consent.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
      return { mode: "HARD" as const };
    }

    // Anonymize: scrub PII, keep the row + every ledger/social reference.
    await tx.user.update({
      where: { id: userId },
      data: {
        displayName: "[deleted]",
        email: null,
        phone: null,
        lineUserId: null,
        image: null,
        notificationPrefs: Prisma.DbNull,
        deletedAt: now,
        anonymizedAt: now,
      },
    });
    return { mode: "ANONYMIZED" as const };
  });
}
