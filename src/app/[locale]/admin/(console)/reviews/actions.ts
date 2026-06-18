"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { resolveReviewFlag } from "@/lib/reviews/flag";
import { removeReview } from "@/lib/reviews/reviews";

/**
 * Admin review-moderation actions (§5.5, issue #28). Each re-guards with
 * `requireAdmin`. KEEP dismisses the flag (the review stays); REMOVE soft-deletes
 * the review (audited + aggregate recompute) and resolves the flag. Removal is
 * for policy violations only — "host disagrees" is not grounds.
 */

export async function keepReviewAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  await resolveReviewFlag(String(fd.get("reportId")), "DISMISSED", admin.id, new Date());
  revalidatePath("/admin/reviews");
}

export async function removeReviewAction(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const reportId = String(fd.get("reportId"));
  const reviewId = String(fd.get("reviewId"));
  const reason = String(fd.get("reason") ?? "").trim() || "policy violation";
  await removeReview(admin, reviewId, reason);
  await resolveReviewFlag(reportId, "RESOLVED", admin.id, new Date());
  revalidatePath("/admin/reviews");
}
