"use server";

import { requireUser } from "@/lib/auth/guards";
import { ReviewError, submitReview } from "@/lib/reviews/reviews";
import { presignReviewPhotoUpload } from "@/lib/reviews/upload";

/**
 * Guest review server actions (#28). Both re-guard with `requireUser`; the lib
 * enforces the COMPLETED + 14-day + author-is-guest + one-per-booking gate. Photo
 * presigning is gated the same way (no presigned PUTs for arbitrary keys).
 */

export type PresignResult = { ok: true; r2Key: string; uploadUrl: string } | { ok: false };

export async function presignReviewPhotoAction(
  bookingId: string,
  file: { byteLength: number; contentType: string },
): Promise<PresignResult> {
  const user = await requireUser();
  try {
    const { r2Key, uploadUrl } = await presignReviewPhotoUpload(
      { bookingId, byteLength: file.byteLength, contentType: file.contentType },
      user.id,
      new Date(),
    );
    return { ok: true, r2Key, uploadUrl };
  } catch {
    return { ok: false };
  }
}

export interface SubmitReviewArgs {
  bookingId: string;
  overall: number;
  cleanliness: number;
  accuracyToPhotos: number;
  hostResponsiveness: number;
  valueForMoney: number;
  text?: string;
  photoKeys?: string[];
}

export type SubmitResult = { ok: true } | { ok: false; reason: string };

export async function submitReviewAction(input: SubmitReviewArgs): Promise<SubmitResult> {
  const user = await requireUser();
  try {
    await submitReview({ ...input, authorId: user.id }, new Date());
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof ReviewError ? e.reason : "UNKNOWN" };
  }
}
