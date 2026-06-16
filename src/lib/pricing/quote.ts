import { assertSatang, sumSatang } from "@/lib/money";

/**
 * Pure pricing engine (issue #15, PRODUCT_FLOWS §3.6). Per-night resolution
 * `holiday > season > base` with the Thai-holiday eve rule, extra-guest fee,
 * guest total, and the 10% commission / 90% host split — all integer satang
 * (CLAUDE.md rule 1). No Prisma, no ambient clock: callers pass plain data so
 * this stays the single, property-testable pricing source for previews,
 * listing calendars, and booking snapshots.
 *
 * Dates are date-only `YYYY-MM-DD` (a "night" is an Asia/Bangkok calendar date);
 * day-of-week is derived via `Date.UTC` to avoid timezone drift.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

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
  endDate: string; // 'YYYY-MM-DD' inclusive
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

function toUtcMidnight(ymd: string): number {
  if (!YMD.test(ymd)) {
    throw new RangeError(`Invalid date (expected YYYY-MM-DD): ${ymd}`);
  }
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const ts = Date.UTC(y, m - 1, d);
  const back = new Date(ts);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  ) {
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
  if (
    config.holidaySatang != null &&
    (holidays.has(date) || holidays.has(addDay(date)))
  ) {
    return {
      date,
      rule: "HOLIDAY",
      dayKind,
      rateSatang: assertNonNegSatang(config.holidaySatang),
    };
  }

  // 2. Season — inclusive range; lexicographic compare is chronological for
  //    YYYY-MM-DD. Seasons never overlap (DB constraint №2), so at most one matches.
  const season = seasons.find((s) => date >= s.startDate && date <= s.endDate);
  if (season) {
    const rate = dayKind === "WEEKEND" ? season.weekendSatang : season.weekdaySatang;
    return {
      date,
      rule: "SEASON",
      dayKind,
      rateSatang: assertNonNegSatang(rate),
      seasonNameTh: season.nameTh,
    };
  }

  // 3. Base.
  const rate = dayKind === "WEEKEND" ? config.baseWeekendSatang : config.baseWeekdaySatang;
  return { date, rule: "BASE", dayKind, rateSatang: assertNonNegSatang(rate) };
}

/** Price a whole stay. Throws on invalid dates/guests/satang. */
export function buildQuote(input: QuoteInput): Quote {
  const { config, seasons, holidays, checkIn, checkOut, guests } = input;

  if (!Number.isInteger(guests) || guests < 1) {
    throw new RangeError(`guests must be a positive integer: ${guests}`);
  }

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
