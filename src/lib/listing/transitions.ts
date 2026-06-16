/**
 * Listing state machine + DRAFT writes (CLAUDE.md rule 2, PRODUCT_FLOWS §2.2).
 *
 * This module is the ONLY place that writes `Listing.status`. Pages, components,
 * and server actions call these functions — they never touch the status field
 * directly. Every mutation re-checks ownership and that the listing is still a
 * DRAFT, so a stale client can't edit an already-submitted listing.
 */

import type { Listing } from "@prisma/client";
import { ListingStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import { findSeasonOverlap } from "./seasons";

export type ListingErrorReason =
  | "NOT_FOUND"
  | "NOT_OWNER"
  | "NOT_DRAFT"
  | "INCOMPLETE"
  | "INSUFFICIENT_PHOTOS"
  | "SEASON_OVERLAP"
  | "INSTANT_ACK_REQUIRED";

export class ListingError extends Error {
  constructor(public readonly reason: ListingErrorReason) {
    super(reason);
    this.name = "ListingError";
  }
}

/** Minimum photos before a listing may be submitted (PRODUCT_FLOWS §4.1 ②). */
export const MIN_PHOTOS = 5;

/**
 * Scalar listing fields a DRAFT edit may set — deliberately excludes `status`.
 * Pool dimensions are `Decimal` columns; we accept a plain `number` (Prisma's
 * update input coerces it) so callers never touch Decimal.js.
 */
export type ListingDraftPatch = Partial<
  Pick<
    Listing,
    | "title"
    | "description"
    | "address"
    | "mapLat"
    | "mapLng"
    | "regionId"
    | "bedrooms"
    | "beds"
    | "baths"
    | "maxGuests"
    | "amenities"
    | "partyPolicy"
    | "quietHoursStart"
    | "quietHoursEnd"
    | "cashDepositSatang"
    | "checkInTime"
    | "checkOutTime"
    | "includedGuests"
    | "extraGuestFeeSatang"
    | "baseWeekdaySatang"
    | "baseWeekendSatang"
    | "holidaySatang"
    | "cancellationTier"
    | "bookingMode"
    | "instantAckAt"
  >
> & {
  poolLengthM?: number | null;
  poolWidthM?: number | null;
  poolDepthM?: number | null;
};

/** Load a DRAFT owned by `hostId`, or throw the precise reason. */
async function loadOwnedDraft(listingId: string, hostId: string): Promise<Listing> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new ListingError("NOT_FOUND");
  if (listing.hostId !== hostId) throw new ListingError("NOT_OWNER");
  if (listing.status !== ListingStatus.DRAFT) throw new ListingError("NOT_DRAFT");
  return listing;
}

/** Start a new DRAFT listing for a host in a region (wizard entry). */
export async function createDraft(hostId: string, regionId: string): Promise<Listing> {
  return prisma.listing.create({
    data: { hostId, regionId, status: ListingStatus.DRAFT, title: "" },
  });
}

/** Apply a step's scalar fields to a DRAFT (autosave). Never changes status. */
export async function updateDraft(
  listingId: string,
  hostId: string,
  patch: ListingDraftPatch,
): Promise<Listing> {
  await loadOwnedDraft(listingId, hostId);
  return prisma.listing.update({ where: { id: listingId }, data: patch });
}

/**
 * Replace a DRAFT's seasons atomically (step ⑤). App-checks overlap first for a
 * friendly error; the `season_no_overlap` GiST constraint is the backstop.
 */
export async function replaceSeasons(
  listingId: string,
  hostId: string,
  seasons: readonly {
    nameTh: string;
    startDate: Date;
    endDate: Date;
    weekdaySatang: number;
    weekendSatang: number;
  }[],
): Promise<void> {
  await loadOwnedDraft(listingId, hostId);
  if (findSeasonOverlap(seasons)) throw new ListingError("SEASON_OVERLAP");

  await prisma.$transaction([
    prisma.season.deleteMany({ where: { listingId } }),
    prisma.season.createMany({
      data: seasons.map((s) => ({ listingId, ...s })),
    }),
  ]);
}

/**
 * DRAFT → PENDING_REVIEW (PRODUCT_FLOWS §2.2). Runs the full-listing gate first:
 * required fields present, ≥5 photos, no overlapping seasons, and the instant-mode
 * acknowledgment recorded when instant book is on. Throws the failing reason.
 */
export async function submitForReview(listingId: string, hostId: string): Promise<Listing> {
  const listing = await loadOwnedDraft(listingId, hostId);

  const complete =
    listing.title.trim().length > 0 &&
    listing.regionId.length > 0 &&
    listing.baseWeekdaySatang > 0 &&
    listing.baseWeekendSatang > 0;
  if (!complete) throw new ListingError("INCOMPLETE");

  if (listing.bookingMode === "INSTANT" && !listing.instantAckAt) {
    throw new ListingError("INSTANT_ACK_REQUIRED");
  }

  const [photoCount, seasons] = await Promise.all([
    prisma.listingPhoto.count({ where: { listingId } }),
    prisma.season.findMany({ where: { listingId } }),
  ]);
  if (photoCount < MIN_PHOTOS) throw new ListingError("INSUFFICIENT_PHOTOS");
  if (findSeasonOverlap(seasons)) throw new ListingError("SEASON_OVERLAP");

  return prisma.listing.update({
    where: { id: listingId },
    data: { status: ListingStatus.PENDING_REVIEW },
  });
}
