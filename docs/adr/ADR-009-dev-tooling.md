# ADR-009: Dev & UI tooling — pnpm, Tailwind v4, Google Maps, Vitest test stack

**Status:** Accepted · 2026-06-12 (session #5; supersedes the same-day Bun tooling note in ADR-002)

## Context

The stack review surfaced four undecided tooling items. One prior same-day decision is also reverted here: Bun was briefly adopted as package manager, then dropped after the team's own research — pnpm is the most battle-tested package manager for Next.js (Vercel's own choice), with no runtime-adjacent edge cases. Everything below is chosen for a 2-developer team shipping a money-handling app on free/cheap tiers.

## Decision

1. **Package manager: pnpm.** Runtime is Node LTS (unchanged, ADR-002). Gotcha recorded now: **pnpm v10 blocks dependency postinstall scripts by default** — Prisma's client codegen needs `"pnpm": { "onlyBuiltDependencies": ["@prisma/client", "prisma"] }` in `package.json` (or an explicit `pnpm approve-builds` step). Without it, `prisma generate` silently never runs on fresh installs.

2. **Styling: Tailwind CSS v4.** DESIGN_SPEC §3 design tokens (ink/aqua/sand/coral palette, radii, type scale) become `@theme` CSS variables — one source of truth shared by Tailwind utilities and any raw CSS. Chonburi/Anuphan load via `next/font` (self-hosted, no FOUT on Thai glyphs). The DESIGN_SPEC §6 component inventory builds as React components styled with Tailwind. (Visual reference superseded 2026-06-12: the standalone prototype `design/standalone/urest-standalone.html` — see DESIGN_SPEC §9; the original mockups were removed, recoverable from git history.)

3. **Maps: Google Maps JavaScript API.** Scope: search-page price-pin map and listing-page location map only, loaded on demand (the mobile map already sits behind a toggle per DESIGN_SPEC §5.2, so map loads ≪ page views). Free tier (10K dynamic map loads per SKU/month) covers pilot traffic. Hard rules: API key restricted by HTTP referrer to production + localhost; Google Cloud **budget cap at $0** so overage fails closed (map doesn't render) instead of billing a student card.

4. **Testing stack:**
   | Tool | Job |
   |---|---|
   | **Vitest** | Unit + integration tests — TS-native, fast, first-class Next.js support; also hosts the น้องเรสต์ eval harness (`pnpm eval:concierge`) |
   | **fast-check** | Property tests — mandated by ADR-003: generate random booking/payment/refund event sequences and assert the ledger invariant `sum(HELD + RELEASABLE + FROZEN) = received − refunded − paid out` after every sequence |
   | **Playwright** | E2E, deliberately reserved for **money paths only**: request → accept → pay (Opn sandbox) → CONFIRMED → payout RELEASABLE, plus the unhappy timers (request expiry, payment-window lapse, QR regeneration). Not for general UI coverage — 2 devs can't maintain a broad E2E suite |
   | **React Testing Library** | Component tests where logic lives in the component (booking card price breakdown, countdown states) |

5. **SMS OTP remains day one** (re-confirmed 2026-06-12 against a LINE-as-floor alternative; ladder in ADR-007 unchanged). The only remaining open tooling item is the **SMS provider selection** — pick during Phase 1 when wiring the ladder (~฿0.3–0.5/message Thai gateways).

## Consequences

- ✅ Every tool is the boring, maximally-documented choice for its slot — the right risk profile for a pilot whose novel risk budget is spent on escrow and AI.
- ✅ Token mapping (DESIGN_SPEC → `@theme`) keeps the "Modern Thai poolside" identity enforceable in code review — palette drift is grep-able.
- ✅ The test stack encodes priorities: the ledger gets property tests, money paths get E2E, everything else gets cheap unit tests. Test effort mirrors blast radius.
- ⚠️ Google Maps' $0 budget cap means a traffic spike degrades the map, not the bank account — acceptable; the search list works without the map.
- ⚠️ Tailwind v4 is newer than v3 with breaking config changes — pin the major version; its CSS-first config is *why* the token mapping is clean, so don't downgrade to v3 patterns.
