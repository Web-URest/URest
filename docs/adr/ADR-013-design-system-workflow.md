# ADR-013: Design system — token-driven React components + in-app `/styleguide` (supersedes the standalone-HTML reference)

**Status:** Accepted · 2026-06-14
**Deciders:** Founding team (direction set by Aok)
**Supersedes:** the "standalone HTML is the primary design reference" decision recorded in DESIGN_SPEC §1/§9 and ADR-009 (2026-06-12).

## Context

The visual design was previously captured in a single exported file,
`design/standalone/urest-standalone.html` — a 7.1 MB self-contained HTML bundle (base64
asset blobs, not editable source). It served as the "primary interactive reference" after
the 2026-06-12 audit (DESIGN_SPEC §9). Two problems:

- **It is not maintainable.** It's a one-way export — you cannot edit a component in it,
  diff it meaningfully, or keep it in sync with the real Tailwind tokens, fonts, and
  next-intl strings the app actually renders. It drifts from production by construction.
- **It does not enforce consistency.** Work is feature-vertical across 3 devs plus `afk`
  agents (CONTRIBUTING.md). A static artifact can't stop a feature from re-inventing a
  card, a pill, or an escrow strip — which is exactly how a marketplace UI turns
  inconsistent and starts to "look generic."

The token foundation already exists and is correct: `src/app/globals.css` has a complete
Tailwind v4 `@theme` block matching DESIGN_SPEC §3, with Chonburi/Anuphan wired via
`next/font` and next-intl in place. What was missing is the component layer and a way to
see and review it.

## Decision

1. **Single source of truth = design tokens + the component library.** The tokens in
   DESIGN_SPEC §3 (implemented in `src/app/globals.css` `@theme`) and the React components
   in **`src/components/ui/`** are the design system. No re-derivation from any external
   artifact is pending — globals.css is authoritative (CLAUDE.md rule 8: tokens only, no
   invented hex).

2. **`/styleguide` is the live catalog.** A dev-only route
   (`src/app/[locale]/styleguide/page.tsx`) renders every component with all its states,
   using the real tokens/fonts/i18n, so review is visual and drift is obvious. It returns
   `notFound()` under `NODE_ENV=production` (never shipped to users).

3. **Reuse-first contribution contract.** `docs/DESIGN_SYSTEM.md` is the rule every dev
   and `afk` agent follows: build from `src/components/ui/`; if a component is missing, add
   it to the library + `/styleguide` rather than inlining a one-off; tokens-only,
   i18n-keys-only, signature motifs required; a per-flow → components map keeps screens
   building the same states/pills/strips the flows define.

4. **The "Modern Thai poolside" identity is locked, not generic.** Components must express
   the signature elements (Chonburi display type, pool-tile strips, ripple squiggles,
   caustics placeholders, the escrow strip, warm shadows, one-coral-per-screen) and honor
   the DESIGN_SPEC §1 anti-goals. "Looks like a generic Tailwind/AI starter" is a build
   defect. This is consistent with CLAUDE.md "boring over clever" — boring *engineering*
   (server components, no clever abstractions), distinctive *visual identity*.

5. **The HTML prototype is retired.** `design/standalone/urest-standalone.html` is removed
   (recoverable from git history; the static mockups it replaced are at commit `0b1b620`).
   DESIGN_SPEC §9 is kept as the *historical* audit verdict + the still-open build-checklist
   gaps (B/C items), which remain build requirements.

## Consequences

- ✅ What you review is what ships — the catalog renders through the production path
  (same Tailwind v4 `@theme`, same `next/font`, same next-intl), so no artifact-vs-app drift.
- ✅ Consistency is enforced by a contract + a visible catalog, not goodwill — distributed
  / `afk` work has one place to look and one rule ("reuse or add to the library").
- ✅ Zero new tooling/cost: no Storybook, no extra build step, nothing added to the
  ฿1,000/month ceiling or the `pnpm typecheck && lint && test` gate. (Storybook was
  considered and deferred — Tailwind v4 + Next 15 setup cost isn't worth it at this scale;
  revisit if the component count and team capacity grow.)
- ⚠️ `globals.css` `@theme` stays a frozen shared file (CONTRIBUTING shared-file protocol):
  a genuinely new token needs an `area:design-system` PR + a DESIGN_SPEC update, not an
  ad-hoc hex in a component.
- ⚠️ The catalog only has value if it stays complete — every new/changed component must
  appear in `/styleguide` with its states *before* the PR merges (enforced via the
  DESIGN_SYSTEM.md design-PR checklist).
- ⚠️ Phase 1 builds only a first batch of components (StatusPill, EscrowStrip, Button,
  VillaCard); the rest of the DESIGN_SPEC §6 inventory lands per-feature in its phase
  (CLAUDE.md "don't build ahead").

## Amendment — 2026-06-21: Identity v2 "Clean & Modern" (supersedes Decision 4)

