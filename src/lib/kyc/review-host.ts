/**
 * Host-side NEEDS_INFO fulfillment (PRODUCT_FLOWS §5.1, issue #14). After an
 * admin sends a listing back with an itemized checklist, the host works through
 * it here. CLAUDE.md rule 2: KycSubmission writes stay in lib/kyc.
 *
 * TRAP: `getOrCreateSubmission` (submission.ts) filters on PENDING_REVIEW, so it
 * would spawn a SECOND submission for a NEEDS_INFO listing and orphan the docs.
 * This module loads the NEEDS_INFO submission explicitly. Document uploads reuse
 * the status-agnostic `addDocument` from submission.ts unchanged.
 */
import type { KycDocument, KycSubmission } from "@prisma/client";
import { KycStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { KycError } from "./submission";
import { parseNeedsInfoItems, type NeedsInfoItemKey } from "./review";

export type NeedsInfoSubmission = KycSubmission & { documents: KycDocument[] };

/**
 * The host's NEEDS_INFO submission for a listing (with its documents), or null.
 * Filtered by userId so a non-owner can never load it. Pages render `notFound()`
 * on null; the mutating helpers below load + throw instead.
 */
export async function loadNeedsInfoSubmission(
  userId: string,
  listingId: string,
): Promise<NeedsInfoSubmission | null> {
  return prisma.kycSubmission.findFirst({
    where: { userId, listingId, status: KycStatus.NEEDS_INFO },
    include: { documents: true },
  });
}

/**
 * Toggle one checklist item's `satisfied` flag (the host marks it done after
 * uploading / re-pinning / fixing the bank name — the 7 items are heterogeneous,
 * so fulfillment is manual). Re-checks ownership + that the row is NEEDS_INFO.
 */
export async function markItemSatisfied(
  userId: string,
  submissionId: string,
  item: NeedsInfoItemKey,
  satisfied: boolean,
): Promise<void> {
  const submission = await prisma.kycSubmission.findUnique({ where: { id: submissionId } });
  if (!submission) throw new KycError("NOT_FOUND");
  if (submission.userId !== userId) throw new KycError("NOT_OWNER");
  if (submission.status !== KycStatus.NEEDS_INFO) throw new KycError("WRONG_STATE");

  const items = parseNeedsInfoItems(submission.needsInfoItems);
  const idx = items.findIndex((i) => i.item === item);
  if (idx === -1) throw new KycError("ITEM_NOT_IN_CHECKLIST");

  const current = items[idx]!;
  items[idx] = { ...current, satisfied };

  await prisma.kycSubmission.update({
    where: { id: submissionId },
    data: { needsInfoItems: items as unknown as Prisma.InputJsonValue },
  });
}
