# U-Rest design system — contribution contract

How every dev and every `afk` agent builds UI so the product stays **visually and
flow-consistent** across feature-vertical, distributed work. This is the enforceable
companion to `DESIGN_SPEC.md` (the visual contract) and ADR-013 (why the system is shaped
this way). If this file and DESIGN_SPEC disagree, DESIGN_SPEC wins.

## Source of truth

1. **Tokens** — `src/app/globals.css` `@theme` (mapped 1:1 from DESIGN_SPEC §3). The only
   place colors/radii/shadows/fonts are defined. **No invented hex** (CLAUDE.md rule 8).
2. **Components** — `src/components/ui/`. The reusable building blocks (DESIGN_SPEC §6
   inventory). These *are* the design system.
3. **Catalog** — the dev-only **`/styleguide`** route renders every component + all its
   states with the real tokens/fonts/i18n. This is where design is reviewed.

## The one rule: reuse first

> Build from `src/components/ui/`. If the component you need does not exist, **add it to
> the library and `/styleguide`** — never inline a one-off or a raw styled `<div>` in a
> page/feature.

A one-off card in a feature is how a marketplace UI drifts and starts to "look generic."
The library is the floor; features compose it.

## Non-negotiables for any UI work

- **Tokens only** — Tailwind utilities / CSS vars from `@theme`. No literal hex, no
  arbitrary radii/shadows. A genuinely new token = its own `area:design-system` PR +
  DESIGN_SPEC update (it's a frozen shared file — CONTRIBUTING shared-file protocol).
- **i18n only** — all user-facing copy via next-intl keys (CLAUDE.md rule 7), Thai-first.
  No hardcoded strings in components. Use the canonical terms in `messages/GLOSSARY.md`.
- **Server components by default** — `"use client"` only where interaction truly needs it
  (countdowns, toggles, optimistic ♡). CLAUDE.md "boring over clever".
- **States are first-class** — render booking/payout states via `StatusPill`, never as
  plain text; every state has a pill (DESIGN_SPEC §3).
- **Money** is integer satang; format only at the UI edge via `src/lib/money.ts`.

## Identity: AirBnB-grade trust marketplace (v3 — ADR-013 amendment 2026-06-21)

Components must *express* the v3 "AirBnB skin" — rose primary + retained green escrow-trust —
not flatten into an unstyled Tailwind starter. Required elements:

- **Semantic tokens only** (the contract): `--color-brand-*` (rose, primary action / links /
  active / focus / saved heart / selected), `--color-trust-*` (green, escrow-safe / verified /
  paid), `--color-error-*` (red), `--color-pending-*` (amber, pending / star ratings),
  `--color-ink/surface/border-*`. **Legacy names (`aqua/jade/teal/coral/gold/sand/line`) are
  deprecated `var()` aliases — do NOT use them in new code.** No literal hex.
- **The rose/green split is load-bearing:** brand = rose, trust = green. Never render an
  escrow/verified/paid/confirmed surface (StatusPill CONFIRMED/CHECKED_IN/COMPLETED/HELD/PAID,
  EscrowStrip dots, verified badge) in rose. The **pay/money action stays ink** (3-way split:
  ink = pay, rose = act, green = safe).
- **Type**: Prompt for display/hero; Anuphan for body/UI. Sans-only. Never Inter / system-generic.
- **Surfaces**: white pages + grey panels; **light** AirBnB-host chrome for host/admin (no ink
  back-of-house); soft neutral shadows; AirBnB radii (`rounded-card` 12 / `rounded-input` 8 /
  `rounded-pill` / `rounded-modal` 16).
- **`EscrowStrip`** (green) appears on every money screen — the brand trust component.
- **Motion**: `ease-standard`/`ease-emphasized` tokens, 120–320ms; staggered fade-up on landing
  only; dashboards load instantly; respect `prefers-reduced-motion`. Global rose `:focus-visible`
  ring is in `globals.css` — don't re-invent per component.
- **Every data-backed route ships a `loading.tsx`** (skeletons) and an empty state.

**Failure criterion:** "looks like an unstyled Tailwind starter, OR violates the rose-primary /
green-trust split" = reject and redo. (The v1/v2 "not a generic Airbnb clone" anti-goal is removed.)

## Flow consistency — same flow, same components

A feature builds the *same* states/pills/strips its flow defines (PRODUCT_FLOWS §3–5).
Use this map so two lanes don't render the same concept two ways:

| Flow (PRODUCT_FLOWS) | Reuse these (DESIGN_SPEC §6) |
|---|---|
| Home / Search §3.1 | `Topbar` `Footer` `VillaCard` `AmenityChip` `RatingStars` `TileStrip` `RippleHeading` `ActionBar` |
| Listing detail §3.1 | `PriceBreakdown` `EscrowStrip(compact)` `RatingStars` `ReviewCard` `AttractionCard` `CalendarGrid(guest)` `TrustBadge` `ReportModal` |
| Booking / payment §3.2 | `FlowStepper` `PriceBreakdown` `EscrowStrip(full)` `CountdownChip` `Button(coral)` |
| Trips §3.3 | `VillaCard` `StatusPill` `EscrowStrip(compact)` `CountdownChip` |
| Messaging §3.5 | `ChatBubble` |
| Concierge §3.1 | `ChatBubble` `ToolResultCard(villa\|attractions\|draft)` |
| Host dashboard §4 | `StatCard` `LedgerTable` `CalendarGrid(host)` `ListingSwitcher` `StatusPill` `EscrowStrip(host)` `CountdownChip` |
| Wizard / Edit §4.1/§4.4 | `WizardShell` `UploadGrid` `SeasonEditor` `BookingModeToggle` `StatusPill` |
| Admin §5 | `AdminQueueTable` `NeedsInfoChecklist` `HoldBadge` `LedgerTable` `StatusPill` `ReportModal` |
| Any money screen | `EscrowStrip` + `StatusPill` + `PriceBreakdown` — always. |

Money states use **two pill families**: the booking pill (`StatusPill`, e.g.
`CANCELLED_BY_GUEST`) is "what happened to the booking"; the payout pill (`REVERSED` →
guest-facing **REFUNDED** = "คืนเงินแล้ว") is "where's the money." Never conflate them.

## Component conventions

- One component per file, `PascalCase.tsx`, under `src/components/ui/`. Named export
  matching the file.
- Variant props are explicit unions, e.g. `EscrowStrip(variant: 'full' | 'compact',
  audience: 'guest' | 'host', step)`. Mirror the DESIGN_SPEC §6 signatures.
- `noUncheckedIndexedAccess` is on — handle `undefined` (CLAUDE.md rule 5). No `any`.
- Keep components presentational; data fetching lives in server components / `lib/`.

## Design-PR checklist (paste into the PR)

- [ ] Built from existing `src/components/ui/` — no inlined one-offs
- [ ] New/changed components added to `/styleguide` with **all** their states
- [ ] Tokens only (no literal hex / arbitrary values); i18n keys only (Thai-first)
- [ ] Signature motifs present; does **not** look like a generic AI/Tailwind starter
- [ ] State pills match PRODUCT_FLOWS (every state has a pill; booking vs money pills kept separate)
- [ ] Server component unless interaction requires `"use client"`
- [ ] Reviewed visually at `/styleguide` (TH and EN)

## See also

`DESIGN_SPEC.md` (visual contract + §9 historical gap list) · ADR-013 (workflow decision)
· ADR-008 + `messages/GLOSSARY.md` (vocabulary) · CLAUDE.md rules 1, 7, 8 · CONTRIBUTING
(shared-file protocol + lanes).
