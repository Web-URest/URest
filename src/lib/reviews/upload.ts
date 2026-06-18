/**
 * Review photo upload (#28). Reviews are public, so photos go to the PUBLIC R2
 * bucket (like listing photos), keyed under the booking — `reviews/{bookingId}/
 * {uuid}.{ext}` — which is known before the review row exists (1:1 with it) and
 * lets us gate on review eligibility before minting any presigned URL.
 */
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/listing/upload";
import { presignPut } from "@/lib/storage/r2";

import { canReview } from "./reviews";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ReviewPhotoUpload {
  r2Key: string;
  uploadUrl: string;
}

/**
 * Validate + presign a review photo upload, gated on the user being able to
 * review this booking (so presigned PUTs can't be minted for arbitrary keys).
 */
export async function presignReviewPhotoUpload(
  args: { bookingId: string; byteLength: number; contentType: string },
  userId: string,
  now: Date,
): Promise<ReviewPhotoUpload> {
  const eligible = await canReview(args.bookingId, userId, now);
  if (!eligible.ok) throw new Error(`Not allowed to upload review photos: ${eligible.reason}`);

  if (!ACCEPTED_PHOTO_TYPES.includes(args.contentType)) {
    throw new Error(`Unsupported photo type: ${args.contentType}`);
  }
  if (args.byteLength <= 0 || args.byteLength > MAX_PHOTO_BYTES) {
    throw new Error(`Photo size out of range: ${args.byteLength} bytes`);
  }

  const ext = EXT_BY_TYPE[args.contentType] ?? "bin";
  const r2Key = `reviews/${args.bookingId}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await presignPut({
    bucket: "public",
    key: r2Key,
    contentType: args.contentType,
    contentLength: args.byteLength,
  });
  return { r2Key, uploadUrl };
}
