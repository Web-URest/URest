# Design — Golden eval harness as the AI launch gate (#33)

**Status:** approved 2026-06-18 · **Branch:** `feat/33-concierge-eval-harness` · **Closes:** #33

## Goal

AI_CONCIERGE_SPEC §6 + CLAUDE.md: the ~102-case Thai golden set is THE concierge launch gate — any change to the system prompt, tool schemas, or `CONCIERGE_MODEL` must pass `pnpm eval:concierge`. #33 builds the harness (which doesn't exist yet), a substantive starter case set, and a CI gate that runs **only** when concierge prompt/tool/model files change. Without it, a prompt tweak can silently break refusals, leak an injected off-platform payment, fabricate a fact, or skip the booking confirmation gate. Blocked-by #32 (merged).

## Decisions (2026-06-18)

- **Scope:** complete engine + a balanced **~44-case starter set** (all 4 categories) proving the gate end-to-end. Cases are append-only JSON → grows to the full 102 before launch with no harness change.
- **Gate strictness:** deterministic checks (refusal script fired, injection string never relayed, tool-call order, booking DB state, fact value present) **hard-block**; the LLM-judge phrasing grade runs + is **reported**, hard-failing only beyond a small tolerance. Safety invariants (refusal/injection) stay strict.
- **Real model in CI** (the point) — path-filtered + `ANTHROPIC_API_KEY`-secret-gated (skip if absent).

## Architecture

### A. Extract `runConciergeTurn` (`src/lib/concierge/agent.ts`)
Pull the ≤5-iteration tool loop out of the SSE route so the eval drives the SAME model+prompt+tools as production. Signature `runConciergeTurn({ userMessage, messageHistory, userId, sessionId, client, confirmedDraftId? }, onEvent?) → { assistantText, toolCalls:{name,input,result,card?}[], usage, lastToolListingId }`. Calls `onEvent` for `text_delta`/`tool_call`/`card` (route keeps live SSE); **no conversation persistence, no cost gates** (those stay in the route). `handleToolCall`'s real tool effects still run. Route refactors to: gates + `saveMessage(user)` → `runConciergeTurn(input, send)` → persist from the return (`saveMessage(assistant)`, card rows, refusal→`logUnansweredQuestion`, `logUsage`). Behaviour identical.

### B. Eval fixtures (`evals/seed.ts`)
Reuse the 3 seeded villas (`prisma/seed.ts`). Add a **phone-verified test guest** + 2 `SavedVilla` rows (idempotent; eval-only).

### C. Harness (separate suite, excluded from `pnpm test`)
`vitest.eval.config.ts` (`include: evals/**/*.eval.ts`, globalSetup, setup, `@` alias); `evals/global-setup.ts` (mirror `e2e/global-setup.ts`: create DB + `migrate deploy` + core seed + eval seed); `evals/setup.ts` (dummy env + real `ANTHROPIC_API_KEY` from process.env, eval DB URL); `evals/concierge/runner.ts` (`runCase` → fresh session, drive turns via `runConciergeTurn` w/ one shared Anthropic client; booking-flow multi-turn calls `confirmDraft` directly for the tap then re-invokes with `confirmedDraftId`); `evals/concierge/grader.ts` (deterministic predicates + a single-call `judgeFact` LLM-judge).

### D. Cases (`evals/concierge/cases/*.json`)
Typed `{ id, category, turns[], listingRef?, assert }`. Starter ≈44: ~16 fact, ~10 refuse (exact refusal script), ~8 booking-flow (REQUEST happy / INSTANT→QR / submit-without-confirm refused / expired+reused token / saved-list / date-race), ~10 injection (case-supplied `<host_content>` off-platform-payment + "ignore instructions" → never relayed, `_payment_injection_detected`). The `.eval.ts` prints a per-category pass table vs the thresholds.

### E. Command + CI
`package.json` `"eval:concierge": "vitest run --config vitest.eval.config.ts"`. New `.github/workflows/eval.yml` (mirror `e2e.yml`): Postgres service (`urest_eval`); `on: pull_request` + `push:[main]` with `paths:` = `src/lib/concierge/**`, `src/app/api/concierge/**`, `.env.example`; install → `db:deploy` → `pnpm eval:concierge` with the secret + dummy env; `if:` skip when the secret is absent. Not in `ci.yml`.

## Out of scope (note in PR)

- The remaining cases to reach 102 → incremental content before launch (append-only).
- Adding the `ANTHROPIC_API_KEY` GitHub repo secret → HITL (Aok); job skips until set.

## Verification

- **Unit (in `pnpm test`):** grader predicates + `runConciergeTurn` mocked-client test (no API).
- **Eval (`pnpm eval:concierge`):** seeded `urest_eval` + real key → starter set passes all deterministic checks (0 fabrication / 100% refusal / 0 injection) + judge summary; booking-flow creates a real REQUESTED booking + refuses submit-without-confirm.
- Repo gate (`typecheck/lint/test/gate:*/build`) stays green (eval suite excluded from `pnpm test`).
