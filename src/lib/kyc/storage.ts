/**
 * KYC document storage (issue #11, ADR-007/010). KYC documents live in the
 * PRIVATE R2 bucket and are served ONLY via short-lived signed URLs to admin —
 * never public, never logged (CLAUDE.md rule 9). The upload UI is wizard step ⑥
 * (#13) and the admin viewer is #14; these are the storage helpers they call.
 */

import { presignGet, presignPut } from "@/lib/storage/r2";

export const ACCEPTED_KYC_TYPES = ["image/jpeg", "image/png", "application/pdf"];
export const MAX_KYC_BYTES = 10 * 1024 * 1024; // 10 MB

export interface KycUpload {
  /** PRIVATE-bucket object key persisted to `KycDocument.r2Key`. */
  r2Key: string;
  /** Presigned PUT URL the browser uploads the bytes to (matching Content-Type). */
  uploadUrl: string;
}

/**
 * Validate a KYC document and presign its upload to the PRIVATE bucket. Throws on
 * a disallowed type or out-of-range size before signing. Key is `kyc/{submissionId}/{uuid}`.
 */
export async function presignKycUpload(args: {
  submissionId: string;
  contentType: string;
  byteLength: number;
}): Promise<KycUpload> {
  const { submissionId, contentType, byteLength } = args;

  if (!ACCEPTED_KYC_TYPES.includes(contentType)) {
    throw new Error(`Unsupported KYC document type: ${contentType}`);
  }
  if (byteLength <= 0 || byteLength > MAX_KYC_BYTES) {
    throw new Error(`KYC document size out of range: ${byteLength} bytes`);
  }

  const r2Key = `kyc/${submissionId}/${crypto.randomUUID()}`;
  const uploadUrl = await presignPut({
    bucket: "private",
    key: r2Key,
    contentType,
    contentLength: byteLength,
  });
  return { r2Key, uploadUrl };
}

/** Short-lived signed GET so an admin can view a KYC document (default 5 min). */
export function kycDocumentSignedUrl(
  r2Key: string,
  expiresIn = 300,
): Promise<string> {
  return presignGet({ key: r2Key, expiresIn });
}
