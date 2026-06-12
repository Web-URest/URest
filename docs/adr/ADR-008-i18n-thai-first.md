# ADR-008: Thai-first i18n with next-intl

**Status:** Accepted · 2026-06-10

## Context

The audience is Thai domestic group travelers and Thai hosts; the scam-trust wedge is a Thai-market problem. English is secondary (expat organizers, future expansion). Hardcoding Thai would be fastest; hardcoding English with Thai translation files is what most starters do and reads as translated software.

## Decision

1. **next-intl** with `th` as the **default and source locale** — message files are authored in Thai first; `en` is the translation. URLs unprefixed for Thai, `/en/...` for English.
2. **Domain vocabulary is fixed in one glossary** (`messages/GLOSSARY.md`) so UI, docs, and marketing agree: ส่งคำขอก่อน (request mode), ⚡ จองทันที (instant), เงินประกัน (cash damage deposit), ถูกต้องตามกฎหมาย badge, น้องเรสต์ (concierge). DESIGN_SPEC.md typography (Chonburi/Anuphan) already assumes Thai-length strings.
3. **Dates, prices, holidays are Thai-aware in code, not in translations**: Buddhist-era display dates where users expect them, ฿ with Thai digit grouping, and the Thai public-holiday calendar table that pricing resolution (holiday > season > base) depends on.
4. LINE/email notification templates are locale-keyed through the same message files — no second template system.

## Consequences

- ✅ Thai UX is native, not translated; English comes nearly free.
- ✅ The holiday table is shared between pricing and UI — one source of truth for Songkran.
- ⚠️ Two locales double string review effort; keep `en` minimal (transactional correctness, not marketing polish) until expansion is real.
