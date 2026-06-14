# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

U-Rest is a **single-context** repo: one root `docs/adr/`, no `CONTEXT-MAP.md`, no per-context
`src/<context>/docs/adr/`.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary. It does **not** exist yet; proceed silently
  when it's absent (see below).
- **`docs/adr/`** — read the ADRs that touch the area you're about to work in (ADR-001…013: payments,
  hosting, ledger, monolith, notifications, AI, auth, i18n, tooling, data protection, data model,
  in-app booking obligation, design-system workflow).
- U-Rest also keeps canonical functional/spec docs that carry domain vocabulary today: **`PRODUCT_FLOWS.md`**
  (the functional contract), **`docs/DATA_MODEL.md`**, **`docs/AI_CONCIERGE_SPEC.md`**, **`PRD.md`**, and
  **`DESIGN_SPEC.md`** + the `src/components/ui/` component library (catalogued at `/styleguide`). Treat these as the working glossary
  until `CONTEXT.md` exists.

If `CONTEXT.md` doesn't exist, **proceed silently**. Don't flag its absence or suggest creating it
upfront — `/grill-with-docs` creates it lazily when terms actually get resolved.

## File structure (single-context)

```
/
├── CONTEXT.md          ← created lazily by /grill-with-docs
├── docs/adr/
│   ├── ADR-001-payment-gateway-opn.md
│   └── … ADR-013-design-system-workflow.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test
name), use the term as defined in `CONTEXT.md` — and until that exists, the terms used in
`PRODUCT_FLOWS.md` / `docs/DATA_MODEL.md`. Don't drift to synonyms those docs explicitly avoid.

If the concept you need isn't documented yet, that's a signal — either you're inventing language the
project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding
(this mirrors CLAUDE.md's "never contradict a locked decision silently" rule):

> _Contradicts ADR-003 (append-only escrow ledger) — but worth reopening because…_
