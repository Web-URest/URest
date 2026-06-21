# ADR-007: Multi-provider login (email/password + Google/Facebook/LINE) + phone-OTP verification ladder; KYC documents in private storage

**Status:** Accepted · 2026-06-10, refined 2026-06-12, amended 2026-06-14 (multi-provider login — reverses the original LINE-only stance)

## Context

One account serves guest+host modes (PRODUCT_FLOWS §1). Thai users have LINE, Google, and Facebook accounts plus a familiar email+password habit — offering all of them removes signup friction (the earlier LINE-only stance, now reversed, made a LINE account a hard dependency and cost conversions). The platform needs an anti-spam floor before booking actions, and host KYC (Thai ID + right-to-rent + selfie + bank account) is the trust core. KYC documents are PDPA "personal data" at the sensitive end — leak = brand death + legal exposure.

## Decision

1. **Multiple login options in v1**, all via NextAuth/Auth.js: **email + password**, **Google**, **Facebook**, and **LINE**. Rationale: maximize signup conversion — not every guest wants to sign in with LINE, and Google/Facebook/email are logins Thai users already have. OAuth providers (Google/Facebook/LINE) use the Auth.js `Account` table as-is (no schema change); email+password adds an argon2id `User.passwordHash` (ADR-010) with email verification via the existing `VerificationToken` table and a password-reset flow. **Accounts are linked by verified email**, so one human is one `User` across providers (Google + email+password on the same verified address resolve to a single account). LINE login still captures the LINE userId used for push notifications when LINE is the chosen (or later connected) provider (ADR-005).
2. **Verification ladder enforced server-side** (middleware on action endpoints, not UI hiding): signup → browse/save/AI-chat; **phone OTP** → can send requests & messages; **per-listing KYC review** → listing can go live. Two-tier vetting per the 2026-06-12 decision: identity/right-to-rent required, hotel-license/non-hotel registration optional → ถูกต้องตามกฎหมาย badge.
3. **KYC files**: uploaded directly to the **private** R2 bucket (presigned PUT), encrypted at rest, served to admin only via short-lived signed URLs, never cached, never in the public bucket (ADR-002). DB stores object keys + review status, never file bytes.
4. **Admin accounts are separate credentials** (created manually in DB, `/admin` surface, no self-signup, no LINE login) — admin compromise = money movement, so it doesn't share the consumer auth path. TOTP 2FA from day one.
5. **PDPA basics shipped with Phase 1**: privacy policy (also an Opn requirement), purpose-limited consent at KYC upload, data-retention rule (KYC docs of rejected/withdrawn listings deleted after 90 days), and a manual export/delete-on-request runbook.

## Consequences

- ✅ Ladder matches the product's trust narrative and is enforceable in one middleware.
- ✅ ID documents are isolated from the web-serving path by construction.
- ✅ Lower signup friction — users sign in with the identity they already trust (email, Google, Facebook, or LINE).
- ⚠️ **LINE userId is captured only when a user logs in with (or later connects) LINE.** Users who sign up with email/Google/Facebook get **email notifications by default** (the channel of record, ADR-005) and are offered an optional "เชื่อมต่อ LINE" account-link to enable LINE push — push reach depends on link rate, but no notification is ever lost.
- ⚠️ More surface to run: Google + Facebook OAuth apps to register and keep reviewed, more secrets to hold; email+password adds argon2id hashing (`User.passwordHash`, ADR-010), email verification, and a password-reset flow.
- ⚠️ **Apple Sign-In is intentionally excluded** (requires a paid Apple Developer account — outside the pilot's ฿1,000/month budget); revisit only if iOS demand proves it.
- ⚠️ Google and Meta (Facebook Login) become cross-border processors → privacy-policy disclosure + DPAs before launch (ADR-010 §8, PRD §6).
- ⚠️ Phone OTP needs an SMS provider (e.g. Thai SMS gateways ~฿0.3–0.5/msg) — tiny at pilot volume but it is the one per-user marginal cost; budget line exists in BUSINESS_PLAN.md.

## Amendment — 2026-06-21: Google is the active login provider (LINE disabled)

The first implemented provider is now **Google**, not LINE. The LINE provider is removed
from `src/lib/auth/auth.config.ts` and `LINE_CLIENT_ID/SECRET` are now optional in `env.ts`
— an implementation choice within the already-sanctioned multi-provider set (Decision 1),
not a new decision. Re-enabling LINE later is just restoring the provider + setting its env
vars. `User.lineUserId` stays nullable (Google users have it null); the optional
"เชื่อมต่อ LINE" account-link for push (Consequences above) is unaffected. Google is a
cross-border processor → the privacy-policy disclosure + DPA note (ADR-010 §8) already applies.
