# U-Rest — Product Requirements Document (v1)

**Date:** 2026-06-12 · **Status:** Draft for team review
**Companion documents:** `PRODUCT_FLOWS.md` (the functional contract — flows, state machines, screens), `DESIGN_SPEC.md` + `design/mockups/` (visual contract), `BUSINESS_PLAN.md` (market, money, legal), `docs/adr/` (architecture decisions)

---

## 1. Vision

**จองพูลวิลล่าโดยไม่ต้องเสี่ยงโดนโกง.** U-Rest is the trust layer for Thai pool-villa group trips: every villa is identity-verified, every baht sits in escrow until 24 hours after check-in, and every conversation stays on-platform until the booking is real. The enemy is the bank-transfer deposit scam in Facebook/LINE booking — not other companies.

**What U-Rest is NOT (v1):** not a channel manager, not a property-management system, not a tour operator, not Airbnb-for-everything. One property type (pool villas / private-pool stays), one market (Pattaya–Jomtien–Huay Yai), one country, one trust promise.

## 2. Users

| Persona | Who | Job-to-be-done | Today's alternative |
|---|---|---|---|
| **The organizer** (primary guest persona) | 22–35, organizes the group trip for 8–25 friends/family, collects money from everyone, terrified of losing it | Find an available villa that fits the group and budget, book it with confidence the money and the villa are real | FB groups + LINE chat + bank transfer + hope |
| **The owner-operator host** | Owns/manages 1–5 villas, takes bookings via FB page + LINE, suffers fake payment slips and no-shows | Fill the calendar with verified-paying guests without more admin work | FB page, LINE, agency brokers (10–20%) |
| **The admin** (internal, founding team) | Verifies humans, moves money, judges disputes | Keep the trust promise with minimal hours | — |

## 3. Goals & success metrics (pilot = first 6 months after launch)

**North-star metric: confirmed booked nights per month.**

| Goal | Metric | Pilot target |
|---|---|---|
| Supply exists | Live (approved) Pattaya-area villas | **15** by end of month 2 of recruiting |
| Demand converts | Confirmed bookings / month | **10/month** by month 3 post-launch |
| Trust promise kept | Payment incidents (lost/wrong/stuck money) | **0** — non-negotiable |
| Escrow works as designed | Payouts released within 48h of RELEASABLE | **100%** (SLA §6 of flows) |
| Marketplace is honest | Listing-approval median time | **≤ 24h** |
| Quality floor | Disputed bookings | **< 5%** of confirmed |
| Concierge is useful, not decorative | AI sessions ending in a booking-draft deep-link click | **≥ 15%** |
| The wedge resonates | % of guests arriving via anti-scam content (attribution survey at checkout) | tracked, no target — informs marketing |

**Explicit non-goals for the pilot:** GMV growth targets, multi-region coverage, host count beyond liquidity needs, revenue covering salaries. The pilot proves: *hosts will list, organizers will pay strangers through us, and nobody loses money.*

## 4. Scope

### 4.1 v1 functional scope — defined by `PRODUCT_FLOWS.md`

The functional contract is **`PRODUCT_FLOWS.md` in its entirety** (roles & verification ladder §1; booking/listing/money state machines §2; guest flows §3; host flows §4; admin flows §5; notification matrix §6). Summary of pillars, for orientation only:

1. **Search & listing detail** — region/dates/guests search, per-night price breakdown (holiday > season > base resolution), photos, amenities, house rules, reviews, ถูกต้องตามกฎหมาย badge where earned. **Saved villas**: login-gated ♡ on every card + dedicated `/saved` page, flat list (flows §3.1; collections/sharing/save-counts parked).
2. **Two booking modes** — ส่งคำขอก่อน (request → host accepts ≤12h → guest pays ≤12h) and ⚡ จองทันที (instant, 1h payment window, host opt-in with strike acknowledgment).
3. **Escrow payments** — 100% upfront via Opn (PromptPay-first, cards secondary), ledger states HELD → RELEASABLE → PAID with FROZEN/REVERSED branches, no deposits/partial payments ever, cash damage deposit stated on listing.
4. **In-app messaging per booking** — thread from REQUESTED, contact info auto-masked until CONFIRMED, admin-readable only during disputes.
5. **Host tools** — 6-step listing wizard with KYC, per-villa calendar with switcher, seasonal pricing, edit page with re-review rules, requests inbox, payout history.
6. **AI concierge น้องเรสต์** — search/availability/attractions/listing-details/draft tools + confirmation-gated `submit_booking_request`; full booking completes in chat with the payment QR rendered by the server (never the model); never-guess grounding with the host-FAQ growth loop; AI acts, human pays (ADR-006 v2, `docs/AI_CONCIERGE_SPEC.md`).
7. **Admin** — listing approval queue with itemized NEEDS_INFO, manual payout runs with reconciliation + holds, dispute resolution, reports queue, user management, immutable audit log.
8. **Notifications** — LINE push (time-critical) + email mirror (ADR-005).

### 4.2 Out of scope (v1) — parked in `PRODUCT_FLOWS.md` §7

