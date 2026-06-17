/**
 * Live-listing edits (PRODUCT_FLOWS §4.4). The wizard path (`transitions.ts`) is
 * DRAFT-locked; this module is the ONLY place that edits a listing once it has
 * left DRAFT — and the only place that writes `Listing.status` for those edits
 * (CLAUDE.md rule 2).
 *
 * Edit rules (§4.4):
 *   - Operational fields (basics text, amenities, rules, pricing, seasons, mode)
 *     save in place — status unchanged.
 *   - Location edits requeue review: the listing flips to PENDING_REVIEW and is no
 *     longer publicly visible until an admin re-approves (§2.2).
 *
 * Editable states are PUBLISHED, UNLISTED, NEEDS_INFO. DRAFT goes through the
 * wizard; PENDING_REVIEW is in the admin's hands; REJECTED is terminal.
 */

import type { Listing } from "@prisma/client";
import { BookingMode, ListingStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

import {
  ListingError,
  writeSeasons,
  type ListingDraftPatch,
  type SeasonWrite,
} from "./transitions";

/** Statuses whose listings the host may edit (§4.4). */
const EDITABLE_STATUSES: readonly ListingStatus[] = [
  ListingStatus.PUBLISHED,
  ListingStatus.UNLISTED,
  ListingStatus.NEEDS_INFO,
];

/**
 * Operational (no-re-review) fields. Deliberately omits location (`address`,
 * `mapLat`, `mapLng`), `regionId`, and the booking-mode pair — location goes
 * through `editLocation` (re-review) and mode through `setBookingMode` (ack gate).
 */
export type ListingOperationalPatch = Omit<
  ListingDraftPatch,
  "regionId" | "address" | "mapLat" | "mapLng" | "bookingMode" | "instantAckAt"
>;

/** Load a listing owned by `hostId` in an editable state, or throw the reason. */
export async function loadOwnedEditable(
  listingId: string,
  hostId: string,
): Promise<Listing> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new ListingError("NOT_FOUND");
  if (listing.hostId !== hostId) throw new ListingError("NOT_OWNER");
  if (!EDITABLE_STATUSES.includes(listing.status)) {
    throw new ListingError("NOT_EDITABLE");
  }
  return listing;
}

/** Save no-re-review fields in place. Status is never touched. */
export async function editOperational(
  listingId: string,
  hostId: string,
  patch: ListingOperationalPatch,
): Promise<Listing> {
  await loadOwnedEditable(listingId, hostId);
  return prisma.listing.update({ where: { id: listingId }, data: patch });
}

/** Replace seasons on a live listing (no-re-review, §4.4 ราคา & ซีซั่น). */
export async function editSeasons(
  listingId: string,
  hostId: string,
  seasons: readonly SeasonWrite[],
): Promise<void> {
  await loadOwnedEditable(listingId, hostId);
  await writeSeasons(listingId, seasons);
}

/**
 * Switch booking mode in place (no-re-review). Turning on ⚡ instant requires the
 * stale-calendar acknowledgment (mirrors the wizard gate); the timestamp is
 * recorded once and kept on later mode flips so the record of acknowledgment
 * survives switching back to request mode.
 */
export async function setBookingMode(
  listingId: string,
  hostId: string,
  mode: BookingMode,
  ack: boolean,
): Promise<Listing> {
  const listing = await loadOwnedEditable(listingId, hostId);

  if (mode === BookingMode.INSTANT && !listing.instantAckAt && !ack) {
    throw new ListingError("INSTANT_ACK_REQUIRED");
  }

  const instantAckAt =
    mode === BookingMode.INSTANT && !listing.instantAckAt
      ? new Date()
      : listing.instantAckAt;

  return prisma.listing.update({
    where: { id: listingId },
    data: { bookingMode: mode, instantAckAt },
  });
}

/**
 * Edit location → re-review (§4.4: "the listing goes UNLISTED until re-approved").
 * Per the §2.2 state machine the listing moves PUBLISHED/NEEDS_INFO → PENDING_REVIEW
 * (no longer publicly visible while pending). These are the fields a scammer would
 * change after approval, so they always requeue.
 */
export async function editLocation(
  listingId: string,
  hostId: string,
  location: { address: string; mapLat: number | null; mapLng: number | null },
): Promise<Listing> {
  await loadOwnedEditable(listingId, hostId);
  return prisma.listing.update({
    where: { id: listingId },
    data: { ...location, status: ListingStatus.PENDING_REVIEW },
  });
}
