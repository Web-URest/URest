import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

/**
 * Cloudflare R2 storage client (ADR-002/010, issue #11). R2 is S3-compatible.
 * Two buckets: a PUBLIC bucket (listing photos, CDN-served) and a PRIVATE bucket
 * (KYC docs — readable only via short-lived signed URLs to admin, never public).
 *
 * Presigning is OFFLINE (local SigV4, no network), which keeps this unit-testable.
 * NEVER log object keys, signed URLs, or object bytes (CLAUDE.md rule 9, ADR-010 §7).
 */

export type R2Bucket = "public" | "private";

const DEFAULT_EXPIRES_S = 300; // 5 minutes — short-lived

let client: S3Client | undefined;
function r2(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

function bucketName(bucket: R2Bucket): string {
  return bucket === "public" ? env.R2_PUBLIC_BUCKET : env.R2_PRIVATE_BUCKET;
}

/**
 * Presigned PUT for a browser upload. Signs Content-Type AND Content-Length so
 * R2 rejects a type- or size-swap at upload time (the caller validates first).
 */
export function presignPut(args: {
  bucket: R2Bucket;
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}): Promise<string> {
  const {
    bucket,
    key,
    contentType,
    contentLength,
    expiresIn = DEFAULT_EXPIRES_S,
  } = args;
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: bucketName(bucket),
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    // Force content-type/length INTO the signature (the presigner signs only
    // `host` otherwise) so R2 rejects a type- or size-swap at upload.
    { expiresIn, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

/** Presigned GET on the PRIVATE bucket — a short-lived admin read (ADR-010). */
export function presignGet(args: {
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const { key, expiresIn = DEFAULT_EXPIRES_S } = args;
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucketName("private"), Key: key }),
    { expiresIn },
  );
}

/** Public CDN URL for a PUBLIC-bucket key (no signing — the bucket is CDN-served). */
export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL}/${key}`;
}

/** Delete an object (used by the KYC 90-day purge cron, #35). */
export async function deleteObject(args: {
  bucket: R2Bucket;
  key: string;
}): Promise<void> {
  await r2().send(
    new DeleteObjectCommand({ Bucket: bucketName(args.bucket), Key: args.key }),
  );
}