Automated payouts via Opn Transfers API (first v2 item), iCal sync, co-host accounts, per-date price overrides, automated ID verification, partial payments, public review replies, risk scoring, analytics dashboards, any second region (until liquidity trigger — BUSINESS_PLAN.md §GTM).

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | Mobile-first on mid-range Android over 4G: LCP ≤ 2.5s on search & listing pages; villa photos via R2+CDN, responsive sizes. Most traffic arrives from LINE/FB in-app webviews — test there, not just Chrome. |
| **Reliability of money paths** | Opn webhooks idempotent (ADR-003); timers DB-backed and restart-safe (ADR-004); payment confirmation processed ≤ 60s of webhook receipt. Ledger invariant property-tested. |
| **Security** | KYC docs in private R2 bucket, signed URLs, 90-day deletion for rejected listings (ADR-007). Admin = separate credentials + TOTP. Every admin action audit-logged. No card data ever touches our servers (Opn-hosted fields/redirect). |
| **PDPA compliance** | Privacy policy + purpose-limited consent at signup and KYC upload; export/delete-on-request runbook; transcripts of AI chats and messages retained 12 months then purged. |
| **i18n** | Thai-first via next-intl, `en` secondary (ADR-008). Buddhist-era dates where conventional; Thai holiday calendar is a maintained data table. |
| **Accessibility** | Practical floor: semantic HTML, labels on all form fields, visible focus, ≥4.5:1 contrast on text (DESIGN_SPEC palette already passes), tap targets ≥44px. |
| **Observability** | Sentry (free tier) for errors; NotificationLog + WebhookEvent tables make the two failure-prone integrations inspectable without grep. |
| **Budget ceiling** | Infrastructure ≤ ฿1,000/month at pilot scale (see BUSINESS_PLAN.md cost table). Any service added to the stack needs a free tier or a line in that table. |

## 6. Launch gate (all must be true before first real booking)

**Legal/compliance** — details in BUSINESS_PLAN.md §6:
- [ ] Privacy Policy + Business Policy pages live (Opn approval prerequisite + PDPA) — privacy policy **discloses all processors and cross-border transfers** (Railway SG, Cloudflare, Anthropic US, Resend, Google; PDPA §28)
- [ ] Guest T&Cs + Host T&Cs published; host T&Cs include agent-of-payee clause, Hotel Act compliance warranty, strike/cancellation policy
- [ ] ETDA Digital Platform Services notification filed (small-platform tier)
- [ ] Opn live account approved; test charge + test refund executed end-to-end
- [ ] Income-record spreadsheet/runbook for the account-holding founder (pass-through vs commission separation)
- [ ] Processor DPAs accepted (Railway, Cloudflare, Anthropic, Resend, Google, Opn, LINE)
- [ ] Breach-response runbook written: PDPC (สคส.) notification ≤72h, user notification when high-risk (ADR-010 §8)
- [ ] Access-log retention ≥90 days configured (Computer Crime Act §26 — a KEEP obligation)

**Product** — verified against `PRODUCT_FLOWS.md`:
- [ ] Full happy path in production: signup → KYC → approval → listing live → request → accept → pay (PromptPay sandbox→live) → CONFIRMED → check-in +24h → payout run → PAID
- [ ] Full unhappy paths: host declines, request expires, payment window lapses, QR regenerates, guest cancels per policy tier, dispute freezes payout
- [ ] Ledger reconciliation screen matches Opn dashboard after the above
- [ ] LINE + email notifications fire for the §6 matrix
- [ ] Admin runbooks written: approval review, payout run, dispute handling, report triage

**Ops:**
- [ ] DB backup restore actually tested once
- [ ] 15 villas recruited ≥ 8 live at launch day (soft-launch threshold)

## 7. Risks (product-level; business risks in BUSINESS_PLAN.md §8)

| Risk | Mitigation |
|---|---|
| PromptPay webhook missed during 15-min QR window → guest paid, booking not confirmed | Always-on server (ADR-002), idempotent replay, admin manual-confirm fallback with Opn dashboard check; guest support LINE OA |
| Stale host calendars → instant-book double-bookings | Instant mode is opt-in with strike acknowledgment; strikes → suspension (already in flows §2.1) |
| Manual payout error (wrong account/amount) | Payout run UI groups by verified bank account (name-matched to ID at KYC); slip reference required to mark PAID; reconciliation blocks on mismatch |
| Admin capacity (4–5 students, 24h SLAs) | SLA alarms (§6); approval queue designed for ≤10-min reviews; pilot supply capped at one region |
| AI concierge wrong answers create disputes | Read-only tools, never-guess rule, "ไม่มีข้อมูล" + host-thread handoff (ADR-006) |

## 8. Open questions (tracked, not blocking)

1. Opn marketplace-transfer enablement on individual account — **spike before Phase 3** (ADR-001).
2. LINE OA push quota current pricing — verify in Phase 1 (ADR-005).
3. SMS OTP provider selection (฿/message) — Phase 1. (Day-one OTP itself re-confirmed 2026-06-12; only the provider choice remains open.)
4. Damage-deposit disputes happen off-platform (cash) — monitor whether this leaks trust damage back to U-Rest; revisit in v2 scope discussion.
