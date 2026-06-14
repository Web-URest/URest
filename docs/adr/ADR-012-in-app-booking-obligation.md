# ADR-012: In-app booking is a host obligation (anti-disintermediation)

**Status:** Accepted · 2026-06-14
**Deciders:** Founding team (direction set by Aok)

## Context

Trust is the product, and U-Rest only earns (10% host-side commission on completed bookings, BUSINESS_PLAN §5) and only delivers its escrow/verification/review promise when a booking actually flows through the platform. The original stance (BUSINESS_PLAN §4, pre-2026-06-14) treated off-platform "leakage" as **accepted** — pre-payment poaching blocked by contact masking, but post-stay direct rebooking deemed unenforceable and not worth policing.

The founder is reversing that posture: booking through U-Rest is a **host obligation**, not a hope. This ADR records the decision so it can't be silently reverted, and is honest about where enforcement actually has teeth.

Two realities shape it:
- **The transaction must never move off-platform.** "โอนมาทางนี้เลย ถูกกว่า" (pay me directly, it's cheaper) is the exact scam vector — the booking + payment has to stay in-app.
- **A host with other sales channels can physically take a booking elsewhere.** We cannot technically prevent that; we can detect the *double-booking* it causes, penalize it, and make in-app booking the economically obvious choice.

## Decision

1. **In-app-only is written into the host T&Cs** (alongside the agent-of-payee and Hotel Act warranties, ADR-001 §2): the host warrants they will not take or fulfil bookings for their U-Rest-listed availability outside U-Rest. This is a launch-gate item (PRD §6).
2. **Enforcement is layered, and the limit is stated, not hidden:**
   - **Technical floor** — pre-CONFIRMED contact masking (PRODUCT_FLOWS §3.5): phone, LINE, URLs, bank numbers redacted until payment, so the booking cannot be transacted off-platform.
   - **Detect + punish** — an off-platform booking that double-books a paid U-Rest guest forces `CANCELLED_BY_HOST` + a `HostStrike` (`STALE_CALENDAR_DOUBLE_BOOKING`); 3 strikes = suspension (PRODUCT_FLOWS §2.1; DATA_MODEL `HostStrike`).
   - **Incentive (carrot)** — the host is paid, and gets escrow protection, verified reviews, and search ranking, *only* in-app; payout releases after checkout (ADR-001/003, PRODUCT_FLOWS §2.3).
3. **We do not surveil pure post-stay direct rebooking** (a guest quietly rebooking the same villa a year later off-platform). It is prohibited by the host agreement but technically undetectable; building tooling to chase it would poison host relations and isn't worth it. The policy prohibits it; the incentives discourage it; we make no claim to detect it.
4. **The calendar's ปิดเอง self-block stays**, scoped to *legitimate unavailability* — owner use, maintenance, commitments predating onboarding — kept current so a paid U-Rest guest is never double-booked. It is not a sanctioned "take your bookings elsewhere" affordance.

## Consequences

- ✅ The trust promise is end-to-end: no off-platform transaction can happen pre-payment, and the host's economics are aligned with keeping bookings in-app.
- ✅ Supersedes the BUSINESS_PLAN §4 "leakage accepted" stance with a clear, enforceable-where-it-counts policy. PRODUCT_FLOWS §3.5/§4.1/§4.2 and the host T&Cs all point here.
- ⚠️ Teeth are limited to detectable double-booking + incentives; for the undetectable tail the obligation is purely contractual. Host-recruiting and marketing must not over-promise detection we don't have.
- ⚠️ Strike/suspension *tooling* (`HostStrike`) is Phase 5 (trust); until then the obligation rests on the host T&Cs + the manual `CANCELLED_BY_HOST` path.
- ⚠️ The in-app-only clause must be in the **published host T&Cs before the first booking** (PRD §6 launch gate) — otherwise the obligation is undocumented and unenforceable.
