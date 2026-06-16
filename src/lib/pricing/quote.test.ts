import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  addDay,
  buildQuote,
  eachNight,
  isWeekend,
  priceNight,
  type PricingConfig,
  type SeasonRate,
} from "./quote";

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

describe("date helpers", () => {
  it("isWeekend: Fri & Sat are weekend, Sun–Thu are not", () => {
    expect(isWeekend("2026-04-17")).toBe(true); // Friday
    expect(isWeekend("2026-04-18")).toBe(true); // Saturday
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

describe("priceNight", () => {
  const noHolidays = new Set<string>();
  it("BASE weekday vs weekend", () => {
    expect(priceNight(config, [], noHolidays, "2026-04-16")).toMatchObject({
      rule: "BASE",
      dayKind: "WEEKDAY",
      rateSatang: 1_000_00,
    });
    expect(priceNight(config, [], noHolidays, "2026-04-17")).toMatchObject({
      rule: "BASE",
      dayKind: "WEEKEND",
      rateSatang: 1_500_00,
    });
  });
  it("SEASON overrides BASE inside its inclusive range, with the season name", () => {
    expect(priceNight(config, [season], noHolidays, "2026-11-02")).toMatchObject({
      rule: "SEASON",
      rateSatang: 2_000_00,
      seasonNameTh: "ไฮซีซั่น",
    });
  });
  it("HOLIDAY (and its eve) overrides season/base with the flat rate", () => {
    const holidays = new Set(["2026-04-13"]);
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

describe("buildQuote", () => {
  it("sums nights, adds the per-night extra-guest fee, and splits 10% commission", () => {
    // 3 weekday base nights @1000.00 = 3000.00; guests 6 > included 4 → 2 × 200.00 × 3 = 1200.00
    const q = buildQuote({
      config,
      seasons: [],
      holidays: new Set(),
      checkIn: "2026-04-13",
      checkOut: "2026-04-16",
      guests: 6,
    });
    expect(q.nightCount).toBe(3);
    expect(q.nightsSubtotalSatang).toBe(3_000_00);
    expect(q.extraGuestFeeSatang).toBe(1_200_00);
    expect(q.totalSatang).toBe(4_200_00);
    expect(q.commissionSatang).toBe(42_000);
    expect(q.hostEarningsSatang).toBe(3_780_00);
    expect(q.commissionSatang + q.hostEarningsSatang).toBe(q.totalSatang);
  });
  it("no extra-guest fee when guests <= includedGuests", () => {
    const q = buildQuote({
      config,
      seasons: [],
      holidays: new Set(),
      checkIn: "2026-04-13",
      checkOut: "2026-04-14",
      guests: 4,
    });
    expect(q.extraGuestFeeSatang).toBe(0);
  });
  it("commission rounds half up (host gets the remainder, sum is exact)", () => {
    const odd: PricingConfig = { ...config, baseWeekdaySatang: 12_345, extraGuestFeeSatang: 0 };
    const q = buildQuote({
      config: odd,
      seasons: [],
      holidays: new Set(),
      checkIn: "2026-04-13",
      checkOut: "2026-04-14",
      guests: 1,
    });
    expect(q.totalSatang).toBe(12_345);
    expect(q.commissionSatang).toBe(1_235); // round(1234.5) = 1235
    expect(q.hostEarningsSatang).toBe(11_110);
    expect(q.commissionSatang + q.hostEarningsSatang).toBe(12_345);
  });
});

describe("buildQuote validation", () => {
  const base = { config, seasons: [], holidays: new Set<string>() };
  it("rejects check-out not after check-in", () => {
    expect(() =>
      buildQuote({ ...base, checkIn: "2026-04-14", checkOut: "2026-04-14", guests: 2 }),
    ).toThrow(/after check/i);
  });
  it("rejects guests < 1 or non-integer", () => {
    expect(() =>
      buildQuote({ ...base, checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 0 }),
    ).toThrow(/guests/i);
    expect(() =>
      buildQuote({ ...base, checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 2.5 }),
    ).toThrow(/guests/i);
  });
  it("rejects a non-integer satang rate (no floats)", () => {
    const bad = { ...config, baseWeekdaySatang: 1000.5 };
    expect(() =>
      buildQuote({ ...base, config: bad, checkIn: "2026-04-13", checkOut: "2026-04-14", guests: 1 }),
    ).toThrow();
  });
});

const dayToYmd = (t: number) => new Date(t * 86_400_000).toISOString().slice(0, 10);

describe("properties", () => {
  const arbInput = fc
    .record({
      base: fc.nat({ max: 5_000_00 }),
      weekendBump: fc.nat({ max: 1_000_00 }),
      holiday: fc.option(fc.nat({ max: 9_000_00 }), { nil: null }),
      included: fc.integer({ min: 1, max: 8 }),
      extra: fc.nat({ max: 500_00 }),
      startDay: fc.integer({ min: 20_000, max: 20_100 }), // days since epoch
      nights: fc.integer({ min: 1, max: 21 }),
      guests: fc.integer({ min: 1, max: 16 }),
      holidayDays: fc.array(fc.integer({ min: 19_990, max: 20_130 }), { maxLength: 6 }),
    })
    .map((r) => ({
      config: {
        baseWeekdaySatang: r.base,
        baseWeekendSatang: r.base + r.weekendBump,
        holidaySatang: r.holiday,
        includedGuests: r.included,
        extraGuestFeeSatang: r.extra,
      } satisfies PricingConfig,
      seasons: [] as SeasonRate[],
      holidays: new Set(r.holidayDays.map(dayToYmd)),
      checkIn: dayToYmd(r.startDay),
      checkOut: dayToYmd(r.startDay + r.nights),
      guests: r.guests,
    }));

  it("every night resolves to exactly one valid rule layer", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        for (const n of buildQuote(input).nights) {
          expect(["HOLIDAY", "SEASON", "BASE"]).toContain(n.rule);
          if (n.rule === "HOLIDAY") {
            expect(input.config.holidaySatang).not.toBeNull();
            expect(input.holidays.has(n.date) || input.holidays.has(addDay(n.date))).toBe(true);
          }
        }
      }),
    );
  });

  it("total = subtotal + extra-guest, and every output is an integer satang", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const q = buildQuote(input);
        expect(q.totalSatang).toBe(q.nightsSubtotalSatang + q.extraGuestFeeSatang);
        for (const v of [
          q.nightsSubtotalSatang,
          q.extraGuestFeeSatang,
          q.totalSatang,
          q.commissionSatang,
          q.hostEarningsSatang,
        ]) {
          expect(Number.isSafeInteger(v)).toBe(true);
        }
      }),
    );
  });

  it("commission + host earnings always equals the total (no drift)", () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const q = buildQuote(input);
        expect(q.commissionSatang + q.hostEarningsSatang).toBe(q.totalSatang);
      }),
    );
  });
});

