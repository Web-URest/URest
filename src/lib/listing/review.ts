/**
 * Listing review-lifecycle writes (PRODUCT_FLOWS §5.1, §2.2). The admin approval
 * path moves `Listing.status` out of the DRAFT flow that `transitions.ts` owns;
 * keeping these here preserves CLAUDE.md rule 2 (lib/listing is the only writer
 * of Listing.status) while the legal badge timestamp lives alongside.
 *
 * Each function is an OPERATION BUILDER: it returns an un-awaited
 * `Prisma.PrismaPromise` so the admin coordinator (`lib/admin/listing-review.ts`)
 * can compose it with the KycSubmission write + the AuditLog row into ONE atomic
 * `$transaction` (issue #14 AC#4). They are compose-only — never await standalone.
 */
import { ListingStatus } from "@prisma/client";
import type { Listing, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

/** PENDING_REVIEW → PUBLISHED, stamping `publishedAt` (admin approve). */
export function publishListingOp(listingId: string, at: Date): Prisma.PrismaPromise<Listing> {
  return prisma.listing.update({
    where: { id: listingId },
    data: { status: ListingStatus.PUBLISHED, publishedAt: at },
  });
}

/** PENDING_REVIEW → REJECTED (admin reject). */
export function rejectListingOp(listingId: string): Prisma.PrismaPromise<Listing> {
  return prisma.listing.update({
    where: { id: listingId },
    data: { status: ListingStatus.REJECTED },
  });
}

/** PENDING_REVIEW → NEEDS_INFO (admin requests itemized fixes). */
export function needsInfoListingOp(listingId: string): Prisma.PrismaPromise<Listing> {
  return prisma.listing.update({
    where: { id: listingId },
    data: { status: ListingStatus.NEEDS_INFO },
  });
}

/** NEEDS_INFO → PENDING_REVIEW (host resubmits after fixing every item). */
export function resubmitListingOp(listingId: string): Prisma.PrismaPromise<Listing> {
  return prisma.listing.update({
    where: { id: listingId },
    data: { status: ListingStatus.PENDING_REVIEW },
  });
}

/** Grant the ถูกต้องตามกฎหมาย badge (independent of approval, §5.1 / AC#3). */
export function grantLegalBadgeOp(listingId: string, at: Date): Prisma.PrismaPromise<Listing> {
  return prisma.listing.update({
    where: { id: listingId },
    data: { legalBadgeAt: at },
  });
}

/** Refuse / revoke the badge — never blocks listing approval. */
export function refuseLegalBadgeOp(listingId: string): Prisma.PrismaPromise<Listing> {
  return prisma.listing.update({
    where: { id: listingId },
    data: { legalBadgeAt: null },
  });
}
