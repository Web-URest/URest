# ADR-010: User data protection — what we store, what we encrypt, what we refuse to hold

**Status:** Accepted · 2026-06-12 (grill session #6 — first Phase 1 code session)
**Implements:** the schema-level half of ADR-007's perimeter rules (private R2 for KYC files, PDPA basics)

## Context

The identity slice of the schema holds the most damaging data in the product: pointers to Thai ID documents and selfies, host bank accounts, phone numbers. The team is 2 students on Railway's shared infrastructure — the realistic threat model is a leaked `DATABASE_URL`, an accidental log line, or a stolen DB snapshot, not nation-state attackers. Every decision below optimizes for "a database dump alone must not be a catastrophe." Guiding principle: **the most secure field is the one never stored.**

## Decision

1. **Never-store list.** The **Thai national ID number is never stored, in any form** — no column, no encrypted blob, no last-4. Admin verifies identity visually from the R2 document image (name-match: ID ↔ bank account ↔ selfie, PRODUCT_FLOWS §5.1). No v1 feature reads the number; if v2 adds vendor OCR verification, the vendor processes it transiently then. Also never stored: card data (Opn-hosted fields — never touches our servers), plaintext OTP codes (sha256 + per-row salt via `hashOtp`), KYC file bytes (R2 object keys only).

2. **Field-level AES-256-GCM** (`src/lib/crypto.ts`, key in `DATA_ENCRYPTION_KEY`, 32-byte base64, unique per environment): exactly two columns — `PayoutAccount.accountNumberEnc` and `User.totpSecretEnc` (the role=ADMIN row's TOTP; was `AdminUser.totpSecretEnc` — see Amendment 2026-06-22). Ciphertext format `v1.<keyId>.<iv>.<ct>.<tag>` names its key, so rotation = add key v2, re-encrypt lazily on read. Bank numbers decrypt in **exactly one code path**: the admin payout view (§5.2). Expanding the encrypted-fields list requires updating this ADR.
   - Explicitly NOT encrypted: phone, email, display name — operationally queried (login, notifications, support), lower blast radius; encrypting them buys complexity, not safety, while access control and the never-store list do the heavy lifting.
   - **Passwords are argon2id hashes, never reversible** (`AdminUser.passwordHash` and the consumer `User.passwordHash` for email+password login, ADR-007) — one-way hashes are deliberately **outside** the field-encrypted list.
   - **Key loss = data loss.** The production key is backed up in the founders' password manager; it is not in git, not in logs, not in Railway build args (runtime env only).

3. **`AdminUser` is a separate table from `User`** — separate credentials (argon2id + TOTP), separate login surface, no self-signup, no relation to the consumer auth path. An authz bug in guest/host code structurally cannot grant admin powers.

   > _Superseded 2026-06-22:_ `AdminUser` was merged into `User` as `role = ADMIN`. The structural guarantee (no admin row reachable from consumer code) is replaced by a defense-in-depth boundary — separate admin auth path + a credentials CHECK + manual-only promotion. See the **Amendment 2026-06-22** below.

4. **Auth.js database sessions** (Prisma adapter) — revocable. Suspending or banning a user (§5.4) deletes their sessions and takes effect immediately; JWTs would let a banned fraudster keep working until token expiry.

   > _Amended 2026-06-16:_ #4 governs the **consumer** Auth.js path. The **admin** surface (ADR-010 #3) deliberately uses a **stateless 8h HMAC session token** (`src/lib/admin/session.ts`), not a DB session. Immediate revocation is still guaranteed by a different mechanism — `requireAdmin` re-reads the `AdminUser` row every request and rejects `disabledAt`, so disabling an admin takes effect immediately; the signed expiry bounds a stolen token. The one property not provided — revoking a single issued token without disabling the account (per-device logout) — is deferred (needs a session table) and accepted at pilot scale given the small admin roster.

5. **PDPA mechanics in the schema:** PII columns on `User` are nullable so anonymization can scrub them while the row survives for ledger integrity (soft delete per §3.7: `deletedAt`, `anonymizedAt`). `Consent` records type + policy version + timestamp, append-only — provable consent can't be backfilled. `AuditLog` records every admin action (who/what/when/before-after), append-only; KYC review, payout marking, holds, and suspensions write to it in the same transaction as the action itself.

6. **Retention/purge windows** (enforced by the cron sweep, ADR-004 pattern) — note the last row is a KEEP obligation, not a purge:

   | Data | Window | Mechanism |
   |---|---|---|
   | KYC documents of rejected/withdrawn submissions | 90 days | `KycDocument.purgeAfter` → cron deletes R2 object + row |
   | OTP rows (expired or consumed) | next sweep | `expiresAt` index |
   | Concierge transcripts | 12 months | Phase 4 (AI_CONCIERGE_SPEC §5) |
   | In-app booking messages (`Message` rows) | 12 months | Phase 3; cron sweep on `Message.createdAt` (aligns PRD §5 "messages retained 12 months") |
   | Sessions | Auth.js expiry | adapter-managed |
   | **Access/traffic logs — retain ≥90 days MINIMUM** | Computer Crime Act B.E. 2560 §26 (service-provider obligation) | Railway log retention + request logging config (Phase 1 ops) |

7. **Logging hygiene:** no PII, plaintext secrets, or `*Enc` values in logs — ever. Prisma query logging stays off in production; error reporting (Sentry) gets scrubbed contexts. `encryptField`/`decryptField` inputs and outputs are never logged, including in catch blocks.

8. **Thai-law mapping (reviewed 2026-06-12; lawyer agenda items at incorporation):**
   - **Religion on Thai ID cards is PDPA §26 sensitive data.** The KYC upload UI instructs hosts to cover/redact the ศาสนา line before uploading (PRODUCT_FLOWS §4.1 ⑥); KYC consent is recorded explicitly (`Consent` type `KYC_PROCESSING`). We never intentionally collect §26 categories.
   - **Selfies remain ordinary (non-biometric) personal data only while review is HUMAN.** The v2 parking-lot item "automated ID verification (vendor OCR + face match)" would make this biometric processing under PDPA — explicit biometric consent + a new ADR are prerequisites for that upgrade.
   - **Cross-border transfers (§28):** Railway (Singapore), Cloudflare R2, Anthropic (US), Resend, Google, Meta (Facebook Login) — personal data leaves Thailand. Privacy policy discloses all processors + transfer purposes; each processor's DPA accepted before launch (PRD §6 checklist).
   - **Breach response:** qualifying breaches notified to the PDPC (สคส.) **within 72 hours**, affected users when high-risk. One-page runbook required before launch (PRD §6).
   - **DPO not required at pilot scale** (no large-scale sensitive-data processing); revisit at the incorporation/scale triggers alongside a lightweight record of processing activities (RoPA).

## Consequences

- ✅ A leaked DB dump exposes no ID numbers (never stored), no usable bank accounts (encrypted), no OTPs (hashed), no documents (in R2 behind separate credentials) — the catastrophic-leak scenario degrades to a bad-but-survivable PII incident.
- ✅ Trust claims become auditable: consent records, immutable admin audit trail, documented retention windows — the things a future lawyer, accountant, or Opn compliance review asks for first.
- ⚠️ `lib/crypto.ts` reads `process.env` lazily — the one documented exception to CLAUDE.md rule 4 (key rotation + test injection); boot validation still lives in `env.ts`.
- ⚠️ Passwords use argon2id: `AdminUser.passwordHash` (column exists now) and a new consumer `User.passwordHash` added when email+password login is wired (Phase 1 auth, ADR-007). Both are one-way hashes — never in the field-encrypted list; the library is chosen when the first login surface is built.
- ⚠️ The 90-day purge cron must exist before the first real KYC rejection (Phase 2 listing work) — `purgeAfter` is set from day one so no backfill is needed.

## Amendment — 2026-06-22: AdminUser merged into User (role=ADMIN)

The separate `AdminUser` table (Decision #3) was merged into `User`, distinguished by a `role` enum (`GUEST` / `HOST` / `ADMIN`). This reverses the "separate table" decision but **preserves its security intent** through a different, defense-in-depth boundary:

- **The admin auth PATH stays fully separate** — a dedicated `/admin/login`, the separate `admin_session` HMAC cookie (`src/lib/admin/session.ts`, signed with `ADMIN_SESSION_SECRET`, never `AUTH_SECRET`), and password + TOTP. `requireAdmin`/`getAdmin` read ONLY the admin cookie, then load the `User` row and require `role = ADMIN`; they never call `auth()`. A consumer Auth.js session is therefore still useless on `/admin` by construction.
- **No app code writes `role = ADMIN`** — promotion stays manual/seed-only via `scripts/admin.ts` (confirmed with the product owner). Consumers self-promote only GUEST → HOST (a denormalized label, not a privilege).
- **New DB CHECK** `user_admin_requires_credentials` (DATA_MODEL.md constraint №5): every `role = ADMIN` row must carry `passwordHash` + `totpSecretEnc`, so a bare role-flip (e.g. a mass-assignment bug) yields a row that still cannot pass the password+TOTP login.
- **Encrypted-fields list (Decision #2) updated**: `AdminUser.totpSecretEnc` → `User.totpSecretEnc`; the admin `passwordHash` likewise moves to `User.passwordHash` (still one-way argon2id, still **outside** the encrypted list). Still exactly the same two encrypted columns — only the table changed.
- **`disabledAt` folded into the existing `User.suspendedAt`** — one off-switch per row; `getAdmin` rejects a suspended or no-longer-ADMIN row every request (revocation stays immediate, preserving the #4 amendment's guarantee).

**Gained:** one identity table, simpler auth code, a single suspend switch. **Lost:** the *structural* impossibility of an admin row existing in consumer-reachable code — mitigated (not fully replaced) by the separate auth path + the CHECK + manual-only promotion. Accepted at pilot scale by the product owner.