describe("fixtures (hand-computed)", () => {
  // Songkran 2026: 13–15 Apr are holidays; the 12th is an eve.
  const songkran = new Set(["2026-04-13", "2026-04-14", "2026-04-15"]);
  it("prices Songkran eve + holidays at the flat holiday rate, rest at base", () => {
    // Stay 11–16 Apr 2026 → nights 11(Sat),12(eve),13,14,15.
    const q = buildQuote({
      config,
      seasons: [],
      holidays: songkran,
      checkIn: "2026-04-11",
      checkOut: "2026-04-16",
      guests: 4,
    });
    expect(q.nights.map((n) => n.rule)).toEqual([
      "BASE",
      "HOLIDAY",
      "HOLIDAY",
      "HOLIDAY",
      "HOLIDAY",
    ]);
    expect(q.nights[0]?.rateSatang).toBe(1_500_00); // Sat base weekend
    expect(q.nightsSubtotalSatang).toBe(1_500_00 + 4 * 3_000_00);
    expect(q.totalSatang).toBe(13_500_00);
    expect(q.commissionSatang).toBe(1_350_00);
    expect(q.hostEarningsSatang).toBe(12_150_00);
  });
  it("season beats base but holiday beats season", () => {
    const s: SeasonRate = {
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      weekdaySatang: 2_000_00,
      weekendSatang: 2_500_00,
      nameTh: "สงกรานต์ซีซั่น",
    };
    expect(priceNight(config, [s], songkran, "2026-04-13").rule).toBe("HOLIDAY"); // holiday wins
    expect(priceNight(config, [s], songkran, "2026-04-20").rule).toBe("SEASON"); // season over base
  });
});
