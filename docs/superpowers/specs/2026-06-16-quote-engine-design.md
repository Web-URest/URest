# Design — Pricing quote engine (`src/lib/pricing`) · issue #15

**Date:** 2026-06-16 · **Milestone:** M2 Listings · **Lane:** `area:ledger-payments` (`afk`)
**Sources of truth:** PRODUCT_FLOWS.md §3.6 step ⑤ + §summary; docs/DATA_MODEL.md (Listing/Season/ThaiHoliday); CLAUDE.md rule 1 (integer satang) & `src/lib/money.ts`.

## Context
The single pricing source for booking previews, listing calendars, and booking snapshots. It resolves a per-night price through `holiday > season > base`, adds the extra-guest fee, and reports the guest total plus the 10% host-commission split. Everything is integer satang — no floats. Pricing bugs are the worst class of bug for a trust product, so the engine is a pure, property-tested function with no DB or clock dependency.

## Scope
**In:** per-night rule resolution (incl. the Thai-holiday eve rule), weekday/weekend layers, extra-guest fee, guest total, and a host-earnings helper (10% commission / 90% payout). A single-night export for calendars and a whole-stay export for quotes.

**Out (other libs' jobs — the engine prices whatever it's given):** availability / `CalendarBlock` checks, `maxGuests` capacity enforcement, min-nights, season-overlap validation (DB constraint №2), persistence/snapshotting, and display formatting (`formatSatang` at the UI edge only).

## Architecture
- Pure module `src/lib/pricing/quote.ts` — **no Prisma import, no `Date.now()`/`new Date()` ambient clock**. Consumers fetch the rows and pass plain data in.
- Dates are **date-only `'YYYY-MM-DD'` strings** (a "night" is an Asia/Bangkok calendar date — avoids timezone drift). Day-of-week is derived deterministically via `Date.UTC(y, m-1, d)` → `getUTCDay()`.
- Reuses `src/lib/money.ts` (`assertSatang`, `sumSatang`). The only non-integer arithmetic is the single commission division, immediately rounded back to integer satang.

## Inputs (plain data — mirror the schema, not Prisma types)
```ts
type NightRule = "HOLIDAY" | "SEASON" | "BASE";
type DayKind   = "WEEKDAY" | "WEEKEND";        // WEEKEND = Fri/Sat nights; WEEKDAY = Sun–Thu

interface PricingConfig {        // from Listing
  baseWeekdaySatang: number;
  baseWeekendSatang: number;
  holidaySatang: number | null;  // null = listing has no holiday premium
  includedGuests: number;
  extraGuestFeeSatang: number;
}
interface SeasonRate {           // from Season rows for the listing
  startDate: string;             // 'YYYY-MM-DD' inclusive
  endDate: string;               // 'YYYY-MM-DD' inclusive
  weekdaySatang: number;
  weekendSatang: number;
  nameTh: string;
}
interface QuoteInput {
  config: PricingConfig;
  seasons: readonly SeasonRate[];
  holidays: ReadonlySet<string>; // 'YYYY-MM-DD' ThaiHoliday dates
  checkIn: string;               // 'YYYY-MM-DD'
  checkOut: string;              // 'YYYY-MM-DD' — EXCLUSIVE; nights = checkIn … checkOut-1
  guests: number;
}
```

## Per-night resolution (exactly one layer per night)
For a night date `D`:
1. **HOLIDAY** — iff `config.holidaySatang != null` **and** (`holidays.has(D)` **or** `holidays.has(D+1)`). The `D+1` arm is the eve rule (so Songkran Apr 13–15 → Apr 12 eve + 13–15 all price as holiday). Flat rate `holidaySatang`; no weekday/weekend split.
2. **SEASON** — else if some season covers `D` (`startDate ≤ D ≤ endDate`, inclusive). Seasons cannot overlap (DB constraint №2), so at most one matches; rate = `isWeekend(D) ? weekendSatang : weekdaySatang`.
3. **BASE** — else `isWeekend(D) ? baseWeekendSatang : baseWeekdaySatang`.

A `null` `holidaySatang` makes the holiday layer absent, so holiday nights correctly fall through to season/base.

## Extra-guest fee
Per night: `max(0, guests − includedGuests) × extraGuestFeeSatang`, summed across nights.

## Output
```ts
interface NightLine {
  date: string;          // 'YYYY-MM-DD'
  rule: NightRule;       // which layer priced it (the labeled breakdown, §3.2)
  dayKind: DayKind;      // informational; HOLIDAY is flat but still reports the day kind
  rateSatang: number;
  seasonNameTh?: string; // present iff rule === "SEASON"
}
interface Quote {
  nights: NightLine[];
  nightsSubtotalSatang: number;  // Σ rateSatang
  extraGuestFeeSatang: number;   // total across nights
  totalSatang: number;           // guest pays 100% = nightsSubtotal + extraGuest (no deposit — cash, off-platform)
  commissionSatang: number;      // round-half-up(total / 10)
  hostEarningsSatang: number;    // total − commission  (commission + hostEarnings === total, always)
  nightCount: number;
  guests: number;
}
```
Exports: `priceNight(config, seasons, holidays, date): NightLine` (single date, for calendars) and `buildQuote(input): Quote` (a stay; calls `priceNight` per night).

## Commission rounding
`commissionSatang = Math.round(totalSatang / 10)` (half rounds up), `hostEarningsSatang = totalSatang − commissionSatang`. Deriving the host side by subtraction guarantees the two always sum to the total exactly — no rounding drift. Both pass `assertSatang`.

## Error handling (throw `TypeError`/`RangeError`)
- `checkOut ≤ checkIn` (a stay is ≥ 1 night); `guests < 1`.
- Malformed date string (not `YYYY-MM-DD` / not a real calendar date).
- Any satang input that isn't a non-negative safe integer (via `assertSatang` + a `≥ 0` guard) — stops floats leaking in.

## Testing (acceptance criteria)
- **fast-check properties:** (a) every `NightLine.rule` is exactly one of the three layers and matches the precedence (holiday-or-eve+rate ⇒ HOLIDAY; in-season ⇒ SEASON; else BASE); (b) `totalSatang === sumSatang(rates) + extraGuestFeeSatang`; (c) every numeric output is `Number.isSafeInteger`; (d) `commissionSatang + hostEarningsSatang === totalSatang`.
- **Fixture cases vs hand-computed totals:** Songkran eves (Apr 12–15), Fri/Sat weekend boundaries, season-over-base precedence, `null` holidaySatang fallthrough, extra-guest fee above `includedGuests`, single-night stay.
- Plain Vitest + fast-check, in `src/lib/pricing/quote.test.ts`.

## File layout
- `src/lib/pricing/quote.ts` — types, `priceNight`, `buildQuote`, internal date helpers (`addDay`, `eachNight`, `weekdayOf`, `parseYmd`). Split date helpers into `src/lib/pricing/dates.ts` only if `quote.ts` grows unwieldy.
- `src/lib/pricing/quote.test.ts` — fixtures + properties.
No schema change, no env change, no new dependency (`fast-check` is already a devDependency).
