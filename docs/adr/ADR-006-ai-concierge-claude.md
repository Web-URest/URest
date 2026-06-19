# ADR-006: AI concierge "น้องเรสต์" — Claude tool-calling, confirmation-gated booking, never-guess grounding

**Status:** Accepted · 2026-06-10, revised 2026-06-12 (grill session #3: provider locked, booking boundary extended, grounding + guardrails formalized), revised 2026-06-18 (#34: semantic search = model-ranked candidates; pgvector embeddings deferred — Decision 7)
**Implementation contract:** `docs/AI_CONCIERGE_SPEC.md` (Phase 4)

## Context

The concierge is a differentiator, not the core loop: it helps groups *find, decide, and book*. Two product requirements shape everything: **no hallucination** (a wrong "pets allowed" answer is a real-world dispute with U-Rest's name on it) and **help the guest through booking and payment** (without violating the trust brand). Two hard constraints bound the design: PromptPay — the default payment method — physically cannot be automated (the guest must scan the QR in their own banking app), and card data never touches our servers (Opn-hosted fields). Hallucination resistance is an **architecture property, not a model property**: it comes from closed-world grounding, schema-validated tools, an enforced refusal rule, and a test set that proves it.

## Decision

1. **Provider: direct Anthropic API**, official TypeScript SDK (`@anthropic-ai/sdk`), model **`claude-haiku-4-5`** (config value, not hardcoded). Cost ~฿1–1.5/conversation → ~฿350–450/month at pilot traffic, inside the ฿1,000 infra ceiling (ADR-002 context). **OpenRouter evaluated and rejected for production** (2026-06-12): ~5% credit surcharge, an extra proxy hop in a booking-adjacent flow, and translated/lagging support for exactly the features this design depends on (strict tool use, structured outputs, prompt caching). OpenRouter remains fine dev-side for model bake-offs. Sonnet 4.6 upgrade is one config line, justified only if the eval set (Decision 5) proves Haiku insufficient; hybrid Haiku→Sonnet escalation is parked in the v2 list.

2. **Seven tools, all `strict: true`** (schema-validated arguments — malformed calls are rejected at the API layer, not discovered in production):
   | Tool | Mutates? |
   |---|---|
   | `search_listings` | no |
   | `check_availability` | no |
   | `get_listing_details` (now includes host FAQ entries) | no |
   | `get_nearby_attractions` (curated table; model-ranked — pgvector deferred, see Decision 7) | no |
   | `get_saved_listings` (guest's own ที่บันทึกไว้ list; server resolves the user from session — added 2026-06-12) | no |
   | `create_booking_draft` (renders the in-chat booking-summary confirmation card) | no |
   | `submit_booking_request` | **yes — confirmation-gated** (see 3) |

3. **Boundary: AI books on a human tap, and never touches payment.**
   - `submit_booking_request` creates a real REQUESTED booking (reversible, no money) but is server-side gated on a **one-time confirmation token** issued when the guest taps the in-chat booking-summary card. Tokens are single-use, expire in 10 minutes, and are never visible to the model — the model *cannot* book without a fresh human tap, by construction rather than by prompt.
   - **Payment is a UI surface, not a tool.** When the booking enters AWAITING_PAYMENT, the *server* attaches a payment card (PromptPay QR / card link) to the chat thread, driven by booking state. The model has no payment tool, generates no QR, and never handles payment data. "AI จองให้ คุณแค่สแกนจ่าย" — the guest's banking app remains the only thing that moves money. Full autopay via card-on-file was explicitly rejected (PCI scope, PromptPay impossibility, and one wrong AI booking becoming a real charge on a trust-branded platform).

4. **Grounding: closed-world, never guess, log the gaps.**
   - Answers come only from stored data: structured listing fields, house rules, host description, host FAQ entries, curated attractions. Host-written text reaches the model wrapped in data delimiters and is treated as data-never-instructions.
   - Every factual answer must internally cite the source field (audited by the eval set; not shown to guests).
   - Missing data → the refusal script "ไม่มีข้อมูล แนะนำถามโฮสต์" + a one-tap host-thread handoff. Never a hedged general-knowledge answer — guests skim past disclaimers, and a hedged wrong answer is still a dispute.
   - **Growth loop:** every refusal writes an `UnansweredQuestion` row → admin view groups them per listing → one-click "suggest as FAQ" to the host → answer becomes a `ListingFaqEntry` (or a new wizard field if it recurs across listings). Coverage approaches "every question" over time with zero guessing ever.

5. **Guardrails are v1 launch gates for the concierge, not v2 polish:**
   - **Golden eval set** (~102 Thai cases vs. a seeded test villa: 50 fact / 20 must-refuse / 17 booking-flow incl. saved-list / 15 prompt-injection). Pass criteria: 0 hallucinated facts, 100% refusal on must-refuse, 0 injection successes. Runs as a script before any prompt or model change ships.
   - **Cost caps + kill switch:** per-user daily message cap (~30), per-conversation token ceiling, global monthly spend threshold that gracefully disables the feature ("น้องเรสต์พักผ่อน" banner — the whole site works without the AI).
   - **Injection hardening:** data delimiters around host content, read-only tools bound the blast radius (worst case is a wrong answer, never an action), and the no-payment-talk rule (the model must never relay off-platform payment instructions, even if a host FAQ contains them).

6. **Sessions:** thread per conversation, transcripts retained 12 months then purged (PDPA scope, aligns ADR-007); token usage logged per conversation (`ConciergeUsage`).

7. **Semantic search is the chat model ranking candidates — pgvector embeddings deferred (2026-06-18, #34).** At pilot scale (~15 villas, ~50 POIs/region) the candidate set fits in a tool result: `search_listings` returns candidate villas each with a host-written description snippet, `get_nearby_attractions` returns nearby POIs with descriptions + distances, and the model ranks them against what the guest described. The closed-world rule (Decision 4) already blocks fabrication, so no separate embedding index is needed for sensible Thai free-text matching at this scale. True pgvector embeddings are **explicitly deferred** because they would force a **non-Anthropic embedding provider** (Anthropic has no embeddings API) — a documented exception to the Anthropic-only stance in Decision 1 — plus an API key, a write-time embedding pipeline, and cost against the ฿1,000/mo ceiling, for negligible pilot gain. The `vector` extension stays installed/ready. **Revisit trigger:** when a region's candidate set outgrows what fits one tool result (≈ hundreds of listings) or recall visibly degrades, add `embedding vector(<dim>)` columns to `Listing` + `Attraction` + an index, and pick the embedding model/dimension then (recording the provider exception here at that point).

## Consequences

- ✅ Worst-case model failure is a wrong refusal or a bad suggestion — never a bad charge and never an unconfirmed booking; the guarantees are structural (token gate, no payment tool), not prompt-dependent.
- ✅ "No hallucination" is a tested property (eval set as launch gate), and the UnansweredQuestion → FAQ loop turns every gap into product data.
- ✅ Haiku + seven narrow tools keeps cost linear and chat-grade latency; provider portability lives in the tool layer, so a future vendor change is an SDK swap, not a redesign.
- ⚠️ **Caching caveat:** Haiku 4.5's minimum cacheable prefix is 4096 tokens — the system prompt + tool definitions may fall below it and silently not cache. Either structure the prompt to exceed the minimum or accept uncached input cost (still within budget at pilot scale). Verify via `usage.cache_read_input_tokens` in dev.
- ⚠️ Attractions data and the seeded eval villa are content tasks someone must own in Phase 4.
- ✅ Deferring embeddings (Decision 7) keeps the pilot Anthropic-only with zero new providers/keys/cost; the trade is that search recall is bounded by what fits a tool result, with a clear catalog-size revisit trigger rather than a silent ceiling.
- ⚠️ Metrics to watch (replaces the old "deflection <50%" rule): refusal rate per conversation, FAQ-conversion rate of logged questions, and booking-draft → confirmation-tap rate. A rising refusal rate means the wizard/FAQ schema is missing what guests actually ask.
