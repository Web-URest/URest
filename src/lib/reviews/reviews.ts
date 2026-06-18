/**
 * Reviews domain (PRODUCT_FLOWS §3.4). The ONLY writer of `Review` and of the
 * denormalized `Listing.avgRating`/`reviewCount` aggregate. A guest reviews a
 * stay once, within 14 days of a COMPLETED booking; reviews never edit and are
 * removed only by admin moderation (soft-delete, §5.5). The aggregate is
 * recomputed inside the same transaction as every write so it can never drift.
 */
import { BookingStatus, type Prisma } from "@prisma/client";

import type { AdminPrincipal } from "@/lib/admin/auth";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { publicUrl } from "@/lib/storage/r2";

type Tx = Prisma.TransactionClient;

export const REVIEW_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ReviewErrorReason =
  | "NOT_FOUND"
  | "NOT_GUEST" // the acting user isn't this booking's guest
  | "NOT_COMPLETED" // a review needs a finished stay
  | "WINDOW_CLOSED" // past COMPLETED + 14 days
  | "ALREADY_REVIEWED" // one review per booking (also DB @unique)
  | "INVALID_SCORE"; // a star score outside 1..5

export class ReviewError extends Error {
  constructor(public readonly reason: ReviewErrorReason) {
    super(reason);
    this.name = "ReviewError";
  }
}

export interface SubmitReviewInput {
  bookingId: string;
  authorId: string;
  overall: number;
  cleanliness: number;
  accuracyToPhotos: number;
  hostResponsiveness: number;
  valueForMoney: number;
  text?: string;
  photoKeys?: string[];
}

const SCORE_KEYS = [
  "overall",
  "cleanliness",
  "accuracyToPhotos",
  "hostResponsiveness",
  "valueForMoney",
] as const;

function assertScores(input: SubmitReviewInput): void {
  for (const key of SCORE_KEYS) {
    const v = input[key];
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new ReviewError("INVALID_SCORE");
  }
}

/** Fetch + guard a reviewable booking, or throw `ReviewError`. Shared by the gate and the writer. */
async function assertReviewable(client: Tx | typeof prisma, bookingId: string, userId: string, now: Date) {
  const booking = await client.booking.findUnique({
    where: { id: bookingId },
    select: {
      status: true,
      userId: true,
      checkOut: true,
      code: true,
      listingId: true,
      listing: { select: { title: true, hostId: true } },
      review: { select: { id: true } },
    },
  });
  if (!booking) throw new ReviewError("NOT_FOUND");
  if (booking.userId !== userId) throw new ReviewError("NOT_GUEST");
  if (booking.status !== BookingStatus.COMPLETED) throw new ReviewError("NOT_COMPLETED");
  if (now.getTime() > booking.checkOut.getTime() + REVIEW_WINDOW_DAYS * MS_PER_DAY) {
    throw new ReviewError("WINDOW_CLOSED");
  }
  if (booking.review) throw new ReviewError("ALREADY_REVIEWED");
  return booking;
}

export type ReviewEligibility = { ok: true } | { ok: false; reason: ReviewErrorReason };

/** Read-only eligibility check for the trips UI (whether to show the review form). */
export async function canReview(bookingId: string, userId: string, now: Date): Promise<ReviewEligibility> {
  try {
    await assertReviewable(prisma, bookingId, userId, now);
    return { ok: true };
  } catch (e) {
    if (e instanceof ReviewError) return { ok: false, reason: e.reason };
    throw e;
  }
}

/** Recompute + persist a listing's denormalized aggregate over its non-removed reviews. */
async function recomputeAggregate(tx: Tx, listingId: string): Promise<void> {
  const agg = await tx.review.aggregate({
    where: { removedAt: null, booking: { listingId } },
    _avg: { overall: true },
    _count: true,
  });
  await tx.listing.update({
    where: { id: listingId },
    data: { avgRating: agg._avg.overall, reviewCount: agg._count },
  });
}

