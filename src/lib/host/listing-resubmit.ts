/**
 * Host resubmit after NEEDS_INFO (PRODUCT_FLOWS §5.1, issue #14). The host-side
 * mirror of the admin coordinator: it composes the listing + KYC status writes
 * (authored as op builders in lib/listing/review + lib/kyc/review) into one
 * `$transaction`. No AuditLog — this is a host action, not an admin one.
 *
 * Gate: resubmit is allowed only when EVERY checklist item is satisfied
 * (`allItemsSatisfied`), so the listing returns to PENDING_REVIEW complete —
 * one-shot re-review, not a back-and-forth loop.
 */
import { KycStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { resubmitListingOp } from "@/lib/listing/review";
import { allItemsSatisfied, parseNeedsInfoItems, resubmitKycOp } from "@/lib/kyc/review";

export type ResubmitErrorReason = "NOT_FOUND" | "ITEMS_INCOMPLETE";

export class ResubmitError extends Error {
  constructor(public readonly reason: ResubmitErrorReason) {
    super(reason);
    this.name = "ResubmitError";
  }
}

/**
 * NEEDS_INFO → PENDING_REVIEW for the host's listing, once every item is
 * satisfied. Filtered by userId, so a non-owner gets NOT_FOUND.
 */
export async function resubmitForReview(userId: string, listingId: string): Promise<void> {
  const submission = await prisma.kycSubmission.findFirst({
    where: { userId, listingId, status: KycStatus.NEEDS_INFO },
  });
  if (!submission) throw new ResubmitError("NOT_FOUND");

  if (!allItemsSatisfied(parseNeedsInfoItems(submission.needsInfoItems))) {
    throw new ResubmitError("ITEMS_INCOMPLETE");
  }

  await prisma.$transaction([resubmitListingOp(listingId), resubmitKycOp(submission.id)]);
}
