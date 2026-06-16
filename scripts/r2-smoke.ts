/**
 * R2 media pipeline smoke test (issue #11 acceptance). Verifies the REAL buckets
 * behave correctly. Run with prod creds injected by Railway (never pasted by hand):
 *
 *   railway run -- pnpm r2:smoke
 *
 * Checks:
 *   1. public object  → served 200 via the CDN (R2_PUBLIC_BASE_URL)
 *   2. private object → unsigned/direct access is rejected (401/403)
 *   3. private signed GET → 200, then 403 once its short TTL expires
 *
 * Creates throwaway `smoke/<uuid>` objects and deletes them. Exits non-zero on any
 * failure. Self-contained (no `@/` imports, reads process.env directly) so `tsx`
 * runs it without tsconfig-path resolution — mirrors scripts/admin.ts. Prints only
 * status codes / pass-fail, never keys, URLs, or credentials (CLAUDE.md rule 9).
 */
import { randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Run via: railway run -- pnpm r2:smoke (injects Railway env).`,
    );
  }
  return v;
}

const ACCOUNT = need("R2_ACCOUNT_ID");
const PUBLIC_BUCKET = need("R2_PUBLIC_BUCKET");
const PRIVATE_BUCKET = need("R2_PRIVATE_BUCKET");
const PUBLIC_BASE = need("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: string[] = [];
let failed = false;
function check(name: string, pass: boolean, detail = ""): void {
  results.push(`${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = true;
}

async function main(): Promise<void> {
  const id = randomUUID();
  const pubKey = `smoke/${id}.txt`;
  const privKey = `smoke/${id}.txt`;
  const body = `r2-smoke ${id}`;

  // 1. Public bucket: upload, then read via the CDN base URL.
  await s3.send(
    new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: pubKey,
      Body: body,
      ContentType: "text/plain",
    }),
  );
  await sleep(750); // brief CDN propagation
  const pub = await fetch(`${PUBLIC_BASE}/${pubKey}`);
  check("public object serves 200 via CDN", pub.status === 200, `status ${pub.status}`);

  // 2. Private bucket: upload, then prove an UNSIGNED direct request is rejected.
  await s3.send(
    new PutObjectCommand({
      Bucket: PRIVATE_BUCKET,
      Key: privKey,
      Body: body,
      ContentType: "text/plain",
    }),
  );
  const direct = await fetch(
    `https://${ACCOUNT}.r2.cloudflarestorage.com/${PRIVATE_BUCKET}/${privKey}`,
  );
  // Any 4xx = rejected (object not served). R2 returns 400 for an unsigned S3
  // request (no auth header to parse), AWS returns 403 — both mean "blocked".
  check(
    "private object blocks unsigned direct access",
    direct.status >= 400 && direct.status < 500,
    `status ${direct.status} (rejected, not served)`,
  );

  // 3a. A signed GET works.
  const signed = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: privKey }),
    { expiresIn: 30 },
  );
  const signedRes = await fetch(signed);
  check("private signed GET serves 200", signedRes.status === 200, `status ${signedRes.status}`);

  // 3b. A short-TTL signed GET fails once it lapses.
  const shortLived = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: PRIVATE_BUCKET, Key: privKey }),
    { expiresIn: 2 },
  );
  await sleep(3500);
  const expired = await fetch(shortLived);
  check("signed GET expires (403 after TTL)", expired.status === 403, `status ${expired.status}`);

  // Cleanup — remove both throwaway objects.
  await s3.send(new DeleteObjectCommand({ Bucket: PUBLIC_BUCKET, Key: pubKey }));
  await s3.send(new DeleteObjectCommand({ Bucket: PRIVATE_BUCKET, Key: privKey }));
}

main()
  .then(() => {
    console.log("\nR2 smoke results:\n" + results.join("\n"));
    console.log(failed ? "\n❌ R2 smoke FAILED" : "\n✅ R2 smoke PASSED");
    process.exit(failed ? 1 : 0);
  })
  .catch((e) => {
    console.error("R2 smoke error:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
