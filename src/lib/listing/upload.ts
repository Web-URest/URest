/**
 * Listing photo upload — thin interface over the storage backend.
 *
 * Step ② of the wizard (PRODUCT_FLOWS §4.1) needs photos in the PUBLIC bucket,
 * CDN-served. The real Cloudflare R2 presigned-PUT pipeline is issue #11 (ADR-002/
 * 007), still pending R2 credentials. Until it lands, this is a dev STUB so the
 * wizard's min-5 / cover-select logic can be built and reviewed end-to-end.
 *
 * TODO(#11): replace `storePhoto` with a real R2 presigned PUT + size/type
 * validation; KYC docs go to the PRIVATE bucket (never here).
 */

import { env } from "@/lib/env";

export interface StoredPhoto {
  /** PUBLIC-bucket object key persisted to `ListingPhoto.r2Key`. */
  r2Key: string;
}

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Persist one uploaded photo and return its public-bucket key. The stub derives
 * a deterministic-looking key from the listing id + original name; it does NOT
 * touch any network. Callers write the returned `r2Key` to a `ListingPhoto` row.
 */
export async function storePhoto(args: {
  listingId: string;
  fileName: string;
  byteLength: number;
  contentType: string;
}): Promise<StoredPhoto> {
  const { listingId, fileName, byteLength, contentType } = args;

  if (!ACCEPTED_PHOTO_TYPES.includes(contentType)) {
    throw new Error(`Unsupported photo type: ${contentType}`);
  }
  if (byteLength <= 0 || byteLength > MAX_PHOTO_BYTES) {
    throw new Error(`Photo size out of range: ${byteLength} bytes`);
  }

  // Until #11, only the stub path is wired. Guard so this never silently
  // "succeeds" against a real bucket in production.
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Listing photo upload not configured (#11 R2 pipeline pending)",
    );
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return { r2Key: `dev/listings/${listingId}/${safeName}` };
}
