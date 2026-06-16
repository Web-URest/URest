# Quote Engine (`src/lib/pricing`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure pricing library that resolves each night `holiday > season > base` (with the Thai-holiday eve rule), adds the extra-guest fee, and returns the guest total plus the 10% commission / 90% host split — all integer satang.

**Architecture:** One pure module `src/lib/pricing/quote.ts` (no Prisma, no ambient clock). Date-only `'YYYY-MM-DD'` strings; day-of-week via `Date.UTC`. Reuses `src/lib/money.ts`. Property + fixture tested.

**Tech Stack:** TypeScript (strict), Vitest, fast-check (both already devDependencies). Spec: `docs/superpowers/specs/2026-06-16-quote-engine-design.md`.

---

### Task 1: Types + date helpers

**Files:**
- Create: `src/lib/pricing/quote.ts`
- Test: `src/lib/pricing/quote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/pricing/quote.test.ts
import { describe, expect, it } from "vitest";

import { addDay, eachNight, isWeekend } from "./quote";

describe("date helpers", () => {
  it("isWeekend: Fri & Sat are weekend, Sun–Thu are not", () => {
    expect(isWeekend("2026-04-17")).toBe(true);  // Friday
    expect(isWeekend("2026-04-18")).toBe(true);  // Saturday
    expect(isWeekend("2026-04-19")).toBe(false); // Sunday
    expect(isWeekend("2026-04-16")).toBe(false); // Thursday
  });
  it("addDay rolls to the next calendar day across month ends", () => {
    expect(addDay("2026-04-12")).toBe("2026-04-13");
    expect(addDay("2026-01-31")).toBe("2026-02-01");
    expect(addDay("2026-12-31")).toBe("2027-01-01");
  });
  it("eachNight lists check-in … check-out-1 (check-out exclusive)", () => {
    expect(eachNight("2026-04-12", "2026-04-15")).toEqual([
      "2026-04-12",
      "2026-04-13",
      "2026-04-14",
    ]);
  });
  it("eachNight throws when check-out is not after check-in", () => {
    expect(() => eachNight("2026-04-12", "2026-04-12")).toThrow(/after check/i);
  });
  it("rejects a malformed or impossible date", () => {
    expect(() => addDay("2026-13-01")).toThrow(/date/i);
    expect(() => addDay("2026-02-30")).toThrow(/date/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: FAIL — `Failed to resolve import "./quote"` / `addDay is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/pricing/quote.ts
import { assertSatang, sumSatang } from "@/lib/money";

/**
 * Pure pricing engine (issue #15, PRODUCT_FLOWS §3.6). Per-night resolution
 * `holiday > season > base` with the Thai-holiday eve rule, extra-guest fee,
 * guest total, and the 10% commission / 90% host split — all integer satang
 * (CLAUDE.md rule 1). No Prisma, no ambient clock: callers pass plain data so
 * this stays the single, property-testable pricing source.
 *
 * Dates are date-only `YYYY-MM-DD` (a "night" is an Asia/Bangkok calendar date);
 * day-of-week is derived via `Date.UTC` to avoid timezone drift.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtcMidnight(ymd: string): number {
  if (!YMD.test(ymd)) throw new RangeError(`Invalid date (expected YYYY-MM-DD): ${ymd}`);
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const ts = Date.UTC(y, m - 1, d);
  const back = new Date(ts);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) {
    throw new RangeError(`Invalid calendar date: ${ymd}`);
  }
  return ts;
}

/** Weekend = Friday or Saturday night (PRODUCT_FLOWS §3.6: weekend = ศ.–ส.). */
export function isWeekend(ymd: string): boolean {
  const day = new Date(toUtcMidnight(ymd)).getUTCDay(); // 0=Sun … 6=Sat
  return day === 5 || day === 6;
}

/** The next calendar day, as `YYYY-MM-DD`. */
export function addDay(ymd: string): string {
  return new Date(toUtcMidnight(ymd) + DAY_MS).toISOString().slice(0, 10);
}

