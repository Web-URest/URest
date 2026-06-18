"use server";

import { auth } from "@/lib/auth/auth";
import { flagReview } from "@/lib/reviews/flag";

/**
 * Flag a review for moderation (PRODUCT_FLOWS §5.5). Any visitor may flag; the
 * reporter id is attached when logged in, null otherwise. Creates a reviewId Report.
 */
export async function flagReviewAction(reviewId: string, reason: string): Promise<{ ok: boolean }> {
  const session = await auth();
  try {
    await flagReview(session?.user?.id ?? null, reviewId, reason);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
