# ADR-001: Opn Payments as gateway, U-Rest as merchant of record

**Status:** Accepted · 2026-06-12
**Deciders:** Founding team (grill session 2026-06-12)

## Context

U-Rest's core promise is escrow: guest pays 100% at booking, U-Rest holds the money, host is paid ~24h after check-in. The gateway must therefore support (a) PromptPay + cards for Thai consumers, (b) holding funds between charge and payout, (c) paying out to third-party (host) bank accounts, and (d) onboarding **before** the company is registered — the team launches as an individual pilot (ADR-scope: see BUSINESS_PLAN.md §Legal) on a ฿1,000/month budget.

Stripe Thailand was evaluated and rejected: it supports individual accounts and PromptPay, but **Stripe Connect in Thailand allows direct charges only — no separate charges & transfers, no holding funds, no delayed payouts, no third-party transfers** ([Stripe TH marketplace support](https://support.stripe.com/questions/stripe-thailand-support-for-marketplaces)). The escrow flow is unimplementable on it.

Opn Payments (Omise) supports: individual merchant onboarding (Thai ID + bank account), PromptPay 1.65% / cards 3.65% (+7% VAT on fees), funds held in the Opn balance (7-day hold → transferable, withdrawn when *we* choose), and a [Recipients API](https://docs.opn.ooo/recipients-api) + [Transfers API](https://docs.opn.ooo/transfers-api) that can send a host's 90% programmatically.

## Decision

1. **Opn Payments is the only gateway.** No abstraction layer — YAGNI at this scale; Opn's charge/webhook/transfer shapes inform the booking state machine directly.
2. **U-Rest is merchant of record** on its own Opn account. Legally U-Rest collects **as the host's agent** (agent-of-payee clause in host T&Cs) — the standard OTA structure that keeps us outside Payment Systems Act licensing. Lawyer review required at incorporation trigger.
3. **Escrow = Opn balance + our Postgres ledger** (ADR-003), not a gateway feature. Funds stay in the Opn balance; payouts run after check-in +24h.
4. **Payouts:** v1 manual (admin transfers via bank app per PRODUCT_FLOWS §5.2). Automation via Recipients/Transfers API is the first v2 upgrade.
5. **Fees absorbed by U-Rest; PromptPay-first checkout** (QR default tab, card secondary). Listed price = price paid.

## Consequences

- ✅ Escrow + automated-payout path exists on one Thai-native provider; individual onboarding unblocks the pilot.
- ✅ Net take ~80% of commission on PromptPay bookings (฿1,205 on a ฿15k booking), ~59% on cards — steering matters.
- ⚠️ **Spike before Phase 3:** confirm with Opn support that third-party transfers (marketplace mode) can be enabled on an individual account. If gated behind company registration, fall back to manual payouts (already the v1 plan) and treat it as an incorporation trigger.
- ⚠️ Opn requires a published Business Policy and Privacy Policy page before live-mode approval — these pages are launch blockers, not nice-to-haves.
- ⚠️ PromptPay has no auth/capture — this is why booking is request-then-pay (PRODUCT_FLOWS §2.1), and that constraint is now load-bearing in two documents.
