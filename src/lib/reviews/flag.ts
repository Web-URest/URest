/**
 * Review flagging + moderation resolution (PRODUCT_FLOWS §5.5). Reviews are
 * load-bearing for trust, so any user can flag one → a reviewId-scoped `Report`
 * row → the admin review queue keeps (DISMISSED) or removes (RESOLVED + the
 * soft-delete in `removeReview`).
 *
 * NOTE: `Report` is the shared reports/disputes table owned by #27; #28 is its
 * first writer, strictly for the review-flag vertical (`reviewId` target). The
 * general reports admin generalizes this later.
 */
import { ReportCategory, ReportStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

/** A user flags a review for moderation. `reporterId` is null for a logged-out reporter. */
export async function flagReview(
  reporterId: string | null,
  reviewId: string,
  reason: string,
): Promise<void> {
  await prisma.report.create({
    data: {
      reporterId,
      reviewId,
      category: ReportCategory.OTHER, // the ReportCategory enum targets listing/booking reports
      text: reason.trim() || "(no reason given)",
      status: ReportStatus.RECEIVED,
    },
  });
}

export type ReviewFlagResolution = "DISMISSED" | "RESOLVED";

/** Close a review flag: DISMISSED (keep the review) or RESOLVED (review was removed). */
export async function resolveReviewFlag(
  reportId: string,
  resolution: ReviewFlagResolution,
  adminId: string,
  now: Date,
): Promise<void> {
  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: resolution === "RESOLVED" ? ReportStatus.RESOLVED : ReportStatus.DISMISSED,
      triageByAdminId: adminId,
      triageAt: now,
      resolvedAt: now,
    },
  });
}
