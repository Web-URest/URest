/**
 * Host → guest ratings (PRODUCT_FLOWS §3.4). The ONLY writer of `GuestRating`.
 * After a COMPLETED stay the listing's host rates the guest 1–5 (one per
 * booking); the average is shown to future hosts on a request (§4.2
 * accept-confidence) — never to guests. No edits, no public surface.
 */
import { BookingStatus } from "@prisma/client";

import { prisma } from "@/lib/db";

export type RatingErrorReason =
  | "NOT_FOUND"
  | "NOT_HOST" // the rater isn't the listing's host
  | "NOT_COMPLETED"
  | "ALREADY_RATED" // one rating per booking (also DB @unique)
  | "INVALID_SCORE"; // outside 1..5

export class RatingError extends Error {
  constructor(public readonly reason: RatingErrorReason) {
    super(reason);
    this.name = "RatingError";
  }
}

/** Fetch + guard a ratable booking, or throw `RatingError`. */
async function assertRatable(bookingId: string, hostId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      userId: true, // the guest = the ratee
      listing: { select: { hostId: true } },
      guestRating: { select: { id: true } },
    },
  });
  if (!booking) throw new RatingError("NOT_FOUND");
  if (booking.listing.hostId !== hostId) throw new RatingError("NOT_HOST");
  if (booking.status !== BookingStatus.COMPLETED) throw new RatingError("NOT_COMPLETED");
  if (booking.guestRating) throw new RatingError("ALREADY_RATED");
  return booking;
}

export type RateEligibility = { ok: true } | { ok: false; reason: RatingErrorReason };

/** Read-only eligibility for the host UI (whether to show the rate-guest control). */
export async function canRateGuest(bookingId: string, hostId: string): Promise<RateEligibility> {
  try {
    await assertRatable(bookingId, hostId);
    return { ok: true };
  } catch (e) {
    if (e instanceof RatingError) return { ok: false, reason: e.reason };
    throw e;
  }
}

export interface RateGuestInput {
  bookingId: string;
  hostRaterId: string;
  score: number;
  reason?: string;
}

export async function rateGuest(input: RateGuestInput): Promise<void> {
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5) {
    throw new RatingError("INVALID_SCORE");
  }
  const booking = await assertRatable(input.bookingId, input.hostRaterId);
  await prisma.guestRating.create({
    data: {
      bookingId: input.bookingId,
      hostRaterId: input.hostRaterId,
      guestRateeId: booking.userId,
      score: input.score,
      reason: input.reason?.trim() || null,
    },
  });
}

export interface GuestRatingSummary {
  avgScore: number | null;
  count: number;
}

/** A guest's host-given rating summary — the §4.2 accept-confidence number. */
export async function loadGuestRatingSummary(guestUserId: string): Promise<GuestRatingSummary> {
  const agg = await prisma.guestRating.aggregate({
    where: { guestRateeId: guestUserId },
    _avg: { score: true },
    _count: true,
  });
  return { avgScore: agg._avg.score, count: agg._count };
}
