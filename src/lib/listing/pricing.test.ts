import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  applyCommission,
  COMMISSION_RATE,
  dateKey,
  isWeekendNight,
  priceNight,
  quoteStay,
  type PricingListing,
  type PricingSeason,
} from "./pricing";

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

const baseListing: PricingListing = {
  baseWeekdaySatang: 12_900_00,
  baseWeekendSatang: 15_900_00,
  holidaySatang: 18_900_00,
  includedGuests: 8,
  extraGuestFeeSatang: 300_00,
};

const season: PricingSeason = {
  startDate: utc("2026-11-01"),
  endDate: utc("2027-02-28"),
  weekdaySatang: 14_900_00,
  weekendSatang: 17_900_00,
};

describe("isWeekendNight (Fri & Sat are weekend)", () => {
  it("classifies the week correctly", () => {
    expect(isWeekendNight(utc("2026-06-14"))).toBe(false); // Sun
    expect(isWeekendNight(utc("2026-06-18"))).toBe(false); // Thu
    expect(isWeekendNight(utc("2026-06-19"))).toBe(true); // Fri
    expect(isWeekendNight(utc("2026-06-20"))).toBe(true); // Sat
  });
});

describe("priceNight — holiday > season > base resolution", () => {
  const holidays = new Set([dateKey(utc("2026-12-05"))]); // วันพ่อ (Sat)

  it("uses base weekday/weekend outside seasons & holidays", () => {
    expect(priceNight(baseListing, utc("2026-06-17"), holidays, [])).toEqual({
      satang: baseListing.baseWeekdaySatang,
      rule: "base",
    });
    expect(priceNight(baseListing, utc("2026-06-20"), holidays, [])).toEqual({
      satang: baseListing.baseWeekendSatang,
      rule: "base",
    });
  });

  it("prefers season over base inside a season range", () => {
    // 2026-11-02 is a Monday → season weekday rate.
    expect(priceNight(baseListing, utc("2026-11-02"), holidays, [season])).toEqual({
      satang: season.weekdaySatang,
      rule: "season",
    });
  });

  it("prefers holiday over both season and base", () => {
    const r = priceNight(baseListing, utc("2026-12-05"), holidays, [season]);
    expect(r).toEqual({ satang: baseListing.holidaySatang, rule: "holiday" });
  });

  it("applies the holiday rate on the eve (night before)", () => {
    // 2026-12-04 is the eve of 12-05 → holiday rule.
    expect(priceNight(baseListing, utc("2026-12-04"), holidays, []).rule).toBe(
      "holiday",
    );
  });

  it("falls through to season/base when no holiday rate is set", () => {
    const noHoliday = { ...baseListing, holidaySatang: null };
    expect(priceNight(noHoliday, utc("2026-12-05"), holidays, [season]).rule).toBe(
      "season",
    );
  });

  it("property: every night is priced by exactly one valid rule", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 364 }),
        (offset) => {
          const d = new Date(utc("2026-01-01").getTime());
          d.setUTCDate(d.getUTCDate() + offset);
          const { satang, rule } = priceNight(baseListing, d, holidays, [season]);
          expect(["holiday", "season", "base"]).toContain(rule);
          expect(Number.isSafeInteger(satang)).toBe(true);
          expect(satang).toBeGreaterThan(0);
        },
      ),
    );
  });
});

describe("applyCommission (10% host-side)", () => {
  it("net + commission always reconstructs the gross exactly", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100_000_000 }), (gross) => {
        const { commissionSatang, netSatang } = applyCommission(gross);
        expect(commissionSatang + netSatang).toBe(gross);
        expect(Number.isSafeInteger(commissionSatang)).toBe(true);
        expect(Number.isSafeInteger(netSatang)).toBe(true);
        // commission is within rounding of the nominal 10%
        expect(Math.abs(commissionSatang - gross * COMMISSION_RATE)).toBeLessThanOrEqual(0.5);
      }),
    );
  });

  it("matches the documented example (฿15,000 booking)", () => {
    const { commissionSatang, netSatang } = applyCommission(15_000_00);
    expect(commissionSatang).toBe(1_500_00);
    expect(netSatang).toBe(13_500_00);
  });
});

describe("quoteStay", () => {
  const holidays = new Set<string>();

  it("counts nights as [checkIn, checkOut) and sums gross = nights + extra", () => {
    // Wed→Sat = 3 nights: Wed(base wd), Thu(base wd), Fri(base we)
    const q = quoteStay({
      listing: baseListing,
      seasons: [],
      holidays,
      checkIn: utc("2026-06-17"),
      checkOut: utc("2026-06-20"),
      guests: 8, // == includedGuests → no extra fee
    });
    expect(q.nights).toHaveLength(3);
    expect(q.extraGuestSatang).toBe(0);
    const nightsSum =
      baseListing.baseWeekdaySatang * 2 + baseListing.baseWeekendSatang;
    expect(q.grossSatang).toBe(nightsSum);
    expect(q.netSatang).toBe(nightsSum - q.commissionSatang);
  });

  it("adds the per-night extra-guest fee for guests over the included count", () => {
    const q = quoteStay({
      listing: baseListing,
      seasons: [],
      holidays,
      checkIn: utc("2026-06-17"),
      checkOut: utc("2026-06-19"), // 2 nights
      guests: 10, // 2 extra
    });
    expect(q.extraGuestSatang).toBe(2 * baseListing.extraGuestFeeSatang * 2);
  });
});
