# `src/components/ui/` — the U-Rest component library

These reusable components **are** the design system (DESIGN_SPEC §6 inventory). Build new
UI by composing them — reuse-first.

**Before adding or changing anything here, read [`docs/DESIGN_SYSTEM.md`](../../../docs/DESIGN_SYSTEM.md)** (the contribution contract) and `DESIGN_SPEC.md` (the visual contract).

Rules in one breath: tokens only (no hex), i18n keys only (Thai-first), server components
by default, signature "Modern Thai poolside" motifs required, and **every new/changed
component must appear in the `/styleguide` route with all its states before the PR
merges**. Decision rationale: ADR-013.
