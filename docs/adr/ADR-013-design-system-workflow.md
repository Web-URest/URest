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
