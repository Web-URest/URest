/**
 * Listing quote engine (PRODUCT_FLOWS §4.1 ⑤, §2.3).
 *
 * Per-night price resolves in the order **holiday > season > base**; each layer
 * splits weekday (อา.–พฤ.) / weekend (ศ.–ส.), except the holiday layer which is a
 * single rate (PRODUCT_FLOWS §4.1: "One rate for public holidays + eves").
 *
 * This is Phase-2 listing pricing — the same engine the Phase-3 booking quote
 * will reuse. Money is integer satang throughout (CLAUDE.md rule 1); commission
 * is 10% host-side (PRODUCT_FLOWS §2.3). All date comparisons are UTC date-only:
 * `@db.Date` columns store midnight UTC, and a night is keyed by its own date.
 */

import { assertSatang, sumSatang } from "@/lib/money";

/** 10% commission, host-side. PRODUCT_FLOWS §2.3 / BUSINESS_PLAN. */
export const COMMISSION_RATE = 0.1;

export type PriceRule = "holiday" | "season" | "base";

/** Minimal pricing shape — a real `Listing` row satisfies it structurally. */
export interface PricingListing {
  baseWeekdaySatang: number;
  baseWeekendSatang: number;
  /** Single rate for holidays + eves; null = no holiday rate (falls to season/base). */
  holidaySatang: number | null;
  includedGuests: number;
  extraGuestFeeSatang: number;
}

/** Minimal season shape — a real `Season` row satisfies it structurally. */
export interface PricingSeason {
  startDate: Date;
  endDate: Date;
  weekdaySatang: number;
  weekendSatang: number;
}

/** UTC date-only key "YYYY-MM-DD" — the join key for holidays and night dates. */
export function dateKey(date: Date): string {
  const key = date.toISOString().slice(0, 10);
  return key;
}

/** Weekend nights are Friday & Saturday (ศ.–ส.); the rest are weekday (อา.–พฤ.). */
export function isWeekendNight(date: Date): boolean {
  const day = date.getUTCDay(); // 0=Sun … 5=Fri, 6=Sat
  return day === 5 || day === 6;
}

/** Holiday pricing applies on a holiday OR its eve (the night before). */
function isHolidayOrEve(date: Date, holidays: ReadonlySet<string>): boolean {
  if (holidays.has(dateKey(date))) return true;
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return holidays.has(dateKey(next));
}

function withinSeason(date: Date, season: PricingSeason): boolean {
  // Inclusive bounds — mirrors the Season GiST exclusion's '[]' range semantics.
  return date.getTime() >= season.startDate.getTime() &&
    date.getTime() <= season.endDate.getTime();
}

/** Price one night by the holiday > season > base resolution. */
export function priceNight(
  listing: PricingListing,
  date: Date,
  holidays: ReadonlySet<string>,
  seasons: readonly PricingSeason[],
): { satang: number; rule: PriceRule } {
  if (listing.holidaySatang != null && isHolidayOrEve(date, holidays)) {
    return { satang: assertSatang(listing.holidaySatang), rule: "holiday" };
  }
  const weekend = isWeekendNight(date);
  const season = seasons.find((s) => withinSeason(date, s));
  if (season) {
    const satang = weekend ? season.weekendSatang : season.weekdaySatang;
    return { satang: assertSatang(satang), rule: "season" };
  }
  const satang = weekend ? listing.baseWeekendSatang : listing.baseWeekdaySatang;
  return { satang: assertSatang(satang), rule: "base" };
}

/** Split a gross amount into host commission + net payout (10% host-side). */
export function applyCommission(grossSatang: number): {
  commissionSatang: number;
  netSatang: number;
} {
  assertSatang(grossSatang);
  // Round commission to whole satang; the remainder is the host's net. Rounding
  // half-up here keeps net = gross − commission exact (both integers).
  const commissionSatang = Math.round(grossSatang * COMMISSION_RATE);
  return { commissionSatang, netSatang: grossSatang - commissionSatang };
}

export interface QuotedNight {
  date: string; // dateKey
  satang: number; // nightly rate (excludes extra-guest fee)
  rule: PriceRule;
}

export interface StayQuote {
  nights: QuotedNight[];
  /** Per-night extra-guest fee × nights (0 when guests ≤ includedGuests). */
  extraGuestSatang: number;
  grossSatang: number;
  commissionSatang: number;
  netSatang: number;
}

/** Nights in [checkIn, checkOut) — one night per date, checkout day excluded. */
function* nightDates(checkIn: Date, checkOut: Date): Generator<Date> {
  const d = new Date(Date.UTC(
    checkIn.getUTCFullYear(),
    checkIn.getUTCMonth(),
    checkIn.getUTCDate(),
  ));
  const end = Date.UTC(
    checkOut.getUTCFullYear(),
    checkOut.getUTCMonth(),
    checkOut.getUTCDate(),
  );
  while (d.getTime() < end) {
    yield new Date(d.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/**
 * Quote a full stay. The reusable booking-quote primitive: prices each night,
 * adds the per-night extra-guest fee, and splits the gross 90/10 (net/commission).
 */
export function quoteStay(args: {
  listing: PricingListing;
  seasons: readonly PricingSeason[];
  holidays: ReadonlySet<string>;
  checkIn: Date;
  checkOut: Date;
  guests: number;
}): StayQuote {
  const { listing, seasons, holidays, checkIn, checkOut, guests } = args;

  const nights: QuotedNight[] = [];
  for (const date of nightDates(checkIn, checkOut)) {
    const { satang, rule } = priceNight(listing, date, holidays, seasons);
    nights.push({ date: dateKey(date), satang, rule });
  }

  const extraGuests = Math.max(0, guests - listing.includedGuests);
  const extraGuestSatang = assertSatang(
    extraGuests * listing.extraGuestFeeSatang * nights.length,
  );
  const grossSatang = sumSatang([
    ...nights.map((n) => n.satang),
    extraGuestSatang,
  ]);
  const { commissionSatang, netSatang } = applyCommission(grossSatang);

  return { nights, extraGuestSatang, grossSatang, commissionSatang, netSatang };
}
