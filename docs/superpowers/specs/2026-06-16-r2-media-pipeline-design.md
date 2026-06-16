# Design — R2 media pipeline (`src/lib/storage`) · issue #11

**Date:** 2026-06-16 · **Milestone:** M2 Listings · **Lane:** `area:infra` (`hitl`)
**Sources of truth:** ADR-002 (R2: separate public+private buckets), ADR-007/ADR-010 (KYC private bucket, presigned-only, never logged, 90-day purge), CLAUDE.md rules 4 (env) & 9 (KYC/secrets never public/logged). Blocked by #9 (done).

## Context
Cloudflare R2 wiring: listing photos go to a **public** bucket (CDN-served); KYC documents go to a **private** bucket readable only via short-lived signed URLs for admin. Uploads are **presigned PUT** with size/type validation. #49 left a dev stub (`src/lib/listing/upload.ts`, `storePhoto` — metadata-only, throws in prod, `uploadStubNote` = "real R2 upload wires in later (#11)"); this issue replaces it with the real pipeline. R2 credentials are configured by a human (hitl).

## Scope
**In:** the generic R2 client lib; replacing the photo stub so listing photos upload for real and render via CDN (acceptance #1); the KYC private-bucket presign + admin short-lived signed-read helpers (acceptance #2–4, verified via unit tests + manual R2 check); env vars; a `deleteObject` helper for the future purge cron.

**Out (other lanes):** the KYC upload UI / wizard step ⑥ (#13), the admin KYC viewer that calls the signed-read (#14), the 90-day purge cron itself (#35 — we ship `deleteObject`, the cron calls it). Image resizing/optimization (YAGNI for pilot).

## Architecture
- **SDK:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2 is S3-compatible). Pure JS, no native binding → traces into the Railway standalone bundle. Presigning is **offline local SigV4** (no network) → fully unit-testable with dummy creds. Server-only modules (never imported into the client bundle).
- Endpoint `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `"auto"`, path-style as R2 requires. One shared S3 client built lazily from `env`.

## Module layout (clear boundaries)
- `src/lib/storage/r2.ts` — generic client:
  - `presignPut({ bucket, key, contentType, contentLength, expiresIn? }): Promise<string>` — signs `ContentType` **and** `ContentLength` so R2 rejects a type/size swap at upload.
  - `presignGet({ key, expiresIn }): Promise<string>` — private bucket only; short-lived read.
  - `publicUrl(key): string` — `${R2_PUBLIC_BASE_URL}/${key}` (CDN render; no signing).
  - `deleteObject({ bucket, key }): Promise<void>` — for the purge cron (#35).
  - `bucket: "public" | "private"` selects the bucket name from env. **Never logs keys, URLs, or object bytes** (rule 9, ADR-010 §7).
- `src/lib/listing/upload.ts` — replaces the stub. Keeps `ACCEPTED_PHOTO_TYPES` (`image/jpeg|png|webp`) + `MAX_PHOTO_BYTES` (10 MB). Exports:
  - `presignPhotoUpload({ listingId, fileName, byteLength, contentType }): Promise<{ r2Key, uploadUrl }>` — validates type+size, key `listings/{listingId}/{uuid}.{ext}` (uuid, no PII), public bucket.
  - `photoUrl(r2Key): string` = `publicUrl(r2Key)`.
- `src/lib/kyc/storage.ts` — `presignKycUpload({ submissionId, contentType, byteLength }): Promise<{ r2Key, uploadUrl }>` (private bucket, key `kyc/{submissionId}/{uuid}`, allowlist `image/jpeg|png` + `application/pdf`, 10 MB) and `kycDocumentSignedUrl(r2Key, expiresIn=300): Promise<string>` (admin GET). *(Helpers only — #13 builds the upload UI, #14 the viewer.)*

## Photo flow change (minimal wizard churn)
`addPhotoAction(listingId, {fileName, byteLength, contentType})` now: validate → `presignPhotoUpload` → create the `ListingPhoto` row (key, sortOrder, isCover) → return `{ photo, uploadUrl }`. `Step2Photos` then `PUT`s the file bytes to `uploadUrl` with the matching `Content-Type`. Photos render via `photoUrl(r2Key)` computed **server-side** (`page.tsx` + the action add a `url` field to `WizardPhoto`) so the CDN base never enters the client bundle. A failed client PUT uses the existing remove-photo path to clear the orphan row (acceptable at pilot scale).

## Environment (hitl — Cloudflare + Railway)
Added to `env.ts` (zod) + `.env.example` in lockstep: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL`. All required at boot (the `instrumentation.ts` gate from #9 fails the deploy if missing). Human steps (in the runbook): create the two buckets, attach a CDN/custom domain to the public bucket only, mint a scoped R2 API token, set the vars in Railway.

## Error handling & logging
Validation throws on bad type/size **before** any signing. Presign/network failures surface as generic action errors (`ActionResult` error keys). **Never** log `r2Key`, signed URLs, or object bytes — anywhere, including catch blocks (rule 9). KYC objects never touch the public bucket or a non-signed URL.

## Testing
- **Offline unit tests** (no network — presigning is local): `presignPut`/`presignGet` URLs contain the correct bucket host, key, `X-Amz-Expires`, and signed `content-type`; private GET TTL is honored in the query; `presignPhotoUpload`/`presignKycUpload` reject disallowed types and oversize; `publicUrl` format; key generators namespace correctly and carry no PII. Build the S3 client from dummy env in the test.
- **Manual R2 verification (hitl, in the runbook)** for the acceptance criteria: (1) photo PUT → public bucket → renders via CDN URL; (2) KYC PUT → private bucket, direct URL 403/blocked; (3) signed GET works and a stale/expired URL fails; (4) grep logs/Sentry for any key/URL leakage.

## File-change summary
New: `src/lib/storage/r2.ts`, `src/lib/kyc/storage.ts`, tests. Modified: `src/lib/listing/upload.ts` (stub → real), `src/app/[locale]/(protected)/(host)/listings/new/actions.ts` + `Step2Photos.tsx` + `page.tsx` (presigned PUT flow + `url`), `src/lib/env.ts` + `.env.example` (R2 vars), `package.json`/lockfile (SDK), `docs/ops/deploy.md` (R2 setup + manual-verification steps). No schema change (`ListingPhoto.r2Key`/`KycDocument.r2Key` already exist).
