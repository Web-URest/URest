"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireHostEligible } from "@/lib/auth/guards";
import { markItemSatisfied } from "@/lib/kyc/review-host";
import { resubmitForReview } from "@/lib/host/listing-resubmit";
import type { NeedsInfoItemKey } from "@/lib/kyc/review";
import { redirect } from "@/i18n/navigation";

/**
 * Host NEEDS_INFO fulfillment actions (PRODUCT_FLOWS §5.1, issue #14). Both
 * re-guard with `requireHostEligible()`; the domain modules re-check ownership.
 */

export async function markItemAction(
  listingId: string,
  submissionId: string,
  item: NeedsInfoItemKey,
  satisfied: boolean,
  _fd: FormData,
): Promise<void> {
  const user = await requireHostEligible();
  await markItemSatisfied(user.id, submissionId, item, satisfied);
  revalidatePath(`/listings/${listingId}/needs-info`);
}

export async function resubmitAction(listingId: string, _fd: FormData): Promise<void> {
  const user = await requireHostEligible();
  await resubmitForReview(user.id, listingId);
  const locale = await getLocale();
  redirect({ href: `/listings/${listingId}/edit`, locale });
}
