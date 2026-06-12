# ADR-010: User data protection — what we store, what we encrypt, what we refuse to hold

**Status:** Accepted · 2026-06-12 (grill session #6 — first Phase 1 code session)
**Implements:** the schema-level half of ADR-007's perimeter rules (private R2 for KYC files, PDPA basics)

## Context

The identity slice of the schema holds the most damaging data in the product: pointers to Thai ID documents and selfies, host bank accounts, phone numbers. The team is 2 students on Railway's shared infrastructure — the realistic threat model is a leaked `DATABASE_URL`, an accidental log line, or a stolen DB snapshot, not nation-state attackers. Every decision below optimizes for "a database dump alone must not be a catastrophe." Guiding principle: **the most secure field is the one never stored.**

## Decision

1. **Never-store list.** The **Thai national ID number is never stored, in any form** — no column, no encrypted blob, no last-4. Admin verifies identity visually from the R2 document image (name-match: ID ↔ bank account ↔ selfie, PRODUCT_FLOWS §5.1). No v1 feature reads the number; if v2 adds vendor OCR verification, the vendor processes it transiently then. Also never stored: card data (Opn-hosted fields — never touches our servers), plaintext OTP codes (sha256 + per-row salt via `hashOtp`), KYC file bytes (R2 object keys only).

2. **Field-level AES-256-GCM** (`src/lib/crypto.ts`, key in `DATA_ENCRYPTION_KEY`, 32-byte base64, unique per environment): exactly two columns — `PayoutAccount.accountNumberEnc` and `AdminUser.totpSecretEnc`. Ciphertext format `v1.<keyId>.<iv>.<ct>.<tag>` names its key, so rotation = add key v2, re-encrypt lazily on read. Bank numbers decrypt in **exactly one code path**: the admin payout view (§5.2). Expanding the encrypted-fields list requires updating this ADR.
   - Explicitly NOT encrypted: phone, email, display name — operationally queried (login, notifications, support), lower blast radius; encrypting them buys complexity, not safety, while access control and the never-store list do the heavy lifting.
   - **Key loss = data loss.** The production key is backed up in the founders' password manager; it is not in git, not in logs, not in Railway build args (runtime env only).

3. **`AdminUser` is a separate table from `User`** — separate credentials (argon2id + TOTP), separate login surface, no self-signup, no relation to the consumer auth path. An authz bug in guest/host code structurally cannot grant admin powers.

4. **Auth.js database sessions** (Prisma adapter) — revocable. Suspending or banning a user (§5.4) deletes their sessions and takes effect immediately; JWTs would let a banned fraudster keep working until token expiry.

5. **PDPA mechanics in the schema:** PII columns on `User` are nullable so anonymization can scrub them while the row survives for ledger integrity (soft delete per §3.7: `deletedAt`, `anonymizedAt`). `Consent` records type + policy version + timestamp, append-only — provable consent can't be backfilled. `AuditLog` records every admin action (who/what/when/before-after), append-only; KYC review, payout marking, holds, and suspensions write to it in the same transaction as the action itself.

6. **Retention/purge windows** (enforced by the cron sweep, ADR-004 pattern):

   | Data | Window | Mechanism |
   |---|---|---|
   | KYC documents of rejected/withdrawn submissions | 90 days | `KycDocument.purgeAfter` → cron deletes R2 object + row |
   | OTP rows (expired or consumed) | next sweep | `expiresAt` index |
   | Concierge transcripts | 12 months | Phase 4 (AI_CONCIERGE_SPEC §5) |
   | Sessions | Auth.js expiry | adapter-managed |

7. **Logging hygiene:** no PII, plaintext secrets, or `*Enc` values in logs — ever. Prisma query logging stays off in production; error reporting (Sentry) gets scrubbed contexts. `encryptField`/`decryptField` inputs and outputs are never logged, including in catch blocks.

## Consequences

- ✅ A leaked DB dump exposes no ID numbers (never stored), no usable bank accounts (encrypted), no OTPs (hashed), no documents (in R2 behind separate credentials) — the catastrophic-leak scenario degrades to a bad-but-survivable PII incident.
- ✅ Trust claims become auditable: consent records, immutable admin audit trail, documented retention windows — the things a future lawyer, accountant, or Opn compliance review asks for first.
- ⚠️ `lib/crypto.ts` reads `process.env` lazily — the one documented exception to CLAUDE.md rule 4 (key rotation + test injection); boot validation still lives in `env.ts`.
- ⚠️ Argon2 dependency deferred until the admin login surface is built (Phase 2) — `passwordHash` column exists now, the seed script chooses the library then.
- ⚠️ The 90-day purge cron must exist before the first real KYC rejection (Phase 2 listing work) — `purgeAfter` is set from day one so no backfill is needed.
