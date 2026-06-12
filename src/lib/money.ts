/**
 * Money convention (ADR-003, repo-wide rule):
 * ALL monetary amounts are integer satang (1 baht = 100 satang).
 * No floats, no `number` meaning baht, anywhere — including Prisma fields,
 * API payloads, and component props. Convert to baht strings only at display.
 */

/** Brand-ish guard: throws if a value can't be an exact satang amount. */
export function assertSatang(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Not an integer satang amount: ${value}`);
  }
  return value;
}

/** Whole-baht input (e.g. host types ฿12,900) → satang. Rejects fractions. */
export function satangFromBaht(baht: number): number {
  const satang = baht * 100;
  if (!Number.isSafeInteger(satang)) {
    throw new TypeError(`Baht amount has sub-satang precision: ${baht}`);
  }
  return satang;
}

/** Sum that refuses to silently mix in non-integer amounts. */
export function sumSatang(amounts: readonly number[]): number {
  return amounts.reduce<number>((acc, a) => acc + assertSatang(a), 0);
}

/**
 * Display formatting: ฿12,900 for whole baht, ฿12,900.50 otherwise.
 * Thai digit grouping. Display layer ONLY — never parse this back.
 */
export function formatSatang(satang: number): string {
  assertSatang(satang);
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(satang);
  const baht = Math.floor(abs / 100);
  const fraction = abs % 100;
  const grouped = baht.toLocaleString("th-TH");
  return fraction === 0
    ? `${sign}฿${grouped}`
    : `${sign}฿${grouped}.${fraction.toString().padStart(2, "0")}`;
}
