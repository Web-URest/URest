# ADR-007: LINE Login + phone-OTP verification ladder; KYC documents in private storage

**Status:** Accepted · 2026-06-10, refined 2026-06-12

## Context

One account serves guest+host modes (PRODUCT_FLOWS §1). Thai users expect LINE Login; the platform needs an anti-spam floor before booking actions, and host KYC (Thai ID + right-to-rent + selfie + bank account) is the trust core. KYC documents are PDPA "personal data" at the sensitive end — leak = brand death + legal exposure.

## Decision

1. **LINE Login is the primary (and v1-only) social auth**, via NextAuth/Auth.js with the LINE provider. Email+password fallback deferred — every target user has LINE; one provider = less attack surface. The login also captures the LINE userId used for notifications (ADR-005).
2. **Verification ladder enforced server-side** (middleware on action endpoints, not UI hiding): signup → browse/save/AI-chat; **phone OTP** → can send requests & messages; **per-listing KYC review** → listing can go live. Two-tier vetting per the 2026-06-12 decision: identity/right-to-rent required, hotel-license/non-hotel registration optional → ถูกต้องตามกฎหมาย badge.
3. **KYC files**: uploaded directly to the **private** R2 bucket (presigned PUT), encrypted at rest, served to admin only via short-lived signed URLs, never cached, never in the public bucket (ADR-002). DB stores object keys + review status, never file bytes.
4. **Admin accounts are separate credentials** (created manually in DB, `/admin` surface, no self-signup, no LINE login) — admin compromise = money movement, so it doesn't share the consumer auth path. TOTP 2FA from day one.
5. **PDPA basics shipped with Phase 1**: privacy policy (also an Opn requirement), purpose-limited consent at KYC upload, data-retention rule (KYC docs of rejected/withdrawn listings deleted after 90 days), and a manual export/delete-on-request runbook.

## Consequences

- ✅ Ladder matches the product's trust narrative and is enforceable in one middleware.
- ✅ ID documents are isolated from the web-serving path by construction.
- ⚠️ LINE-only login makes a LINE account a hard dependency — acceptable for the Thai market, revisit for v2 (email fallback).
- ⚠️ Phone OTP needs an SMS provider (e.g. Thai SMS gateways ~฿0.3–0.5/msg) — tiny at pilot volume but it is the one per-user marginal cost; budget line exists in BUSINESS_PLAN.md.
