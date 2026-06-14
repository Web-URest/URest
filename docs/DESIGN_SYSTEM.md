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

## Identity: modern, never generic-AI

Components must *express* the "Modern Thai poolside" identity, not flatten it into a
generic Tailwind starter. Required signature elements (DESIGN_SPEC §1–3):

- **Type**: Chonburi for display/hero/big-money; Anuphan for body/UI; Sriracha ≤ once per
  page. Never Inter / system-generic.
- **Surfaces**: sand pages (never pure white); ink "back-of-house" chrome for host/admin;
  warm shadows (never gray); hairlines over shadows on sand.
- **Motifs**: `TileStrip` (pool-tile checker), `RippleHeading` (aqua squiggle), caustics
  photo placeholders, and the **`EscrowStrip`** brand component on every money screen.
- **One coral per screen** — coral marks THE money action only.
- **Motion**: 160ms ease-out; a single staggered fade-up on landing surfaces only;
  dashboards load instantly; respect `prefers-reduced-motion`.

**Failure criterion:** "looks like a generic AI/Tailwind starter" = reject and redo.
Honor the DESIGN_SPEC §1 anti-goals (not a Facebook villa page, not a generic Airbnb
clone, not corporate-bank sterile).

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