/** Publish a guest review: gated create + aggregate recompute in one tx, then notify the host. */
export async function submitReview(input: SubmitReviewInput, now: Date): Promise<void> {
  assertScores(input);

  const { hostId, listingTitle, code } = await prisma.$transaction(async (tx) => {
    const booking = await assertReviewable(tx, input.bookingId, input.authorId, now);
    await tx.review.create({
      data: {
        bookingId: input.bookingId,
        authorId: input.authorId,
        overall: input.overall,
        cleanliness: input.cleanliness,
        accuracyToPhotos: input.accuracyToPhotos,
        hostResponsiveness: input.hostResponsiveness,
        valueForMoney: input.valueForMoney,
        text: input.text?.trim() || null,
        photoKeys: input.photoKeys ?? [],
      },
    });
    await recomputeAggregate(tx, booking.listingId);
    return { hostId: booking.listing.hostId, listingTitle: booking.listing.title, code: booking.code };
  });

  await notify(hostId, "REVIEW_RECEIVED_HOST", { listingTitle, code });
}

/** Admin soft-removal (§5.5): hide the review, recompute the aggregate, audit. */
export async function removeReview(admin: AdminPrincipal, reviewId: string, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const review = await tx.review.findUnique({
      where: { id: reviewId },
      select: { id: true, removedAt: true, booking: { select: { listingId: true } } },
    });
    if (!review || review.removedAt) throw new ReviewError("NOT_FOUND");

    await tx.review.update({
      where: { id: reviewId },
      data: { removedByAdminId: admin.id, removedAt: new Date(), removedReason: reason },
    });
    await recomputeAggregate(tx, review.booking.listingId);
    await tx.auditLog.create({
      data: {
        adminId: admin.id,
        action: "REVIEW_REMOVED",
        targetType: "Review",
        targetId: reviewId,
        after: { reason },
      },
    });
  });
}

export interface ReviewCard {
  id: string;
  authorName: string;
  authorImage: string | null;
  overall: number;
  cleanliness: number;
  accuracyToPhotos: number;
  hostResponsiveness: number;
  valueForMoney: number;
  text: string | null;
  photoUrls: string[];
  createdAt: Date;
  /** Every review here is from a real completed booking — ผู้เข้าพักจริง ✓. */
  verified: boolean;
}

export interface ListingReviewSummary {
  avgRating: number | null;
  reviewCount: number;
  subScores: {
    cleanliness: number;
    accuracyToPhotos: number;
    hostResponsiveness: number;
    valueForMoney: number;
  } | null;
}

/** Published (non-removed) reviews for a listing + the summary bars (§3.1 verified-only). */
export async function loadListingReviews(
  listingId: string,
): Promise<{ reviews: ReviewCard[]; summary: ListingReviewSummary }> {
  const rows = await prisma.review.findMany({
    where: { removedAt: null, booking: { listingId } },
    select: {
      id: true,
      overall: true,
      cleanliness: true,
      accuracyToPhotos: true,
      hostResponsiveness: true,
      valueForMoney: true,
      text: true,
      photoKeys: true,
      createdAt: true,
      author: { select: { displayName: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const reviews: ReviewCard[] = rows.map((r) => ({
    id: r.id,
    authorName: r.author.displayName,
    authorImage: r.author.image,
    overall: r.overall,
    cleanliness: r.cleanliness,
    accuracyToPhotos: r.accuracyToPhotos,
    hostResponsiveness: r.hostResponsiveness,
    valueForMoney: r.valueForMoney,
    text: r.text,
    photoUrls: r.photoKeys.map(publicUrl),
    createdAt: r.createdAt,
    verified: true,
  }));

  const n = reviews.length;
  const avg = (sel: (r: ReviewCard) => number) => reviews.reduce((s, r) => s + sel(r), 0) / n;
  const summary: ListingReviewSummary =
    n === 0
      ? { avgRating: null, reviewCount: 0, subScores: null }
      : {
          avgRating: avg((r) => r.overall),
          reviewCount: n,
          subScores: {
            cleanliness: avg((r) => r.cleanliness),
            accuracyToPhotos: avg((r) => r.accuracyToPhotos),
            hostResponsiveness: avg((r) => r.hostResponsiveness),
            valueForMoney: avg((r) => r.valueForMoney),
          },
        };

  return { reviews, summary };
}
