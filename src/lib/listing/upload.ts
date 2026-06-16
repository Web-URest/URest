/**
 * Listing photo upload (issue #11). Validates a photo and mints a presigned PUT
 * to the PUBLIC R2 bucket (CDN-served); the browser uploads the bytes directly.
 * Step ② of the wizard (PRODUCT_FLOWS §4.1) persists the returned `r2Key` to a
 * `ListingPhoto` row and renders the photo via `photoUrl`.
 *
 * KYC documents do NOT go here — they use the PRIVATE bucket (`src/lib/kyc/storage.ts`).
 */

import { presignPut, publicUrl } from "@/lib/storage/r2";

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface PhotoUpload {
  /** PUBLIC-bucket object key persisted to `ListingPhoto.r2Key`. */
  r2Key: string;
  /** Presigned PUT URL the browser uploads the bytes to (matching Content-Type). */
  uploadUrl: string;
}

/**
 * Validate a listing photo and presign its upload. Throws on a disallowed type
 * or out-of-range size BEFORE signing. The key is `listings/{listingId}/{uuid}.{ext}`
 * — a random uuid, no original filename (no PII / no collisions).
 */
export async function presignPhotoUpload(args: {
  listingId: string;
  fileName: string;
  byteLength: number;
  contentType: string;
}): Promise<PhotoUpload> {
  const { listingId, byteLength, contentType } = args;

  if (!ACCEPTED_PHOTO_TYPES.includes(contentType)) {
    throw new Error(`Unsupported photo type: ${contentType}`);
  }
  if (byteLength <= 0 || byteLength > MAX_PHOTO_BYTES) {
    throw new Error(`Photo size out of range: ${byteLength} bytes`);
  }

  const ext = EXT_BY_TYPE[contentType] ?? "bin";
  const r2Key = `listings/${listingId}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await presignPut({
    bucket: "public",
    key: r2Key,
    contentType,
    contentLength: byteLength,
  });
  return { r2Key, uploadUrl };
}

/** Public CDN URL for a stored listing photo. */
export function photoUrl(r2Key: string): string {
  return publicUrl(r2Key);
}
