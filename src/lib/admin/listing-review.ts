/**
 * Admin listing-approval coordinator (PRODUCT_FLOWS §5.1, issue #14).
 *
 * The seam that satisfies AC#4 ("every decision writes AuditLog in the SAME
 * transaction as the state change") without breaking CLAUDE.md rule 2: the
 * domain modules (`lib/listing/review`, `lib/kyc/review`) author every
 * status write as an un-awaited operation builder; this coordinator composes
 * those builders + the AuditLog row into ONE `prisma.$transaction([...])`, then
 * fires `notify()` AFTER (notify does its own logging + send and never throws,
 * so it must not ride inside the tx). Living in `lib/admin` keeps lib/listing
 * and lib/kyc from importing each other.
 *
 * No cross-admin double-decision lock (pilot volume) — mirrors the
 * read-then-update shape of `submitForReview`.
 */
import type { Prisma } from "@prisma/client";
import { KycStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import {
  grantLegalBadgeOp,
  needsInfoListingOp,
  publishListingOp,
  refuseLegalBadgeOp,
  rejectListingOp,
} from "@/lib/listing/review";
import {
  approveKycOp,
  needsInfoKycOp,
  purgeDocumentsOp,
  rejectKycOp,
  type NeedsInfoItem,
} from "@/lib/kyc/review";

import type { AdminPrincipal } from "./auth";

export type ReviewErrorReason =
  | "NOT_FOUND"
  | "WRONG_STATE"
  | "EMPTY_NEEDS_INFO"
  | "REASON_REQUIRED";

export class ReviewError extends Error {
  constructor(public readonly reason: ReviewErrorReason) {
    super(reason);
    this.name = "ReviewError";
  }
}

/** Rejected KYC docs are retained 90 days then purged (ADR-007). */
const PURGE_DAYS = 90;
const purgeDate = (from: Date): Date =>
  new Date(from.getTime() + PURGE_DAYS * 24 * 60 * 60 * 1000);

type ListingSnapshotSource = {
  status: string;
  publishedAt: Date | null;
  legalBadgeAt: Date | null;
};

/** JSON-safe before/after snapshot (Dates → ISO; the column is `Json?`). */
function snapshot(
  listing: ListingSnapshotSource,
  kycStatus: string,
): Prisma.InputJsonObject {
  return {
    listingStatus: listing.status,
    kycStatus,
    publishedAt: listing.publishedAt ? listing.publishedAt.toISOString() : null,
    legalBadgeAt: listing.legalBadgeAt ? listing.legalBadgeAt.toISOString() : null,
  };
}

/** Load a PENDING_REVIEW submission + its listing, or throw the precise reason. */
async function loadPendingSubmission(submissionId: string) {
  const submission = await prisma.kycSubmission.findUnique({
    where: { id: submissionId },
    include: {
      listing: {
        select: { id: true, hostId: true, title: true, status: true, publishedAt: true, legalBadgeAt: true },
      },
    },
  });
  if (!submission || !submission.listing) throw new ReviewError("NOT_FOUND");
  if (submission.status !== KycStatus.PENDING_REVIEW) throw new ReviewError("WRONG_STATE");
  return { submission, listing: submission.listing };
}

/** อนุมัติ — PENDING_REVIEW → PUBLISHED + KYC APPROVED. */
export async function approveSubmission(
  admin: AdminPrincipal,
  submissionId: string,
): Promise<void> {
  const { submission, listing } = await loadPendingSubmission(submissionId);
  const now = new Date();
  const before = snapshot(listing, submission.status);
  const after: Prisma.InputJsonObject = {
    listingStatus: "PUBLISHED",
    kycStatus: "APPROVED",
    publishedAt: now.toISOString(),
    legalBadgeAt: before.legalBadgeAt,
  };

  await prisma.$transaction([
    publishListingOp(listing.id, now),
    approveKycOp(submissionId, admin.id, now),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "LISTING_APPROVED",
        targetType: "Listing",
        targetId: listing.id,
        before,
        after,
      },
    }),
  ]);

  await notify(listing.hostId, "LISTING_APPROVED", { listingTitle: listing.title });
}

/** ปฏิเสธ — PENDING_REVIEW → REJECTED + KYC REJECTED + 90-day doc purge. Reason required. */
export async function rejectSubmission(
  admin: AdminPrincipal,
  submissionId: string,
  reason: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new ReviewError("REASON_REQUIRED");

  const { submission, listing } = await loadPendingSubmission(submissionId);
  const now = new Date();
  const before = snapshot(listing, submission.status);
  const after: Prisma.InputJsonObject = {
    listingStatus: "REJECTED",
    kycStatus: "REJECTED",
    publishedAt: before.publishedAt,
    legalBadgeAt: before.legalBadgeAt,
    reason: trimmed,
  };

  await prisma.$transaction([
    rejectListingOp(listing.id),
    rejectKycOp(submissionId, admin.id, now),
    purgeDocumentsOp(submissionId, purgeDate(now)),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "LISTING_REJECTED",
        targetType: "Listing",
        targetId: listing.id,
        before,
        after,
      },
    }),
  ]);

  await notify(listing.hostId, "LISTING_REJECTED", {
    listingTitle: listing.title,
    reason: trimmed,
  });
}

/** ขอข้อมูลเพิ่ม — PENDING_REVIEW → NEEDS_INFO with the itemized checklist. */
export async function requestNeedsInfo(
  admin: AdminPrincipal,
  submissionId: string,
  items: NeedsInfoItem[],
): Promise<void> {
  if (items.length === 0) throw new ReviewError("EMPTY_NEEDS_INFO");

  const { submission, listing } = await loadPendingSubmission(submissionId);
  const now = new Date();
  const before = snapshot(listing, submission.status);
  const after: Prisma.InputJsonObject = {
    listingStatus: "NEEDS_INFO",
    kycStatus: "NEEDS_INFO",
    publishedAt: before.publishedAt,
    legalBadgeAt: before.legalBadgeAt,
    items: items as unknown as Prisma.InputJsonValue,
  };

  await prisma.$transaction([
    needsInfoListingOp(listing.id),
    needsInfoKycOp(submissionId, admin.id, items, now),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: "LISTING_NEEDS_INFO",
        targetType: "Listing",
        targetId: listing.id,
        before,
        after,
      },
    }),
  ]);

  await notify(listing.hostId, "LISTING_NEEDS_INFO", {
    listingTitle: listing.title,
    items: items as unknown as Prisma.InputJsonValue,
  });
}

/**
 * Grant / refuse the ถูกต้องตามกฎหมาย badge (§5.1). INDEPENDENT of the review
 * decision — its own transaction, allowed in any listing state (AC#3: badge
 * never blocks or is blocked by approval).
 */
export async function setLegalBadge(
  admin: AdminPrincipal,
  listingId: string,
  grant: boolean,
): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, legalBadgeAt: true },
  });
  if (!listing) throw new ReviewError("NOT_FOUND");

  const now = new Date();
  const before: Prisma.InputJsonObject = {
    legalBadgeAt: listing.legalBadgeAt ? listing.legalBadgeAt.toISOString() : null,
  };
  const after: Prisma.InputJsonObject = {
    legalBadgeAt: grant ? now.toISOString() : null,
  };

  await prisma.$transaction([
    grant ? grantLegalBadgeOp(listingId, now) : refuseLegalBadgeOp(listingId),
    prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: grant ? "LEGAL_BADGE_GRANTED" : "LEGAL_BADGE_REFUSED",
        targetType: "Listing",
        targetId: listingId,
        before,
        after,
      },
    }),
  ]);
}