**Decider:** Aok (lead). The v1 "Modern Thai poolside" identity (Decision 4 above; DESIGN_SPEC
§1/§3) rendered, in practice, as a generic warm-cream/serif look — the exact "looks like an AI
starter" failure it was meant to avoid. After grilling and a shareable proof artifact (approved
before any code), the visual identity is replaced. **Behaviour/contract is unchanged** — only the
skin: PRODUCT_FLOWS state machines, integer-satang money, and Thai-first i18n all stand.

- **v2 identity:** white surfaces, near-black ink text, a single **emerald** trust-accent (means
  safe / verified / paid), warm **amber** (pending, star ratings), clean **red** (cancel / frozen /
  error). **Sans-only** type: **Prompt** (display) + **Anuphan** (body) via `next/font`; Chonburi
  serif and the Sriracha accent are dropped. Motifs retired: pool-tile `TileStrip` → a thin emerald
  rule; aqua "caustics" placeholders → a calm neutral wash; ripple squiggle → gone. The money
  action is solid **ink** (supersedes "one coral per screen").
- **Implementation = value-remap, not rename.** The `@theme` token VALUES in
  `src/app/globals.css` were remapped to the v2 palette while the token NAMES were kept (≈440
  usages across ~100 files) to avoid a high-risk mass rename. Read the role, not the name
  (`aqua`/`jade`/`teal` = emerald, `coral` = red, `gold` = amber, `sand` = white/gray). This naming
  debt is documented at the top of globals.css; an optional semantic rename is tracked as Phase-B
  cleanup.
- **Unchanged:** `globals.css @theme` remains the frozen single source of truth (CLAUDE.md rule 8);
  `/styleguide` remains the live catalog; the reuse-first contract and design-PR checklist stand.
  DESIGN_SPEC §3 is annotated as historical-v1 — current values live in globals.css.
- **Rollout:** prove-first (tokens → component library → `/styleguide` → landing page), then a
  per-page cascade (Phase B), each a small PR per CONTRIBUTING; `area:design-system`, Aok integrates
  the frozen shared file.

## Amendment — 2026-06-21: Identity v3 "AirBnB skin" (supersedes the v2 Amendment's skin)

**Decider:** Aok (lead). U-Rest adopts a full **AirBnB-style** marketplace skin across the whole app
(all consumer pages, the floating AI concierge, and — newly — host + admin). **Behaviour/contract is
unchanged** — PRODUCT_FLOWS state machines, integer-satang money, webhook idempotency, the eval-gated
AI logic, and Thai-first i18n all stand. Only the skin changes.

- **Identity:** rose **"Rausch" `#ff385c`** is the brand / primary-action color; a dedicated **trust
  green `#0b7a5b`** (the kept v2 emerald) means escrow-safe / verified / paid; **red** = cancel /
  frozen / error; **amber** = pending / star ratings. Because **trust is the product**, brand (rose)
  and trust (green) are deliberately DIFFERENT roles (v2 had collapsed them into one emerald). This
  dual rose+green mirrors AirBnB's own rose+teal palette and is the brand, **not** a clone tell. The
  pay/money action stays solid **ink** (a 3-way split: ink = pay, rose = act, green = safe).
- **The DESIGN_SPEC §1 anti-goal "must NOT look like a generic Airbnb clone" is REMOVED.** New
  identity statement: *"AirBnB-grade trust marketplace — rose primary + retained green escrow-trust."*
  The failure criterion becomes "looks like an unstyled Tailwind starter, OR violates the
  rose-primary / green-trust split."
- **Token mechanism = additive semantic layer + value-remap aliases + a narrow CTA migration**
  (supersedes v2's "value-remap, keep names"). `--color-brand-*` / `--color-trust-*` / `--color-error-*`
  / `--color-pending-*` / `--color-ink-*` / `--color-surface-*` / `--color-border(-subtle)` are now the
  **contract**; new code MUST use them. Legacy `aqua/jade/teal/coral/gold/sand/line` are **deprecated
  `var()` aliases** retained only to avoid the ~440-usage sweep (verified: Tailwind v4 still emits the
  aliased utilities). Only ~30–40 *primary-action* sites were hand-migrated emerald→rose.
- **Fonts unchanged** (Prompt display + Anuphan body, via `next/font`): Thai-first is non-negotiable,
  the ฿1k/month ceiling favors free Google Fonts, and AirBnB's Cereal has **no Thai coverage**.
- **Back-of-house goes LIGHT** (supersedes §4/§5.7/§5.9 ink "back-of-house" chrome): host + admin use
  the clean light AirBnB-host look so they reuse the guest component system (no dark variants), and
  trust/paid/frozen states read correctly on light. The "separate surface" boundary is preserved by
  distinct nav + the separate `/admin` cookie + `role=ADMIN`/TOTP surface — **not** by darkness.
- **`@theme` is unfrozen for this one v3 branch**; Aok integrates; it re-freezes after. `/styleguide`
  remains the live catalog and the design gate; the reuse-first contract and design-PR checklist stand.
