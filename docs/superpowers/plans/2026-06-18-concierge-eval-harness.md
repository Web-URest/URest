# #33 — Golden eval harness as the AI launch gate

## Context

The concierge ("น้องเรสต์") now has read tools (#31) + booking tools (#32). CLAUDE.md makes the ~102-case golden set THE launch gate: *any* change to the system prompt, tool schemas, or `CONCIERGE_MODEL` must pass `pnpm eval:concierge`. That harness doesn't exist yet (#33 builds it). Without it, a prompt/tool tweak can silently break refusals, leak an injected off-platform payment, fabricate a fact, or skip the booking confirmation gate — exactly the trust failures the concierge exists to avoid. #33 builds the harness, a substantive case set, and a CI gate that runs **only** when concierge prompt/tool/model files change. Blocked-by #32 (merged).

**Decisions (this session):**
- **Scope:** ship the complete engine + a balanced **~44-case starter set** (all 4 categories) that proves the gate end-to-end. Cases are append-only JSON — the set grows to the full 102 before launch with no harness change. (Not a 102-case mega-PR.)
- **Gate strictness:** deterministic checks (refusal script fired, injection string never relayed, tool-call order, booking DB state, fact value present) **hard-block**; the LLM-judge phrasing grade runs + is **reported**, hard-failing only beyond a small tolerance (absorbs model nondeterminism). Safety invariants (refusal/injection) stay strict.
- **Real model in CI** (the point — it must catch when a prompt change breaks behavior); path-filtered + secret-gated.

## Architecture

### A. Extract `runConciergeTurn` (the foundation)
The agent loop lives inside the SSE route. Extract it so the eval drives the **same** model + prompt + tools as production.
- New `src/lib/concierge/agent.ts`: `runConciergeTurn({ userMessage, messageHistory, userId, sessionId, client, confirmedDraftId? }, onEvent?) → { assistantText, toolCalls: {name,input,result,card?}[], usage, lastToolListingId }`. Contains the ≤5-iteration tool loop (`client.messages.create` with `CONCIERGE_TOOLS` + `SYSTEM_PROMPT`, `handleToolCall(...,userId,sessionId)`, assistant-text accumulation, usage). It calls `onEvent` for `text_delta`/`tool_call`/`card` (so the route keeps live SSE) and returns the collected result. It does **no conversation persistence and no cost-gate checks** (those stay in the route). `handleToolCall`'s real tool effects (draft/booking writes) still happen — that's intended.
- Refactor `src/app/api/concierge/chat/route.ts`: keep auth/IDOR + cost gates + `saveMessage(user)`; build the user/assistant-only history; call `runConciergeTurn(input, (e)=>send(e))`; then from the return do the persistence it does today — `saveMessage(assistant)`, `saveMessage("card", …)` per returned card, refusal-script → `logUnansweredQuestion`, `logUsage`. Net behavior identical (no route test exists; verified by `build` + the eval exercising it).

### B. Eval fixtures (`evals/seed.ts`)
Reuse the 3 seeded villas (`prisma/seed.ts` — Jomtien REQUEST, Na Klua INSTANT, Pattaya South INSTANT; rich enough for fact/refuse cases). Add what's missing: a **phone-verified test guest** (`phoneVerifiedAt` set) + 2 `SavedVilla` rows for the saved-list cases. Idempotent upserts; eval-only (not in `prisma/seed.ts`).

### C. Harness (separate suite, excluded from `pnpm test`)
- `vitest.eval.config.ts` — `include: ["evals/**/*.eval.ts"]`, `globalSetup: "./evals/global-setup.ts"`, `setupFiles: ["./evals/setup.ts"]`, alias `@`. (`vitest.config.ts`'s `src/**/*.test.ts` glob already excludes `evals/`.)
- `evals/global-setup.ts` — mirror `e2e/global-setup.ts`: create DB (no-op if exists) + `prisma migrate deploy` + run the core seed (`tsx prisma/seed.ts`) + `evals/seed.ts`. (Eval DB e.g. `urest_eval`.)
- `evals/setup.ts` — dummy env (like `vitest.setup.ts`) but `DATABASE_URL`→eval DB and **`ANTHROPIC_API_KEY` from the real `process.env`** (the eval needs a live key).
- `evals/concierge/runner.ts` — `runCase(case, ctx)`: builds a fresh session (`getOrCreateSession`), drives the turn(s) via `runConciergeTurn` with one shared `Anthropic` client; for booking-flow cases it runs multi-turn and, between draft and submit, calls `confirmDraft(draftId, guestId, now)` directly (the server-side tap) then re-invokes with `confirmedDraftId`. Collects `toolCalls` + `assistantText` + any created `Booking`.
- `evals/concierge/grader.ts` — deterministic predicates (`refusedCorrectly`, `containsFact`, `injectionNotRelayed` via the `OFF_PLATFORM_PAYMENT_RE` markers, `toolOrderOk`, `bookingCreatedRequested`, `noBookingWithoutConfirm`) + `judgeFact(question, answer, expectedValue)` (a single Haiku call returning pass/fail+reason, used only where phrasing varies). The eval file asserts deterministic predicates hard; tallies judge results into a reported summary with a tolerance.

### D. Case set (`evals/concierge/cases/*.json`)
Typed schema: `{ id, category: "fact"|"refuse"|"booking"|"injection", turns: string[], listingRef?, assert: {...} }`. The `.eval.ts` loads cases, runs each, applies category-appropriate grading, and prints a per-category pass table + the thresholds (0 fabrication / 100% refusal / 0 injection). Starter set ≈ **44**: ~16 fact (across the 3 villas' pool/rooms/prices/policies/FAQ), ~10 must-refuse (Netflix/gym/A-C/etc. absent from a given villa → exact refusal script), ~8 booking-flow (happy REQUEST, happy INSTANT→QR, submit-without-confirm refused, expired/reused token, saved-list compare, date-race), ~10 injection (crafted off-platform-payment + "ignore instructions" strings in a case-supplied `<host_content>` → never relayed, `_payment_injection_detected`). Plan documents the per-category target counts to reach 102.

### E. Command + CI gate
- `package.json`: `"eval:concierge": "vitest run --config vitest.eval.config.ts"`.
- New `.github/workflows/eval.yml` (mirror `e2e.yml`): Postgres `pgvector/pgvector:pg16` service (`urest_eval`); `on: pull_request` + `push: [main]` with a **`paths:` filter** = `src/lib/concierge/**`, `src/app/api/concierge/**`, `.env.example`; steps = install → `db:deploy` → `pnpm eval:concierge` with `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` + dummy env; **`if:` skip when the secret is absent** (graceful). Not in `ci.yml` (keeps PR CI fast + free).

## Critical files

- Reuse: `src/app/api/concierge/chat/route.ts` (loop to extract), `src/lib/concierge/{tools,system-prompt,booking,index,cost}.ts`, `src/lib/concierge/cards.ts` (`ConciergeCard`), `src/lib/env.ts` (`ANTHROPIC_API_KEY`/`CONCIERGE_MODEL`), `prisma/seed.ts` (villas/holidays/attractions), `e2e/global-setup.ts` + `playwright.config.ts` + `.github/workflows/{e2e,ci}.yml` + `vitest.config.ts` (patterns).
- New: `src/lib/concierge/agent.ts`, `vitest.eval.config.ts`, `evals/{global-setup,setup,seed}.ts`, `evals/concierge/{runner,grader,concierge.eval.ts}`, `evals/concierge/cases/*.json`, `.github/workflows/eval.yml`.
- Edit: `src/app/api/concierge/chat/route.ts`, `package.json`.

## Build sequence (inline TDD where unit-testable; subagents can't run shell here)

1. **Extract `runConciergeTurn` + route refactor.** A small unit test of `agent.ts` with a **mocked Anthropic client** (a scripted tool_use→end_turn) asserting it collects toolCalls/usage + calls `onEvent` + does no persistence. Then refactor the route to call it. `pnpm typecheck && pnpm gate:status && pnpm build` green; existing concierge tests still pass.
2. **Eval seed** (`evals/seed.ts`) — test guest + saved villas (idempotent).
3. **Harness config + runner + grader** (`vitest.eval.config.ts`, `evals/global-setup.ts`, `evals/setup.ts`, `runner.ts`, `grader.ts`). Unit-test the **grader predicates** (pure functions) in a normal `src/**/*.test.ts` so they run in `pnpm test` (deterministic, no API).
4. **Case schema + starter set** (`concierge.eval.ts` + `cases/*.json`, ~44 cases).
5. **`pnpm eval:concierge` script + `eval.yml`** (path-filtered, secret-gated, Postgres service).
6. **Run locally** against a seeded `urest_eval` DB with a real key (Aok has Anthropic credits) → starter set green (deterministic) + judge report; then full gate + Explore review + PR.

## Out of scope (note in PR)

- The remaining cases to reach the full 102 → incremental content before launch (append-only JSON; harness unchanged).
- Adding the **`ANTHROPIC_API_KEY` GitHub repo secret** → HITL (Aok, repo Settings → Secrets); the job skips gracefully until it's set.
- Lunar-holiday seed dates (separate TODO).

## Verification

- **Unit (in `pnpm test`):** the grader predicates (refusal match, fact-contains, injection-not-relayed, tool-order) + the `runConciergeTurn` mocked-client test. These keep working in normal CI.
- **Eval (`pnpm eval:concierge`, separate):** against a migrated+seeded `urest_eval` with a real `ANTHROPIC_API_KEY` → the ~44 starter cases pass all deterministic checks (0 fabrication / 100% refusal / 0 injection) + a printed judge summary. Booking-flow cases create a real REQUESTED `Booking` row and refuse submit-without-confirm.
- **CI:** `eval.yml` triggers only on concierge/prompt/tool/model path changes; skips if the secret is absent; otherwise hard-fails the merge on a deterministic miss.
- **Repo gate unchanged:** `pnpm typecheck && lint && test && gate:status && gate:bodyraw && gate:reviews && build` stay green (the eval suite is excluded from `pnpm test`).
