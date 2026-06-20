# Launch-gate close-out (PRD §6)

Tracks every PRD §6 item to status + owner + evidence. This is the close-out for **#36** — the issue closes only when every row is ✅.

**Legend:** ✅ done · ✍️ DRAFT shipped, pending review/sign-off · ⏳ HUMAN-TODO (filing / live keys / config / real-world)

## Legal / compliance
| Item | Status | Owner | Evidence |
|---|---|---|---|
| Privacy Policy page live, discloses all processors + cross-border transfers (PDPA §28) | ✍️ | Aok + lawyer | `/privacy` (this PR) — DRAFT, needs legal sign-off |
| Business Policy page live (Opn prerequisite) | ✍️ | Aok + lawyer | `/business-policy` (this PR) — DRAFT |
| Guest T&Cs + Host T&Cs published (agent-of-payee, Hotel Act warranty, in-app-only ADR-012, strikes) | ✍️ | Aok + lawyer | `/terms` (this PR) — DRAFT |
| ETDA Digital Platform Services notification filed (small-platform tier) | ⏳ | Aok | gov filing — free, online |
| Opn live account approved; test charge + test refund end-to-end | ⏳ | Aok | live keys → Railway env; run a real ฿-charge + refund, reconcile vs Opn dashboard. Code is env-driven, no change needed |
| Income-record spreadsheet/runbook (pass-through vs commission) | ⏳ | Aok | — |
| Processor DPAs accepted (Railway, Cloudflare, Anthropic, Resend, Google, Meta, Opn, LINE) | ⏳ | Aok | accept each in the provider console |
| Breach-response runbook (PDPC ≤72h) | ✍️ | Aok + poom | `docs/ops/breach-response.md` (this PR) — needs 2-person review |
| Access-log retention ≥90 days (Computer Crime Act §26) | ⏳ | Aok | Railway log retention (paid plan) or ship to Axiom/Sentry sink — dashboard config |

## Product (verified against PRODUCT_FLOWS.md)
| Item | Status | Owner | Evidence |
|---|---|---|---|
| Full happy path in production (signup→KYC→approve→list→request→accept→pay→CONFIRMED→checkout→payout→PAID) | ✅ / ⏳ | — | E2E proves the path (#29, PR #71); a real prod run with live Opn still to do (⏳) |
| Full unhappy paths (decline, request expiry, payment lapse, QR regen, cancel tiers, dispute freeze) | ✅ | — | E2E specs (#29, PR #71) + disputes (#26, PR #79) |
| Ledger reconciliation screen matches Opn dashboard | ✅ | — | `/admin/payouts` reconcile (#25, PR #73) |
| LINE + email notifications fire for the §6 matrix | ✅ | — | `lib/notifications` (#64) + per-group prefs (#35, PR #80) |
| Admin runbooks: approval, payout, dispute, report | ✍️ | Aok + poom | `docs/ops/admin-{listing-approval,payout,dispute,reports}.md` (this PR) — needs 2-person review |

## Ops
| Item | Status | Owner | Evidence |
|---|---|---|---|
| DB backup restore tested once | ⏳ | Aok | Railway Postgres backup → restore drill |
| 15 villas recruited, ≥8 live at launch | ⏳ | team (GTM) | founder-led supply |

## Also shipped this PR (DESIGN_SPEC §9 B11)
| Item | Status | Evidence |
|---|---|---|
| Admin audit-log viewer (filter by admin/target) | ✅ | `/admin/audit-log` (this PR) |

---
**Remaining to close #36:** the ⏳ items (Aok/team) + sign-off on the ✍️ drafts (lawyer for legal copy; both teammates for the runbooks). The code + all draftable artifacts are in this PR.