/** Night dates of a stay: `checkIn … checkOut-1` (check-out exclusive). */
export function eachNight(checkIn: string, checkOut: string): string[] {
  const start = toUtcMidnight(checkIn);
  const end = toUtcMidnight(checkOut);
  if (end <= start) {
    throw new RangeError(`check-out must be after check-in: ${checkIn}..${checkOut}`);
  }
  const nights: string[] = [];
  for (let t = start; t < end; t += DAY_MS) {
    nights.push(new Date(t).toISOString().slice(0, 10));
  }
  return nights;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/quote.ts src/lib/pricing/quote.test.ts
git commit -m "feat(pricing): date helpers for the quote engine (#15)"
```

---

### Task 2: `priceNight` — per-night rule resolution

**Files:**
- Modify: `src/lib/pricing/quote.ts`
- Test: `src/lib/pricing/quote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/pricing/quote.test.ts
import { priceNight, type PricingConfig, type SeasonRate } from "./quote";

const config: PricingConfig = {
  baseWeekdaySatang: 1_000_00,
  baseWeekendSatang: 1_500_00,
  holidaySatang: 3_000_00,
  includedGuests: 4,
  extraGuestFeeSatang: 200_00,
};
const season: SeasonRate = {
  startDate: "2026-11-01",
  endDate: "2026-12-31",
  weekdaySatang: 2_000_00,
  weekendSatang: 2_500_00,
  nameTh: "ไฮซีซั่น",
};

describe("priceNight", () => {
  const noHolidays = new Set<string>();
  it("BASE weekday vs weekend", () => {
    expect(priceNight(config, [], noHolidays, "2026-04-16")).toMatchObject({
      rule: "BASE", dayKind: "WEEKDAY", rateSatang: 1_000_00,
    });
    expect(priceNight(config, [], noHolidays, "2026-04-17")).toMatchObject({
      rule: "BASE", dayKind: "WEEKEND", rateSatang: 1_500_00,
    });
  });
  it("SEASON overrides BASE inside its inclusive range, with the season name", () => {
    expect(priceNight(config, [season], noHolidays, "2026-11-02")).toMatchObject({
      rule: "SEASON", rateSatang: 2_000_00, seasonNameTh: "ไฮซีซั่น",
    });
  });
  it("HOLIDAY (and its eve) overrides season/base with the flat rate", () => {
    const holidays = new Set(["2026-04-13"]); // a holiday
    expect(priceNight(config, [season], holidays, "2026-04-13").rule).toBe("HOLIDAY");
    expect(priceNight(config, [season], holidays, "2026-04-12").rule).toBe("HOLIDAY"); // eve
    expect(priceNight(config, [season], holidays, "2026-04-13").rateSatang).toBe(3_000_00);
  });
  it("a null holiday rate falls through to season/base on holiday nights", () => {
    const noHol = { ...config, holidaySatang: null };
    const holidays = new Set(["2026-11-10"]);
    expect(priceNight(noHol, [season], holidays, "2026-11-10").rule).toBe("SEASON");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: FAIL — `priceNight is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to src/lib/pricing/quote.ts (above the date helpers or below — same module)
export type NightRule = "HOLIDAY" | "SEASON" | "BASE";
export type DayKind = "WEEKDAY" | "WEEKEND";

export interface PricingConfig {
  baseWeekdaySatang: number;
  baseWeekendSatang: number;
  holidaySatang: number | null;
  includedGuests: number;
  extraGuestFeeSatang: number;
}
export interface SeasonRate {
  startDate: string; // 'YYYY-MM-DD' inclusive
  endDate: string;   // 'YYYY-MM-DD' inclusive
  weekdaySatang: number;
  weekendSatang: number;
  nameTh: string;
}
export interface NightLine {
  date: string;
  rule: NightRule;
  dayKind: DayKind;
  rateSatang: number;
  seasonNameTh?: string;
}

function assertNonNegSatang(v: number): number {
  assertSatang(v);
  if (v < 0) throw new RangeError(`Satang amount must be >= 0: ${v}`);
  return v;
}

/** Resolve one night's price. `holiday > season > base`; exactly one layer wins. */
export function priceNight(
  config: PricingConfig,
  seasons: readonly SeasonRate[],
  holidays: ReadonlySet<string>,
  date: string,
): NightLine {
  const dayKind: DayKind = isWeekend(date) ? "WEEKEND" : "WEEKDAY";

  // 1. Holiday (+ eve), only when the listing has a holiday rate.
  if (config.holidaySatang != null && (holidays.has(date) || holidays.has(addDay(date)))) {
    return { date, rule: "HOLIDAY", dayKind, rateSatang: assertNonNegSatang(config.holidaySatang) };
  }
  // 2. Season — inclusive range; lexicographic compare is chronological for YYYY-MM-DD.
  //    Seasons never overlap (DB constraint No.2), so at most one matches.
  const season = seasons.find((s) => date >= s.startDate && date <= s.endDate);
  if (season) {
    const rate = dayKind === "WEEKEND" ? season.weekendSatang : season.weekdaySatang;
    return { date, rule: "SEASON", dayKind, rateSatang: assertNonNegSatang(rate), seasonNameTh: season.nameTh };
  }
  // 3. Base.
  const rate = dayKind === "WEEKEND" ? config.baseWeekendSatang : config.baseWeekdaySatang;
  return { date, rule: "BASE", dayKind, rateSatang: assertNonNegSatang(rate) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/quote.ts src/lib/pricing/quote.test.ts
git commit -m "feat(pricing): per-night holiday>season>base resolution (#15)"
```

---

### Task 3: `buildQuote` — totals, extra-guest fee, commission split

**Files:**
- Modify: `src/lib/pricing/quote.ts`
- Test: `src/lib/pricing/quote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/pricing/quote.test.ts
import { buildQuote } from "./quote";

describe("buildQuote", () => {
  it("sums nights, adds the per-night extra-guest fee, and splits 10% commission", () => {
    // 3 weekday base nights @1000.00 = 3000.00; guests 6 > included 4 → 2 × 200.00 × 3 = 1200.00
    const q = buildQuote({
      config, seasons: [], holidays: new Set(),
      checkIn: "2026-04-13", checkOut: "2026-04-16", guests: 6, // Mon–Wed nights
    });
    expect(q.nightCount).toBe(3);
    expect(q.nightsSubtotalSatang).toBe(3_000_00);
    expect(q.extraGuestFeeSatang).toBe(1_200_00);
    expect(q.totalSatang).toBe(4_200_00);
    expect(q.commissionSatang).toBe(42_000); // round(420000/10)
    expect(q.hostEarningsSatang).toBe(3_780_00);
    expect(q.commissionSatang + q.hostEarningsSatang).toBe(q.totalSatang);
  });
  it("no extra-guest fee when guests <= includedGuests", () => {
    const q = buildQuote({
      config, seasons: [], holidays: new Set(),
      checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 4,
    });
    expect(q.extraGuestFeeSatang).toBe(0);
  });
  it("commission rounds half up (host gets the remainder, sum is exact)", () => {
    const odd: PricingConfig = { ...config, baseWeekdaySatang: 12_345, extraGuestFeeSatang: 0 };
    const q = buildQuote({
      config: odd, seasons: [], holidays: new Set(),
      checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 1,
    });
    expect(q.totalSatang).toBe(12_345);
    expect(q.commissionSatang).toBe(1_235);       // round(1234.5) = 1235
    expect(q.hostEarningsSatang).toBe(11_110);
    expect(q.commissionSatang + q.hostEarningsSatang).toBe(12_345);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: FAIL — `buildQuote is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// add to src/lib/pricing/quote.ts
export interface QuoteInput {
  config: PricingConfig;
  seasons: readonly SeasonRate[];
  holidays: ReadonlySet<string>;
  checkIn: string;
  checkOut: string; // exclusive
  guests: number;
}
export interface Quote {
  nights: NightLine[];
  nightsSubtotalSatang: number;
  extraGuestFeeSatang: number;
  totalSatang: number;
  commissionSatang: number;
  hostEarningsSatang: number;
  nightCount: number;
  guests: number;
}

/** Price a whole stay. Throws on invalid dates/guests/satang (see Task 4). */
export function buildQuote(input: QuoteInput): Quote {
  const { config, seasons, holidays, checkIn, checkOut, guests } = input;

  const nights = eachNight(checkIn, checkOut).map((d) =>
    priceNight(config, seasons, holidays, d),
  );

  const nightsSubtotalSatang = sumSatang(nights.map((n) => n.rateSatang));
  const extraGuests = Math.max(0, guests - config.includedGuests);
  const extraGuestFeeSatang = assertSatang(
    extraGuests * assertNonNegSatang(config.extraGuestFeeSatang) * nights.length,
  );
  const totalSatang = nightsSubtotalSatang + extraGuestFeeSatang;
  const commissionSatang = Math.round(totalSatang / 10);
  const hostEarningsSatang = totalSatang - commissionSatang;

  return {
    nights,
    nightsSubtotalSatang,
    extraGuestFeeSatang,
    totalSatang,
    commissionSatang,
    hostEarningsSatang,
    nightCount: nights.length,
    guests,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/quote.ts src/lib/pricing/quote.test.ts
git commit -m "feat(pricing): buildQuote totals + extra-guest fee + commission split (#15)"
```

---

### Task 4: Input validation

**Files:**
- Modify: `src/lib/pricing/quote.ts`
- Test: `src/lib/pricing/quote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/pricing/quote.test.ts
describe("buildQuote validation", () => {
  const base = { config, seasons: [], holidays: new Set<string>() };
  it("rejects check-out not after check-in", () => {
    expect(() => buildQuote({ ...base, checkIn: "2026-04-14", checkOut: "2026-04-14", guests: 2 }))
      .toThrow(/after check/i);
  });
  it("rejects guests < 1 or non-integer", () => {
    expect(() => buildQuote({ ...base, checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 0 }))
      .toThrow(/guests/i);
    expect(() => buildQuote({ ...base, checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 2.5 }))
      .toThrow(/guests/i);
  });
  it("rejects a non-integer satang rate (no floats)", () => {
    const bad = { ...config, baseWeekdaySatang: 1000.5 };
    expect(() => buildQuote({ ...base, config: bad, checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 1 }))
      .toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: FAIL — `guests 0`/`2.5` cases don't throw yet (no guard).

- [ ] **Step 3: Write minimal implementation**

Add the guest guard at the very top of `buildQuote` (the date and satang guards already throw via `eachNight` / `assertNonNegSatang`):

```ts
  // inside buildQuote, first lines:
  if (!Number.isInteger(guests) || guests < 1) {
    throw new RangeError(`guests must be a positive integer: ${guests}`);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/quote.ts src/lib/pricing/quote.test.ts
git commit -m "feat(pricing): validate dates, guests, and integer satang (#15)"
```

---

### Task 5: fast-check property tests (acceptance criteria)

**Files:**
- Test: `src/lib/pricing/quote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/pricing/quote.test.ts
import fc from "fast-check";

const ymd = (t: number) => new Date(t * 86_400_000).toISOString().slice(0, 10);

describe("properties", () => {
  // a tiny generator of a valid quote input
  const arbInput = fc.record({
    base: fc.nat({ max: 5_000_00 }),
    weekendBump: fc.nat({ max: 1_000_00 }),
    holiday: fc.option(fc.nat({ max: 9_000_00 }), { nil: null }),
    included: fc.integer({ min: 1, max: 8 }),
    extra: fc.nat({ max: 500_00 }),
    startDay: fc.integer({ min: 20_000, max: 20_100 }), // days since epoch
    nights: fc.integer({ min: 1, max: 21 }),
    guests: fc.integer({ min: 1, max: 16 }),
    holidayDays: fc.array(fc.integer({ min: 19_990, max: 20_130 }), { maxLength: 6 }),
  }).map((r) => ({
    config: {
      baseWeekdaySatang: r.base,
      baseWeekendSatang: r.base + r.weekendBump,
      holidaySatang: r.holiday,
      includedGuests: r.included,
      extraGuestFeeSatang: r.extra,
    } satisfies PricingConfig,
    seasons: [] as SeasonRate[],
    holidays: new Set(r.holidayDays.map(ymd)),
    checkIn: ymd(r.startDay),
    checkOut: ymd(r.startDay + r.nights),
    guests: r.guests,
  }));

  it("every night resolves to exactly one valid rule layer", () => {
    fc.assert(fc.property(arbInput, (input) => {
      for (const n of buildQuote(input).nights) {
        expect(["HOLIDAY", "SEASON", "BASE"]).toContain(n.rule);
        if (n.rule === "HOLIDAY") {
          expect(input.config.holidaySatang).not.toBeNull();
          expect(input.holidays.has(n.date) || input.holidays.has(addDay(n.date))).toBe(true);
        }
      }
    }));
  });

  it("total = subtotal + extra-guest, and every output is an integer satang", () => {
    fc.assert(fc.property(arbInput, (input) => {
      const q = buildQuote(input);
      expect(q.totalSatang).toBe(q.nightsSubtotalSatang + q.extraGuestFeeSatang);
      for (const v of [q.nightsSubtotalSatang, q.extraGuestFeeSatang, q.totalSatang,
                       q.commissionSatang, q.hostEarningsSatang]) {
        expect(Number.isSafeInteger(v)).toBe(true);
      }
    }));
  });

  it("commission + host earnings always equals the total (no drift)", () => {
    fc.assert(fc.property(arbInput, (input) => {
      const q = buildQuote(input);
      expect(q.commissionSatang + q.hostEarningsSatang).toBe(q.totalSatang);
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: PASS (the implementation already satisfies these; if any property fails, fix `quote.ts`, not the property).

- [ ] **Step 3: Commit**

```bash
git add src/lib/pricing/quote.test.ts
git commit -m "test(pricing): fast-check properties for rule coverage + satang invariants (#15)"
```

---

### Task 6: Fixture cases incl. Songkran eves

**Files:**
- Test: `src/lib/pricing/quote.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/pricing/quote.test.ts
describe("fixtures (hand-computed)", () => {
  // Songkran 2026: 13–15 Apr are holidays; the 12th is an eve.
  const songkran = new Set(["2026-04-13", "2026-04-14", "2026-04-15"]);
  it("prices Songkran eve + holidays at the flat holiday rate, rest at base", () => {
    // Stay 11–16 Apr 2026 → nights 11,12,13,14,15.
    // 11 Apr (Sat) = weekend base 1500.00; 12 (eve)/13/14/15 = holiday 3000.00.
    const q = buildQuote({
      config, seasons: [], holidays: songkran,
      checkIn: "2026-04-11", checkOut: "2026-04-16", guests: 4,
    });
    expect(q.nights.map((n) => n.rule)).toEqual(["BASE", "HOLIDAY", "HOLIDAY", "HOLIDAY", "HOLIDAY"]);
    expect(q.nights[0]?.rateSatang).toBe(1_500_00); // Sat base weekend
    expect(q.nightsSubtotalSatang).toBe(1_500_00 + 4 * 3_000_00);
    expect(q.totalSatang).toBe(13_500_00);
    expect(q.commissionSatang).toBe(1_350_00);
    expect(q.hostEarningsSatang).toBe(12_150_00);
  });
  it("season beats base but holiday beats season", () => {
    const s: SeasonRate = { startDate: "2026-04-01", endDate: "2026-04-30",
      weekdaySatang: 2_000_00, weekendSatang: 2_500_00, nameTh: "สงกรานต์ซีซั่น" };
    expect(priceNight(config, [s], songkran, "2026-04-13").rule).toBe("HOLIDAY"); // holiday wins
    expect(priceNight(config, [s], songkran, "2026-04-20").rule).toBe("SEASON");  // season wins over base
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm test src/lib/pricing/quote.test.ts`
Expected: PASS. If a number is off, recompute by hand and fix the expectation only if the hand-math was wrong; otherwise fix `quote.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pricing/quote.test.ts
git commit -m "test(pricing): Songkran-eve + season/holiday precedence fixtures (#15)"
```

---

### Task 7: Full gate + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Run the PR gate**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green (no `any`, `noUncheckedIndexedAccess` satisfied — note the `r.nights`/array access in tests; index with `?.` as shown).

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feat/15-quote-engine
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base main --head feat/15-quote-engine \
  --title "feat(pricing): quote engine — per-night resolution + commission split (#15)" \
  --body "Implements #15. Pure src/lib/pricing engine: holiday>season>base per-night resolution with the ThaiHoliday eve rule, weekday/weekend layers, extra-guest fee, guest total, and the 10% commission / 90% host split — all integer satang. fast-check properties (one rule layer per night; total = subtotal + extra-guest; integer-satang outputs; commission + host = total) + hand-computed fixtures incl. Songkran eves. No schema/env/dependency changes. Spec: docs/superpowers/specs/2026-06-16-quote-engine-design.md. Closes #15."
```

---

## Self-review notes (done)
- **Spec coverage:** resolution + eve rule (T2), extra-guest + total + commission (T3), validation/no-floats (T4), the four fast-check properties (T5), Songkran-eve + precedence fixtures (T6), pure/no-DB module + reuse of `money.ts` (T1/T3). All spec sections covered.
- **Types consistent:** `PricingConfig`/`SeasonRate`/`NightLine`/`QuoteInput`/`Quote` and `priceNight`/`buildQuote`/`isWeekend`/`addDay`/`eachNight` names match across tasks.
- **No placeholders:** every step has real code/commands.
