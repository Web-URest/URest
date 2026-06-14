# ADR-005: LINE push for time-critical events, email mirror for everything

**Status:** Accepted · 2026-06-12

## Context

Thai hosts and guests live in LINE; the notification matrix (PRODUCT_FLOWS §6) is LINE-primary by design. But LINE Official Account **push** messages are quota-limited on the free plan (a few hundred/month in Thailand; pricing tiers change — verify current quota in Phase 1), while **reply** messages (responding within the window after a user messages us) are free. Email is effectively free at our scale (Resend free tier: 3,000/month). Budget: ฿1,000/month total.

## Decision

1. **Email mirrors every notification** (Resend) — the always-delivered channel of record. Booking codes, payout slips, dispute outcomes all exist in email regardless of LINE quota.
2. **LINE push is reserved for time-critical, high-value events**, in priority order: new booking request to host (+2h reminder), payment received, payment window opened to guest, T-1 check-in reminder, dispute opened/resolved, payout sent, listing approval result. Marketing/low-urgency content never uses push quota.
3. **A `NotificationLog` table** records every send (channel, template, target, status) — enables the retry sweep (ADR-004), quota monitoring, and the SLA alarms in §6.
4. If monthly LINE quota is threatened: drop the lowest-priority push first (rule lives in one config array), never silently fail the high-priority ones.
5. We have the user's LINE userId only when they **logged in with LINE** or later **connected LINE** to their account (ADR-007 offers email/Google/Facebook/LINE). Those users get push (the OA add-friend prompt still appears in onboarding because push requires friendship); **users without a linked LINE get email-only** until they connect it, and account/notification settings surface a "เชื่อมต่อ LINE เพื่อรับการแจ้งเตือน" action.

## Consequences

- ✅ Fits free tiers at pilot scale (~30 bookings/month ≈ 200–250 pushes); paid LINE plan becomes a *good* problem (it scales with bookings ≈ revenue).
- ✅ Channel of record (email) decoupled from channel of attention (LINE).
- ⚠️ Since LINE login is no longer universal (ADR-007), LINE push reach depends on how many users connect LINE — email covers everyone, so the attention channel varies but no notification is ever lost.
- ⚠️ Quota numbers must be re-verified during Phase 1 — LINE Thailand changes plans frequently; the architecture (priority list + log) is designed so only a config value changes.
